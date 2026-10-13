/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

// workers/mainWorker.ts
// Improved campaign worker: renewable job lease, batch report claiming,
// safe pause handling, bounded concurrent sends, and performance logging.

require('dotenv').config({ path: '.env.local' });

import { randomUUID } from 'crypto';
import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import CampaignReport from '../models/CampaignReport';
import User from '../models/User';
import Message from '../models/Message';
import Session from '../models/Session';
import mongoose from 'mongoose';
import { syncCampaignToGoogleSheet } from '../lib/googleSheetSync';
import { Job, Cache } from '../lib/queue';
import { getPriceForCategory } from '../lib/billing';

const CAMPAIGN_QUEUE = 'campaign-processing';
const REPORT_BATCH_SIZE = Math.max(1, Number(process.env.CAMPAIGN_BATCH_SIZE || 20));
const SEND_CONCURRENCY = Math.max(1, Number(process.env.CAMPAIGN_SEND_CONCURRENCY || 20));
const JOB_LEASE_MS = 2 * 60 * 1000;
const JOB_HEARTBEAT_MS = 30 * 1000;
const REPORT_LEASE_MS = 3 * 60 * 1000;
const REPORT_HEARTBEAT_MS = 30 * 1000;
const META_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
const BATCH_PAUSE_MS = Math.max(0, Number(process.env.CAMPAIGN_BATCH_PAUSE_MS || 100));

connectDB()
  .then(async () => {
    console.log('✅ Main Worker connected to MongoDB');
    console.log(`⚙️ Campaign config: batch=${REPORT_BATCH_SIZE}, concurrency=${SEND_CONCURRENCY}, pause=${BATCH_PAUSE_MS}ms`);
    startInactivityWorker();
    startCampaignWorker();
    startWorker('counts-processing', async (job) => {
      if (job.name === 'generate-counts') {
        return generateCountsData(job.data.userId, job.data.page, job.data.limit, job.data.cacheKey, job.data.lockKey);
      }
      return null;
    }, 5);
    console.log('🚀 Standalone main worker process started.');
  })
  .catch((err) => {
    console.error('❌ Worker process failed:', err);
    process.exit(1);
  });

export async function ensureDbConnected() {
  if (mongoose.connection.readyState !== 1) await connectDB();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function startWorker(queueName: string, processor: (job: any) => Promise<any>, concurrency = 1) {
  for (let i = 0; i < concurrency; i++) {
    (async () => {
      while (true) {
        try {
          await ensureDbConnected();
          const now = new Date();
          const job = await Job.findOneAndUpdate(
            {
              queue: queueName,
              $or: [
                { status: 'pending' },
                { status: 'processing', lockedAt: { $lt: new Date(now.getTime() - JOB_LEASE_MS) } },
              ],
            },
            { $set: { status: 'processing', lockedAt: now } },
            { sort: { createdAt: 1 }, returnDocument: 'after' },
          ).lean();

          if (!job) {
            await sleep(1000);
            continue;
          }

          const heartbeat = setInterval(() => {
            Job.updateOne({ _id: job._id, status: 'processing' }, { $set: { lockedAt: new Date() } })
              .catch((e: { message: any; }) => console.error(`[${queueName}] heartbeat failed:`, e?.message || e));
          }, JOB_HEARTBEAT_MS);

          try {
            const result = await processor({ id: job._id.toString(), name: job.name, data: job.data });
            if (job.opts?.removeOnComplete || job.opts?.removeOnFail) {
              await Job.deleteOne({ _id: job._id });
            } else {
              await Job.updateOne({ _id: job._id }, { $set: { status: 'completed', result }, $unset: { lockedAt: 1 } });
            }
          } catch (err: any) {
            console.error(`[${queueName}] job ${job._id} failed:`, err?.stack || err);
            await Job.updateOne(
              { _id: job._id },
              { $set: { status: 'failed', error: err?.message || 'Unknown worker error' }, $unset: { lockedAt: 1 } },
            ).catch(() => {});
          } finally {
            clearInterval(heartbeat);
          }
        } catch (err: any) {
          console.error(`[${queueName}] polling error:`, err?.message || err);
          await sleep(2000);
        }
      }
    })();
  }
}

// ---------------------------------------------------------------------------
// CAMPAIGN WORKER
// ---------------------------------------------------------------------------

async function startCampaignWorker() {
  console.log(`🚀 Worker started for ${CAMPAIGN_QUEUE}`);

  while (true) {
    let job: any = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      await ensureDbConnected();
      const now = new Date();
      job = await Job.findOneAndUpdate(
        {
          queue: CAMPAIGN_QUEUE,
          $or: [
            { status: 'pending' },
            { status: 'processing', lockedAt: { $lt: new Date(now.getTime() - JOB_LEASE_MS) } },
          ],
        },
        { $set: { status: 'processing', lockedAt: now } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      ).lean();

      if (!job) {
        await sleep(750);
        continue;
      }

      heartbeat = setInterval(() => {
        Job.updateOne({ _id: job._id, status: 'processing' }, { $set: { lockedAt: new Date() } })
          .catch((e: { message: any; }) => console.error('[campaign-processing] heartbeat failed:', e?.message || e));
      }, JOB_HEARTBEAT_MS);

      if (job.name !== 'process-campaign') {
        await Job.deleteOne({ _id: job._id });
        continue;
      }

      const result = await processCampaignLoop(job.data, job._id);

      // IMPORTANT: paused jobs are deliberately kept pending by processCampaignLoop.
      // Do not delete them here or the campaign cannot resume.
      if (result === 'paused') {
        console.log(`⏸ Campaign job ${job._id} paused and returned to queue.`);
      } else {
        await Job.deleteOne({ _id: job._id });
      }
    } catch (err: any) {
      console.error('[campaign-processing] worker error:', err?.stack || err);
      // Leave a failed campaign job visible for diagnosis rather than silently deleting it.
      if (job?._id) {
        await Job.updateOne(
          { _id: job._id },
          { $set: { status: 'failed', error: err?.message || 'Campaign worker error' }, $unset: { lockedAt: 1 } },
        ).catch(() => {});
      }
      await sleep(1500);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
  }
}

async function claimReportBatch(campaignId: any, limit: number) {
  // Use the native collection to avoid Mongoose strict-schema stripping the lease fields.
  // Each candidate is claimed conditionally, so two workers cannot both claim the same report.
  const collection = CampaignReport.collection;
  const candidates = await collection
    .find({ campaignId: new mongoose.Types.ObjectId(String(campaignId)), status: 'pending' }, { projection: { _id: 1 } })
    .sort({ index: 1 })
    .limit(limit)
    .toArray();

  if (!candidates.length) return { token: '', reports: [] as any[] };

  const token = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + REPORT_LEASE_MS);
  await collection.bulkWrite(
    candidates.map((candidate: any) => ({
      updateOne: {
        filter: { _id: candidate._id, status: 'pending' },
        update: { $set: { status: 'queued', workerClaimToken: token, leaseExpiresAt, queuedAt: new Date() } },
      },
    })),
    { ordered: false },
  );

  const reports = await collection
    .find({ campaignId: new mongoose.Types.ObjectId(String(campaignId)), status: 'queued', workerClaimToken: token })
    .sort({ index: 1 })
    .toArray();

  return { token, reports };
}

async function renewReportLease(campaignId: any, token: string) {
  if (!token) return;
  await CampaignReport.collection.updateMany(
    { campaignId: new mongoose.Types.ObjectId(String(campaignId)), status: 'queued', workerClaimToken: token },
    { $set: { leaseExpiresAt: new Date(Date.now() + REPORT_LEASE_MS) } },
  );
}

async function releaseClaimedReports(campaignId: any, token: string) {
  if (!token) return;
  await CampaignReport.collection.updateMany(
    { campaignId: new mongoose.Types.ObjectId(String(campaignId)), status: 'queued', workerClaimToken: token },
    { $set: { status: 'pending' }, $unset: { workerClaimToken: 1, leaseExpiresAt: 1, queuedAt: 1 } },
  );
}

async function recoverExpiredReports(campaignId: any) {
  const now = new Date();
  const result = await CampaignReport.collection.updateMany(
    { campaignId: new mongoose.Types.ObjectId(String(campaignId)), status: 'queued', leaseExpiresAt: { $lt: now } },
    { $set: { status: 'pending' }, $unset: { workerClaimToken: 1, leaseExpiresAt: 1, queuedAt: 1 } },
  );
  if (result.modifiedCount) {
    console.warn(`[campaign ${campaignId}] Recovered ${result.modifiedCount} expired report lease(s).`);
  }
}

async function processCampaignLoop(data: any, jobId: any): Promise<'paused' | 'finished' | 'stopped'> {
  const { campaignId, userId, payerId, PHONE_NUMBER_ID, ACCESS_TOKEN } = data;
  await ensureDbConnected();

  // Legacy queued reports without leases may remain from the previous worker version.
  // Deployment note: stop ALL old worker processes before deploying this version.
  await CampaignReport.collection.updateMany(
    {
      campaignId: new mongoose.Types.ObjectId(String(campaignId)),
      status: 'queued',
      leaseExpiresAt: { $exists: false },
    },
    { $set: { status: 'pending' }, $unset: { workerClaimToken: 1, queuedAt: 1 } },
  );

  const payer: any = await User.findById(payerId).lean();
  if (!payer) {
    console.error(`[campaign ${campaignId}] Payer not found; marking campaign failed.`);
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: 'failed' } });
    return 'stopped';
  }

  let headerFormat = '';
  let lastStatusCheck = 0;
  let campaign: any = null;
  let totalApiMs = 0;
  let totalApiRequests = 0;

  while (true) {
    await ensureDbConnected();
    if (Date.now() - lastStatusCheck >= 2000 || !campaign) {
      campaign = await Campaign.findById(campaignId).lean();
      lastStatusCheck = Date.now();
    }

    if (!campaign) {
      await releaseAnyExpiredAndFinish(campaignId);
      return 'stopped';
    }

    if (campaign.status === 'paused') {
      await releaseClaimedReportsForCampaign(campaignId);
      await Job.updateOne({ _id: jobId }, { $set: { status: 'pending' }, $unset: { lockedAt: 1 } });
      console.log(`⏸ Campaign ${campaign.name} paused.`);
      return 'paused';
    }

    if (campaign.status === 'stopped' || campaign.status === 'completed' || campaign.status === 'failed') {
      console.log(`⏹ Campaign ${campaign.name} status is ${campaign.status}; exiting.`);
      return 'stopped';
    }

    if (!headerFormat) {
      headerFormat = cleanStr(campaign.templateHeaderFormat || '');
      if (!headerFormat) {
        headerFormat = await fetchTemplateHeaderFormat(
          PHONE_NUMBER_ID,
          ACCESS_TOKEN,
          cleanStr(campaign.templateName).toLowerCase(),
          cleanStr(campaign.languageCode || 'en'),
          cleanStr(campaign.mediaType || 'none'),
        );
        await Campaign.updateOne({ _id: campaignId }, { $set: { templateHeaderFormat: headerFormat } });
      }
    }

    // Requeue only expired claims. Active reports are protected by their lease heartbeat.
    await recoverExpiredReports(campaignId);

    const { token, reports } = await claimReportBatch(campaignId, REPORT_BATCH_SIZE);

    if (!reports.length) {
      const [pendingCount, queuedCount] = await Promise.all([
        CampaignReport.countDocuments({ campaignId, status: 'pending' }),
        CampaignReport.countDocuments({ campaignId, status: 'queued' }),
      ]);

      if (pendingCount === 0 && queuedCount === 0) {
        await Campaign.updateOne(
          { _id: campaignId, status: { $nin: ['paused', 'stopped', 'failed'] } },
          { $set: { status: 'completed', completedAt: new Date() } },
        );
        console.log(`✅ Campaign ${campaign.name} fully processed. API requests=${totalApiRequests}, avg API latency=${totalApiRequests ? Math.round(totalApiMs / totalApiRequests) : 0}ms`);
        try {
          const finalCampaign = await Campaign.findById(campaignId).lean();
          const plainReportData = await CampaignReport.find({ campaignId })
            .select('name phone status error replies reply tags additionalData -_id')
            .lean();
          await syncCampaignToGoogleSheet(userId, {
            name: finalCampaign?.name || 'Campaign',
            reportData: plainReportData,
          });
        } catch (e: any) {
          console.error(`[campaign ${campaignId}] Google Sheets sync failed:`, e?.message || e);
        }
        return 'finished';
      }

      // Another live claim may still be processing, or the database has not yet observed a lease expiry.
      await sleep(500);
      continue;
    }

    const leaseHeartbeat = setInterval(() => {
      renewReportLease(campaignId, token).catch((e) => {
        console.error(`[campaign ${campaignId}] report lease heartbeat failed:`, e?.message || e);
      });
    }, REPORT_HEARTBEAT_MS);

    const tc = {
      templateName: cleanStr(campaign.templateName).toLowerCase(),
      languageCode: cleanStr(campaign.languageCode || 'en'),
      templateCategory: campaign.templateCategory,
      generateOtp: campaign.generateOtp,
      otpLength: campaign.otpLength || 4,
      mediaUrl: campaign.mediaUrl,
    };

    try {
      const batchStartedAt = Date.now();
      // A batch can contain more reports than the number of simultaneous Meta requests.
      // This helper preserves report order while limiting active sends.
      const outcomes = await mapSettledWithConcurrency(reports, SEND_CONCURRENCY, async (report: any) => {
        const reportStartedAt = Date.now();
        let variables: string[] = [];
        const absoluteIndex = Number(report.index);

        if (campaign.templateCategory === 'AUTHENTICATION') {
          if (campaign.generateOtp || !campaign.mappedVariables?.[absoluteIndex]?.length) {
            const length = campaign.otpLength || 4;
            const min = Math.pow(10, length - 1);
            const max = Math.pow(10, length) - 1;
            variables = [Math.floor(Math.random() * (max - min + 1) + min).toString()];
          } else {
            variables = campaign.mappedVariables[absoluteIndex];
          }
        } else {
          variables = campaign.mappedVariables?.[absoluteIndex]?.length
            ? campaign.mappedVariables[absoluteIndex]
            : (campaign.variables || []);
        }

        variables = (Array.isArray(variables) ? variables : []).filter(
          (value: any) => value != null && String(value).trim() !== '',
        );

        const result = await metaSenderWorker(
          String(report.phone), variables, tc, ACCESS_TOKEN, PHONE_NUMBER_ID, headerFormat,
        );
        const elapsed = Date.now() - reportStartedAt;
        totalApiMs += elapsed;
        totalApiRequests += 1;
        return { report, result, elapsed };
      });
      const messagesToCreate: any[] = [];
      const reportOps: any[] = [];
      let sent = 0;
      let failed = 0;
      let totalDeducted = 0;
      let apiErrors = 0;

      for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        const report: any = reports[i];
        const phone = String(report.phone || '').replace(/\+/g, '');

        if (outcome.status === 'rejected') {
          failed++;
          apiErrors++;
          reportOps.push({
            updateOne: {
              filter: { _id: report._id, workerClaimToken: token },
              update: { $set: { status: 'failed', error: 'System error: send task rejected' }, $unset: { workerClaimToken: 1, leaseExpiresAt: 1, queuedAt: 1 } },
            },
          });
          continue;
        }

        const { result } = outcome.value;
        if (result.status === 'sent') {
          sent++;
          let price = Number(campaign.pricePerMessage);
          if (!Number.isFinite(price) || price <= 0) {
            price = Number(getPriceForCategory(payer, campaign.templateCategory || 'MARKETING')) || 0;
          }
          totalDeducted += price;
          reportOps.push({
            updateOne: {
              filter: { _id: report._id, workerClaimToken: token },
              update: {
                $set: { status: 'sent', sentWamid: result.wamid, charged: true, chargedAmount: price },
                $unset: { workerClaimToken: 1, leaseExpiresAt: 1, queuedAt: 1 },
              },
            },
          });
          messagesToCreate.push({
            userId,
            phone,
            text: '',
            direction: 'out',
            messageType: 'template',
            mediaUrl: tc.mediaUrl || null,
            whatsappMessageId: result.wamid,
            status: 'sent',
            templateName: tc.templateName,
            templateLanguage: tc.languageCode,
            whatsappPhoneNumberId: PHONE_NUMBER_ID,
          });
        } else {
          failed++;
          apiErrors++;
          reportOps.push({
            updateOne: {
              filter: { _id: report._id, workerClaimToken: token },
              update: {
                $set: { status: 'failed', error: result.error || 'Unknown Meta API error' },
                $unset: { workerClaimToken: 1, leaseExpiresAt: 1, queuedAt: 1 },
              },
            },
          });
        }
      }

      // Persist results in batches. Log failures rather than silently swallowing them.
      if (reportOps.length) {
        try {
          const writeResult = await CampaignReport.collection.bulkWrite(reportOps, { ordered: false });
          if (writeResult.matchedCount < reportOps.length) {
            console.warn(`[campaign ${campaignId}] ${reportOps.length - writeResult.matchedCount} report updates did not match their claim token.`);
          }
        } catch (e: any) {
          console.error(`[campaign ${campaignId}] Report bulk write failed:`, e?.message || e);
          // Keep any unpersisted reports claimed; their leases will expire and be recovered.
          throw e;
        }
      }

      if (messagesToCreate.length) {
        try {
          await Message.insertMany(messagesToCreate, { ordered: false });
        } catch (e: any) {
          console.error(`[campaign ${campaignId}] Message insertMany failed:`, e?.message || e);
        }
      }

      if (totalDeducted > 0) {
        try {
          await User.updateOne({ _id: payerId }, { $inc: { balance: -Math.round(totalDeducted * 100) / 100 } });
        } catch (e: any) {
          console.error(`[campaign ${campaignId}] Balance deduction failed:`, e?.message || e);
        }
      }

      try {
        await Campaign.updateOne(
          { _id: campaignId },
          { $inc: { sentCount: sent, failedCount: failed, totalDeducted: Math.round(totalDeducted * 100) / 100 } },
        );
      } catch (e: any) {
        console.error(`[campaign ${campaignId}] Campaign counter update failed:`, e?.message || e);
      }

      const elapsedBatch = outcomes.reduce((sum, outcome) => sum + (outcome.status === 'fulfilled' ? outcome.value.elapsed : 0), 0);
      const batchWallMs = Date.now() - batchStartedAt;
      const actualRate = sent / Math.max(batchWallMs / 1000, 0.001);
      console.log(
        `[campaign ${campaignId}] batch=${reports.length} sent=${sent} failed=${failed} apiErrors=${apiErrors} ` +
        `batchWallMs=${batchWallMs} avgRequestMs=${reports.length ? Math.round(elapsedBatch / reports.length) : 0} ` +
        `successfulSendRate=${actualRate.toFixed(2)}/sec`,
      );
    } finally {
      clearInterval(leaseHeartbeat);
    }

    if (BATCH_PAUSE_MS > 0) await sleep(BATCH_PAUSE_MS);
  }
}

async function releaseClaimedReportsForCampaign(campaignId: any) {
  // Release only reports not currently owned by a still-live lease. The active batch's
  // heartbeat will stop when the loop returns; its reports will be recovered on expiry.
  const now = new Date();
  await CampaignReport.collection.updateMany(
    {
      campaignId: new mongoose.Types.ObjectId(String(campaignId)),
      status: 'queued',
      leaseExpiresAt: { $lt: now },
    },
    { $set: { status: 'pending' }, $unset: { workerClaimToken: 1, leaseExpiresAt: 1, queuedAt: 1 } },
  );
}

async function releaseAnyExpiredAndFinish(campaignId: any) {
  await recoverExpiredReports(campaignId);
}

async function mapSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }));
  return results;
}

// ---------------------------------------------------------------------------
// INACTIVITY WORKER
// ---------------------------------------------------------------------------

async function startInactivityWorker() {
  while (true) {
    try {
      await ensureDbConnected();
      const job = await Job.findOneAndUpdate(
        {
          queue: 'workflow-inactivity',
          status: 'pending',
          $expr: {
            $lt: [
              { $add: ['$createdAt', { $multiply: [{ $ifNull: ['$data.delaySeconds', 30] }, 1000] }] },
              new Date(),
            ],
          },
        },
        { $set: { status: 'processing', lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      ).lean();

      if (!job) {
        await sleep(1500);
        continue;
      }

      try {
        const data = job.data;
        const session = await Session.findOne({ phone: data.phone, userId: data.userId });
        if (session?.formId) {
          await Job.deleteOne({ _id: job._id });
        } else if (data.sentCount < data.repeatCount) {
          const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${data.phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${data.accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: data.phone,
              type: 'text',
              text: { body: data.message, preview_url: true },
            }),
          });
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown Meta API error');
            throw new Error(`Inactivity message failed (${response.status}): ${errorText.slice(0, 500)}`);
          }
          const responseData: any = await response.json().catch(() => ({}));
          await Message.create({
            userId: data.userId,
            phone: data.phone,
            text: data.message,
            direction: 'out',
            messageType: 'text',
            status: 'sent',
            whatsappMessageId: responseData?.messages?.[0]?.id,
            whatsappPhoneNumberId: data.phoneNumberId,
          });
          if (data.sentCount + 1 < data.repeatCount) {
            await Job.create({
              queue: 'workflow-inactivity',
              name: 'send-inactivity-message',
              data: { ...data, sentCount: data.sentCount + 1 },
              status: 'pending',
              createdAt: new Date(),
            });
          }
          await Job.deleteOne({ _id: job._id });
        } else {
          await Job.deleteOne({ _id: job._id });
        }
      } catch (err: any) {
        console.error('[workflow-inactivity] job failed:', err?.message || err);
        await Job.updateOne(
          { _id: job._id },
          { $set: { status: 'failed', error: err?.message || 'Inactivity worker error' }, $unset: { lockedAt: 1 } },
        );
      }
      await sleep(250);
    } catch (err: any) {
      console.error('[workflow-inactivity] polling error:', err?.message || err);
      await sleep(2000);
    }
  }
}

function cleanStr(value: any): string {
  if (value == null) return '';
  let result = String(value).trim();
  if (result.startsWith('"') && result.endsWith('"')) result = result.slice(1, -1);
  if (result.startsWith("'") && result.endsWith("'")) result = result.slice(1, -1);
  return result.replace(/\\"/g, '"').replace(/\\'/g, "'");
}

async function metaSenderWorker(
  phone: string,
  variables: string[],
  tc: any,
  token: string,
  phoneNumberId: string,
  headerFormat: string,
): Promise<{ status: 'sent' | 'failed'; wamid?: string | null; error?: string }> {
  let components = buildCampaignComponents(headerFormat, variables, tc.mediaUrl || '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`;
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const startedAt = Date.now();
    try {
      const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: tc.templateName,
          language: { code: tc.languageCode || 'en' },
          components,
        },
      });
      const response = await fetch(url, { method: 'POST', headers, body: payload, signal: controller.signal });
      clearTimeout(timeoutId);
      const latency = Date.now() - startedAt;

      let responseData: any = {};
      try { responseData = await response.json(); } catch { /* handled below */ }

      if (response.ok) {
        const wamid = responseData?.messages?.[0]?.id || responseData?.message_id || null;
        if (wamid) return { status: 'sent', wamid };
        const message = responseData?.error?.message || 'Meta API returned success without a message ID';
        return { status: 'failed', error: message };
      }

      const errorCode = responseData?.error?.code;
      const errorMessage = responseData?.error?.message || 'Meta API request failed';
      const details = responseData?.error?.error_data?.details || '';

      if (errorCode === 132012 && tc.mediaUrl) {
        const match = String(details).match(/expected\s+(\w+)/i);
        if (match && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(match[1].toUpperCase())) {
          components = buildCampaignComponents(match[1].toUpperCase(), variables, tc.mediaUrl);
          attempt++;
          continue;
        }
      }
      if (errorCode === 132012 && components.some((component: any) => component.type === 'header')) {
        components = components.filter((component: any) => component.type !== 'header');
        attempt++;
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.min(1000 * (2 ** attempt), 15000);
        console.warn(`[Meta API] retryable status=${response.status} code=${errorCode || 'n/a'} latency=${latency}ms attempt=${attempt + 1}/${maxRetries} wait=${backoff}ms`);
        await sleep(backoff);
        attempt++;
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        console.error(`[Meta API] retries exhausted status=${response.status} code=${errorCode || 'n/a'} latency=${latency}ms message=${errorMessage}`);
      }
      return { status: 'failed', error: `${response.status}${errorCode ? ` / ${errorCode}` : ''}: ${errorMessage}` };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const retryable = err?.name === 'AbortError' || err instanceof TypeError;
      if (retryable && attempt < maxRetries) {
        const backoff = Math.min(1000 * (2 ** attempt), 15000);
        console.warn(`[Meta API] network/timeout error attempt=${attempt + 1}/${maxRetries}; retrying in ${backoff}ms: ${err?.message || err}`);
        await sleep(backoff);
        attempt++;
        continue;
      }
      return { status: 'failed', error: err?.name === 'AbortError' ? 'Meta API Timeout (30s)' : (err?.message || 'System error') };
    }
  }
  return { status: 'failed', error: 'Retry limit reached' };
}

async function fetchTemplateHeaderFormat(
  phoneNumberId: string,
  accessToken: string,
  templateName: string,
  languageCode: string,
  userProvidedMediaType: string,
): Promise<string> {
  const valid = ['image', 'video', 'document'];
  const fallback = cleanStr(userProvidedMediaType).toLowerCase();
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/message_templates`;
  try {
    let response = await fetch(`${baseUrl}?name=${encodeURIComponent(templateName)}&language=${encodeURIComponent(languageCode)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data: any = await response.json();
      const template = data?.data?.[0];
      if (template?.components) {
        for (const component of template.components) {
          if (component.type === 'HEADER') return (component.format || 'none').toUpperCase();
        }
      }
    }
    response = await fetch(`${baseUrl}?name=${encodeURIComponent(templateName)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data: any = await response.json();
      const template = data?.data?.[0];
      if (template?.components) {
        for (const component of template.components) {
          if (component.type === 'HEADER') return (component.format || 'none').toUpperCase();
        }
      }
    }
  } catch (err: any) {
    console.warn('[Meta API] Unable to fetch template header format:', err?.message || err);
  }
  if (valid.includes(fallback)) return fallback.toUpperCase();
  return 'none';
}

function buildCampaignComponents(headerFormat: string, variables: string[], mediaUrl: string): any[] {
  const components: any[] = [];
  const valid = ['image', 'video', 'document'];
  if (valid.includes(String(headerFormat).toLowerCase()) && mediaUrl) {
    const headerType = String(headerFormat).toLowerCase();
    const mediaObject: any = mediaUrl.startsWith('http') ? { link: mediaUrl } : { id: mediaUrl };
    const parameter: any = { type: headerType };
    if (headerType === 'image') parameter.image = mediaObject;
    else if (headerType === 'video') parameter.video = mediaObject;
    else if (headerType === 'document') parameter.document = { ...mediaObject, filename: 'document.pdf' };
    components.push({ type: 'header', parameters: [parameter] });
  }
  if (variables.length) {
    components.push({
      type: 'body',
      parameters: variables.map((value) => ({ type: 'text', text: String(value) })),
    });
  }
  return components;
}

async function generateCountsData(userId: string, page: number, limit: number, cacheKey: string, lockKey: string) {
  try {
    await ensureDbConnected();
    const skip = (page - 1) * limit;
    const campaigns = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          name: 1, templateName: 1, templateCategory: 1, variables: 1, mappedVariables: 1,
          generateOtp: 1, otpLength: 1,
          phoneNumbers: { $slice: [{ $ifNull: ['$phoneNumbers', []] }, 15] },
          names: { $slice: [{ $ifNull: ['$names', []] }, 15] },
          additionalFieldsData: { $slice: [{ $ifNull: ['$additionalFieldsData', []] }, 15] },
          mediaUrl: 1, mediaType: 1, languageCode: 1, status: 1, totalMessages: 1,
          totalDeducted: 1, scheduledAt: 1, createdAt: 1, additionalFields: 1,
          sentCount: 1, failedCount: 1, skippedCount: 1, liveStats: 1,
        },
      },
    ]).allowDiskUse(false);

    const fixedCampaigns = campaigns.map((campaign: any) => {
      const stats = campaign.liveStats || {};
      const total = stats.total || 0;
      const read = stats.read || 0;
      const delivered = stats.delivered || 0;
      const sent = stats.sent || 0;
      const failed = stats.failed || 0;
      const invalid = stats.invalid || 0;
      const duplicate = stats.duplicate || 0;
      const processed = read + delivered + sent + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);
      const progress = total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;
      return {
        ...campaign,
        liveStats: { ...stats, pending, deliveredRead: delivered + read, failedInvalid: failed + invalid, progress },
        languageCode: campaign.languageCode || 'en',
        totalDeducted: campaign.totalDeducted || 0,
      };
    });

    const result = { success: true, campaigns: fixedCampaigns, page, limit };
    await Cache.updateOne(
      { key: cacheKey },
      { $set: { value: JSON.stringify(result), expireAt: new Date(Date.now() + 3600 * 1000) } },
      { upsert: true },
    );
    await Cache.deleteOne({ key: lockKey }).catch(() => {});
    return result;
  } catch (error) {
    console.error('❌ Counts generation error:', error);
    await Cache.deleteOne({ key: lockKey }).catch(() => {});
    return { success: false, message: 'Failed to generate counts' };
  }
}

process.on('SIGTERM', async () => {
  console.log('Main Worker process shutting down...');
  process.exit(0);
});
