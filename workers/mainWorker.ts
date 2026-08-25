/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

// workers/mainWorker.ts

require('dotenv').config({ path: '.env.local' });

// ============================================================================
// IMPORTS
// ============================================================================

import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import User from '../models/User';
import Message from '../models/Message';
import Session from '../models/Session';
import mongoose from 'mongoose';
import { getPriceForCategory } from '../lib/billing';
import { syncCampaignToGoogleSheet } from '../lib/googleSheetSync';
import { Job, Cache } from '../lib/queue';

// ============================================================================
// 0. CONNECT TO MONGO ON STARTUP
// ============================================================================

connectDB()
  .then(async () => {
    console.log('✅ Main Worker process connected to MongoDB');

    // Start all background workers
    startInactivityWorker();
    startCampaignWorker();

    startWorker('counts-processing', async (job) => {
      if (job.name === 'generate-counts') {
        return await generateCountsData(job.data.userId, job.data.page, job.data.limit, job.data.cacheKey, job.data.lockKey);
      }
    }, 5);

    console.log('🚀 Standalone main worker process started — campaign / counts / inactivity workers running.');
  })
  .catch((err) => { console.error('❌ Worker process failed to connect to MongoDB:', err); process.exit(1); });

export async function ensureDbConnected() {
  if (mongoose.connection.readyState !== 1) await connectDB();
}

// ============================================================================
// 1. MONGODB QUEUE WORKER LOGIC (Generic)
// ============================================================================

async function startWorker(queueName: string, processor: (job: any) => Promise<any>, concurrency: number = 1) {
  
  console.log(`🚀 Worker started for queue: ${queueName} (Concurrency: ${concurrency})`);

  for (let i = 0; i < concurrency; i++) {
    (async () => {
      while (true) {
        try {
          
          const job = await Job.findOneAndUpdate(
            { queue: queueName, $or: [{ status: "pending" }, { status: "processing", lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] },
            { $set: { status: "processing", lockedAt: new Date() } },
            { sort: { createdAt: 1 }, returnDocument: "after" }
          ).lean();

          if (job) {
            console.log(`▶️ Processing job ${job.name} (${job._id}) in ${queueName}`);
            try {
              const result = await processor({ id: job._id.toString(), name: job.name, data: job.data });
              const shouldRemove = job.opts?.removeOnComplete || job.opts?.removeOnFail;
              if (shouldRemove) await Job.deleteOne({ _id: job._id });
              else await Job.updateOne({ _id: job._id }, { $set: { status: "completed", result } });
              console.log(`✅ Completed job ${job.name} (${job._id})`);
            } catch (err: any) {
              console.error(`❌ Failed job ${job.name} (${job._id}):`, err.message);
              const shouldRemove = job.opts?.removeOnFail || job.opts?.removeOnComplete;
              if (shouldRemove) await Job.deleteOne({ _id: job._id });
              else await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
            }
          } else { await new Promise((r) => setTimeout(r, 1000)); }
        } catch (err) {
          console.error(`Polling error for ${queueName}:`, err);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
  }
}

// ============================================================================
// 1.5 CAMPAIGN WORKER
// ============================================================================

async function startCampaignWorker() {
  
  console.log('🚀 Worker started for queue: campaign-processing (Concurrency: 1, Rate: 2 chunks/sec = 20 msgs/sec)');

  while (true) {
    try {
      const job = await Job.findOneAndUpdate(
        { queue: 'campaign-processing', $or: [{ status: "pending" }, { status: "processing", lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();

      if (job) {
        console.log(`▶️ Processing chunk ${job.data.startIdx}-${job.data.endIdx} (${job._id})`);
        try {
          await processCampaignChunk(job.data);
          await Job.deleteOne({ _id: job._id });
          console.log(`✅ Chunk ${job.data.startIdx}-${job.data.endIdx} completed`);
        } catch (err: any) {
          console.error(`❌ Chunk ${job.data.startIdx}-${job.data.endIdx} failed:`, err.message);
          await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
        }
        await new Promise(r => setTimeout(r, 500)); // 500ms delay = 20 msgs/sec
      } else { await new Promise(r => setTimeout(r, 1000)); }
    } catch (err) {
      console.error('Polling error for campaign-processing:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ============================================================================
// 1.6 INACTIVITY TIMER WORKER ✅
// ============================================================================

async function sendInactivityMessage(accessToken: string, phoneNumberId: string, phone: string, message: string) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: message, preview_url: true } }),
    });
    const data = await res.json();
    if (!res.ok) console.error("❌ Inactivity message failed:", JSON.stringify(data));
    else console.log(`✅ Inactivity message sent to ${phone}`);
  } catch (err) { console.error("❌ Inactivity message error:", err); }
}

async function startInactivityWorker() {
  console.log("🚀 Worker started for queue: workflow-inactivity");
  while (true) {
    try {
      await ensureDbConnected();
      const job = await Job.findOneAndUpdate(
        {
          queue: "workflow-inactivity", status: "pending",
          $expr: { $lt: [{ $add: ["$createdAt", { $multiply: [{ $ifNull: ["$data.delaySeconds", 30] }, 1000] }] }, new Date()] }
        },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();

      if (job) {
        console.log(`▶️ Processing inactivity job for ${job.data.phone}`);
        try {
          const data = job.data;
          const session = await Session.findOne({ phone: data.phone, userId: data.userId });
          if (session && session.formId) {
            await Job.deleteOne({ _id: job._id });
          } else if (data.sentCount < data.repeatCount) {
            await sendInactivityMessage(data.accessToken, data.phoneNumberId, data.phone, data.message);
            await Message.create({
              userId: data.userId, phone: data.phone, text: data.message,
              direction: "out", messageType: "text", status: "sent",
              whatsappPhoneNumberId: data.phoneNumberId, senderNumber: data.phoneNumberId,
            });
            if (data.sentCount + 1 < data.repeatCount) {
              await Job.create({
                queue: "workflow-inactivity", name: "send-inactivity-message",
                data: { ...data, sentCount: data.sentCount + 1 },
                status: "pending", createdAt: new Date(),
              });
            }
            await Job.deleteOne({ _id: job._id });
            console.log(`✅ Inactivity job completed for ${data.phone}`);
          } else {
            await Job.deleteOne({ _id: job._id });
          }
        } catch (err: any) {
          console.error(`❌ Inactivity job failed:`, err.message);
          await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
        }
        await new Promise(r => setTimeout(r, 1000));
      } else { await new Promise(r => setTimeout(r, 2000)); }
    } catch (err) {
      console.error("Polling error for workflow-inactivity:", err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s;
}

async function fetchTemplateHeaderFormat(phoneNumberId: string, accessToken: string, templateName: string, languageCode: string, userProvidedMediaType: string): Promise<string> {
  const valid = ["image", "video", "document"];
  const clean = cleanStr(userProvidedMediaType).toLowerCase().trim();
  try {
    let res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}&language=${encodeURIComponent(languageCode)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) { const d = await res.json(); const t = d?.data?.[0]; if (t?.components) for (const c of t.components) if (c.type === "HEADER") return (c.format || "none").toUpperCase(); }
    res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) { const d = await res.json(); const t = d?.data?.[0]; if (t?.components) for (const c of t.components) if (c.type === "HEADER") return (c.format || "none").toUpperCase(); }
  } catch (e) {}
  if (valid.includes(clean)) return clean.toUpperCase();
  return "none";
}

function buildCampaignComponents(headerFormat: string, variables: string[], mediaUrl: string): any[] {
  const comps: any[] = [];
  const valid = ["image", "video", "document"];
  if (valid.includes(headerFormat.toLowerCase()) && mediaUrl) {
    const hType = headerFormat.toLowerCase();
    const mObj: any = mediaUrl.startsWith("http") ? { link: mediaUrl } : { id: mediaUrl };
    const param: any = { type: hType };
    if (hType === "image") param.image = mObj;
    else if (hType === "video") param.video = mObj;
    else if (hType === "document") param.document = { ...mObj, filename: "document.pdf" };
    comps.push({ type: "header", parameters: [param] });
  }
  if (variables.length > 0) {
    const params = new Array(variables.length);
    for (let i = 0; i < variables.length; i++) params[i] = { type: "text", text: String(variables[i]) };
    comps.push({ type: "body", parameters: params });
  }
  return comps;
}

// ============================================================================
// 3. PRICE CACHE OPTIMIZATION
// ============================================================================

const priceMapCache = new Map<string, { map: Map<string, number>, defaultPrice: number, timestamp: number }>();
const PRICE_CACHE_TTL = 5 * 60 * 1000;

function getOptimizedPriceForPhone(payerId: string, payer: any, phone: string, category: string): number {
  const now = Date.now();
  let cache = priceMapCache.get(payerId);
  if (!cache || (now - cache.timestamp > PRICE_CACHE_TTL)) {
    const map = new Map<string, number>();
    const defaultPrice = getPriceForCategory(payer, category);
    if (payer.enabledCountries && payer.enabledCountries.length > 0) {
      payer.enabledCountries.forEach((c: any) => {
        if (c.code) {
          const cleanCode = c.code.replace(/\D/g, '');
          map.set(`M-${cleanCode}`, c.priceMarketing ?? defaultPrice);
          map.set(`U-${cleanCode}`, c.priceUtility ?? defaultPrice);
          map.set(`A-${cleanCode}`, c.priceAuthentication ?? defaultPrice);
        }
      });
    }
    cache = { map, defaultPrice, timestamp: now };
    priceMapCache.set(payerId, cache);
  }
  const catPrefix = category.charAt(0) + '-';
  for (let i = 1; i <= 4; i++) {
    if (phone.length < i) break;
    const prefix = phone.substring(0, i);
    const price = cache.map.get(catPrefix + prefix);
    if (price !== undefined) return price;
  }
  return cache.defaultPrice;
}

// ============================================================================
// 4. WORKER LOGIC: Process Campaign Chunk
// ============================================================================

async function processCampaignChunk(data: any) {
  const { campaignId, userId, payerId, startIdx, endIdx, PHONE_NUMBER_ID, ACCESS_TOKEN, pricePerMessage } = data;
  const chunkSize = endIdx - startIdx;
  await ensureDbConnected();

  const payer = await User.findById(payerId).lean();
  if (!payer) throw new Error("User not found");

  const campaign = await Campaign.findById(campaignId, {
    phoneNumbers: { $slice: [startIdx, chunkSize] }, reportData: { $slice: [startIdx, chunkSize] },
    mappedVariables: { $slice: [startIdx, chunkSize] }, templateName: 1, templateCategory: 1, languageCode: 1,
    mediaType: 1, mediaUrl: 1, templateHeaderFormat: 1, generateOtp: 1, otpLength: 1, variables: 1, status: 1, totalMessages: 1,
    pricePerMessage: 1 
  }).lean();

  if (!campaign) throw new Error("Campaign not found");
  if (["paused", "stopped", "completed"].includes(campaign.status)) return;

  const cTName = cleanStr(campaign.templateName).toLowerCase();
  const cLang = cleanStr(campaign.languageCode || "en");
  const cMedia = cleanStr(campaign.mediaType || "none");
  const cat = (campaign.templateCategory || "MARKETING").toUpperCase();

  let thf = campaign.templateHeaderFormat || "";
  if (!thf) {
    thf = await fetchTemplateHeaderFormat(PHONE_NUMBER_ID, ACCESS_TOKEN, cTName, cLang, cMedia);
    await Campaign.updateOne({ _id: campaignId }, { $set: { templateHeaderFormat: thf } });
  }

  const tc = {
    templateName: cTName, languageCode: cLang, templateCategory: campaign.templateCategory,
    generateOtp: campaign.generateOtp, otpLength: campaign.otpLength || 4, mediaUrl: campaign.mediaUrl
  };

  const metaPromises: Promise<any>[] = [];
  const batchAbsoluteIndices: number[] = [];
  const batchPhones: string[] = [];
  const claimOps: any[] = [];

  for (let i = 0; i < chunkSize; i++) {
    const absoluteIndex = startIdx + i;
    const ph = campaign.phoneNumbers[i];
    const cs = campaign.reportData[i]?.status;
    if (["sent", "delivered", "read", "failed", "invalid", "queued"].includes(cs)) continue;

    claimOps.push({
      updateOne: {
        filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "pending" },
        update: { $set: { [`reportData.${absoluteIndex}.status`]: "queued" } }
      }
    });

    let cv: string[] = [];
    if (campaign.templateCategory === "AUTHENTICATION") {
      if (campaign.generateOtp || !campaign.mappedVariables?.[i]?.length) {
        const l = campaign.otpLength || 4;
        const min = Math.pow(10, l - 1);
        const max = Math.pow(10, l) - 1;
        cv = [Math.floor(Math.random() * (max - min + 1) + min).toString()];
      } else cv = campaign.mappedVariables[i];
    } else cv = (campaign.mappedVariables?.[i]?.length > 0) ? campaign.mappedVariables[i] : (campaign.variables || []);

    cv = (Array.isArray(cv) ? cv : []).filter((v: string) => v && String(v).trim() !== "");
    metaPromises.push(metaSenderWorker(ph, cv, tc, ACCESS_TOKEN, PHONE_NUMBER_ID, thf));
    batchAbsoluteIndices.push(absoluteIndex);
    batchPhones.push(ph);
  }

  if (claimOps.length > 0) {
    try { await Campaign.bulkWrite(claimOps); } catch (e) { console.error(`[Worker] BulkWrite claim error:`, e); }
  }

  const metaResults = await Promise.allSettled(metaPromises);
  let bd = 0, sent = 0, failed = 0, ded = 0;
  const campaignBulkOps: any[] = [];
  const messagesToCreate: any[] = [];

  for (let i = 0; i < metaResults.length; i++) {
    const res = metaResults[i];
    if (res.status !== 'fulfilled') {
      failed++;
      const absoluteIndex = batchAbsoluteIndices[i];
      campaignBulkOps.push({ updateOne: { filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "queued" }, update: { $set: { [`reportData.${absoluteIndex}.status`]: "failed", [`reportData.${absoluteIndex}.error`]: "System Error: Promise rejected" } } } });
      continue;
    }
    const r = res.value;
    const absoluteIndex = batchAbsoluteIndices[i];
    const ph = batchPhones[i].replace(/\+/g, "");

    if (r.status === "sent") {
      sent++;
      const pp = Number(pricePerMessage) > 0 
        ? Number(pricePerMessage) 
        : (Number(campaign.pricePerMessage) || 0);

      bd += pp;
      campaignBulkOps.push({ updateOne: { filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "queued" }, update: { $set: { [`reportData.${absoluteIndex}.status`]: "sent", [`reportData.${absoluteIndex}.sentWamid`]: r.wamid, [`reportData.${absoluteIndex}.charged`]: true, [`reportData.${absoluteIndex}.chargedAmount`]: pp } } } });
      messagesToCreate.push({ userId, phone: ph, text: "", direction: "out", messageType: "template", mediaUrl: tc.mediaUrl || null, whatsappMessageId: r.wamid, status: "sent", templateName: tc.templateName, templateLanguage: tc.languageCode, whatsappPhoneNumberId: PHONE_NUMBER_ID });
    } else if (r.status === "failed") {
      failed++;
      campaignBulkOps.push({ updateOne: { filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "queued" }, update: { $set: { [`reportData.${absoluteIndex}.status`]: "failed", [`reportData.${absoluteIndex}.error`]: r.error || "Unknown error" } } } });
    }
  }

  if (bd > 0) ded = Math.round((ded + bd) * 100) / 100;
  if (campaignBulkOps.length > 0) try { await Campaign.bulkWrite(campaignBulkOps); } catch (e) { console.error(`[Worker] Campaign bulkWrite error:`, e); }
  if (messagesToCreate.length > 0) try { await Message.insertMany(messagesToCreate, { ordered: false }); } catch (e) { console.error(`[Worker] Message insertMany error:`, e); }
  if (bd > 0) try { await User.updateOne({ _id: payerId }, { $inc: { balance: -bd } }); } catch (e) { console.error(`[Worker] User balance deduction error:`, e); }
  try { await Campaign.updateOne({ _id: campaignId }, { $inc: { sentCount: sent, failedCount: failed, totalDeducted: ded } }); } catch (e) { console.error(`[Worker] Campaign counter increment error:`, e); }

  try {
    const [statResult] = await Campaign.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(campaignId) } },
      { $project: { status: 1, totalMessages: 1, processedCount: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $in: ["$$r.status", ["sent", "delivered", "read", "failed", "invalid", "duplicate"]] } } } } } }
    ]);
    let completedCampaign: any = null;
    if (statResult && statResult.status !== "completed" && statResult.processedCount >= (statResult.totalMessages || 0)) {
      completedCampaign = await Campaign.findOneAndUpdate({ _id: campaignId, status: { $ne: "completed" } }, { $set: { status: "completed", completedAt: new Date() } }, { new: true, fields: "status" });
    }
    if (completedCampaign && completedCampaign.status === "completed") {
      try {
        const finalCampaign = await Campaign.findById(campaignId).lean();
        const plainReportData = (finalCampaign?.reportData || []).map((r: any) => ({ name: r.name || "", phone: r.phone || "", status: r.status || "", error: r.error || "", replies: r.replies || [], reply: r.reply || null, tags: r.tags || [], additionalData: r.additionalData || [] }));
        await syncCampaignToGoogleSheet(userId, { name: finalCampaign?.name || "Campaign", reportData: plainReportData });
      } catch (e) { console.error("[Worker] Sheet sync failed:", e); }
    }
  } catch (e) { console.error(`[Worker] Campaign completion check error:`, e); }
}

// ============================================================================
// 5. META API WORKER FUNCTION
// ============================================================================

async function metaSenderWorker(phone: string, variables: string[], tc: any, token: string, pnId: string, thf: string): Promise<{ status: string; wamid?: string | null; error?: string }> {
  let comps = buildCampaignComponents(thf, variables, tc.mediaUrl || "");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const url = `https://graph.facebook.com/v21.0/${pnId}/messages`;
  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const payload = JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: comps } });
      const sendRes = await fetch(url, { method: "POST", headers, body: payload, signal: controller.signal });
      clearTimeout(timeoutId);

      if (sendRes.ok) {
        let wamid: string | null = null;
        let data: any = null;
        try { data = await sendRes.json(); wamid = data?.messages?.[0]?.id || data?.message_id || null; }
        catch (e) { console.error(`[Meta API] Failed to parse success JSON for ${phone}:`, e); }

        if (wamid) return { status: "sent", wamid };

        if (data?.error) {
          const errorMsg = data.error.message || "Meta API error";
          const errorCode = data.error.code;
          if (errorCode === 132012 && tc.mediaUrl) {
            const m = (data.error?.error_data?.details || "").match(/expected\s+(\w+)/i);
            if (m && ["IMAGE", "VIDEO", "DOCUMENT"].includes(m[1].toUpperCase())) { comps = buildCampaignComponents(m[1].toUpperCase(), variables, tc.mediaUrl); attempt++; continue; }
          }
          if (errorCode === 132012 && comps.length > 0 && comps[0].type === "header") { comps = comps.filter((c: any) => c.type !== "header"); attempt++; continue; }
          return { status: "failed", error: errorMsg };
        }
        return { status: "failed", error: "Meta API returned 200 but no message ID" };
      }

      let sendData: any = null;
      try { sendData = await sendRes.json(); } catch { return { status: "failed", error: "Meta API invalid response" }; }

      const statusCode = sendRes.status;
      const errorMsg = sendData?.error?.message || "Failed to send";

      if (sendData.error?.code === 132012 && tc.mediaUrl) {
        const m = (sendData.error?.error_data?.details || "").match(/expected\s+(\w+)/i);
        if (m && ["IMAGE", "VIDEO", "DOCUMENT"].includes(m[1].toUpperCase())) { comps = buildCampaignComponents(m[1].toUpperCase(), variables, tc.mediaUrl); attempt++; continue; }
      }
      if (sendData.error?.code === 132012 && comps.length > 0 && comps[0].type === "header") { comps = comps.filter((c: any) => c.type !== "header"); attempt++; continue; }

      if (statusCode === 429 || statusCode >= 500) {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)); attempt++; continue; }
        return { status: "failed", error: `Retry limit reached: ${errorMsg}` };
      }
      return { status: "failed", error: errorMsg };

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)); attempt++; continue; }
        return { status: "failed", error: "Meta API Timeout (30s)" };
      }
      if (attempt < maxRetries) { await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)); attempt++; continue; }
      return { status: "failed", error: err.message || "System error" };
    }
  }
  return { status: "failed", error: "Exited retry loop unexpectedly" };
}

// ============================================================================
// 6. COUNTS WORKER
// ============================================================================

async function generateCountsData(userId: string, page: number, limit: number, cacheKey: string, lockKey: string) {
  try {
    await ensureDbConnected();
    const skip = (page - 1) * limit;

    const campaigns = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit },
      {
        $project: {
          name: 1, templateName: 1, templateCategory: 1, variables: 1, mappedVariables: 1, generateOtp: 1, otpLength: 1,
          phoneNumbers: { $slice: [{ $ifNull: ["$phoneNumbers", []] }, 15] }, names: { $slice: [{ $ifNull: ["$names", []] }, 15] },
          additionalFieldsData: { $slice: [{ $ifNull: ["$additionalFieldsData", []] }, 15] }, mediaUrl: 1, mediaType: 1, languageCode: 1,
          status: 1, totalMessages: 1, totalDeducted: 1, scheduledAt: 1, createdAt: 1, additionalFields: 1, sentCount: 1, failedCount: 1, skippedCount: 1,
          liveStats: {
            $let: {
              vars: {
                counts: {
                  $reduce: {
                    input: { $ifNull: ["$reportData", []] },
                    initialValue: { replied: 0, read: 0, delivered: 0, sent: 0, failed: 0, invalid: 0, duplicate: 0 },
                    in: {
                      replied: { $add: ["$$value.replied", { $cond: [{ $or: [{ $ne: [{ $ifNull: ["$$this.reply", ""] }, ""] }, { $gt: [{ $size: { $filter: { input: { $ifNull: ["$$this.replies", []] }, as: "rep", cond: { $ne: ["$$rep", ""] } } } }, 0] }] }, 1, 0] }] },
                      read: { $add: ["$$value.read", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "read"] }, 1, 0] }] },
                      delivered: { $add: ["$$value.delivered", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "delivered"] }, 1, 0] }] },
                      sent: { $add: ["$$value.sent", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "sent"] }, 1, 0] }] },
                      failed: { $add: ["$$value.failed", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "failed"] }, 1, 0] }] },
                      invalid: { $add: ["$$value.invalid", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "invalid"] }, 1, 0] }] },
                      duplicate: { $add: ["$$value.duplicate", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "duplicate"] }, 1, 0] }] }
                    }
                  }
                }
              },
              in: { total: { $ifNull: ["$totalMessages", 0] }, replied: "$$counts.replied", read: "$$counts.read", delivered: "$$counts.delivered", sent: "$$counts.sent", failed: "$$counts.failed", invalid: "$$counts.invalid", duplicate: "$$counts.duplicate" }
            }
          }
        }
      }
    ]).allowDiskUse(false);

    const fixedCampaigns = campaigns.map((c: any) => {
      const ls = c.liveStats || {};
      const total = ls.total || 0; const read = ls.read || 0; const delivered = ls.delivered || 0;
      const sent = ls.sent || 0; const failed = ls.failed || 0; const invalid = ls.invalid || 0; const duplicate = ls.duplicate || 0;
      const processed = read + delivered + sent + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);
      const progress = total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;
      return { ...c, liveStats: { ...ls, pending, deliveredRead: delivered + read, failedInvalid: failed + invalid, progress }, languageCode: c.languageCode || "en", totalDeducted: c.totalDeducted || 0 };
    });

    const result = { success: true, campaigns: fixedCampaigns, page, limit };
    const cachePayload = JSON.stringify(result);
    await Cache.updateOne({ key: cacheKey }, { $set: { value: cachePayload, expireAt: new Date(Date.now() + 3600 * 1000) } }, { upsert: true });
    await Cache.deleteOne({ key: lockKey }).catch(() => {});
    return result;
  } catch (error) {
    console.error("❌ Counts generation error:", error);
    await Cache.deleteOne({ key: lockKey }).catch(() => {});
    return { success: false, message: "Failed to generate counts" };
  }
}

// ============================================================================
// SHUTDOWN
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('Main Worker process shutting down...');
  process.exit(0);
});
