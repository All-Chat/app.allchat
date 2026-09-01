/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

// workers/mainWorker.ts

require('dotenv').config({ path: '.env.local' });

import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import CampaignReport from '../models/CampaignReport';
import User from '../models/User';
import Message from '../models/Message';
import Session from '../models/Session';
import mongoose from 'mongoose';
import { syncCampaignToGoogleSheet } from '../lib/googleSheetSync';
import { Job, Cache } from '../lib/queue';
import { getPriceForCategory } from '../lib/billing'; // ✅ NEW: Import the exact same pricing function used by the UI

connectDB()
  .then(async () => {
    console.log('✅ Main Worker process connected to MongoDB');
    startInactivityWorker();
    startCampaignWorker();
    startWorker('counts-processing', async (job) => {
      if (job.name === 'generate-counts') {
        return await generateCountsData(job.data.userId, job.data.page, job.data.limit, job.data.cacheKey, job.data.lockKey);
      }
    }, 5);
    console.log('🚀 Standalone main worker process started.');
  })
  .catch((err) => { console.error('❌ Worker process failed:', err); process.exit(1); });

export async function ensureDbConnected() {
  if (mongoose.connection.readyState !== 1) await connectDB();
}

async function startWorker(queueName: string, processor: (job: any) => Promise<any>, concurrency: number = 1) {
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
            try {
              const result = await processor({ id: job._id.toString(), name: job.name, data: job.data });
              if (job.opts?.removeOnComplete || job.opts?.removeOnFail) await Job.deleteOne({ _id: job._id });
              else await Job.updateOne({ _id: job._id }, { $set: { status: "completed", result } });
            } catch (err: any) {
              await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
            }
          } else { await new Promise((r) => setTimeout(r, 1000)); }
        } catch (err) { await new Promise((r) => setTimeout(r, 2000)); }
      }
    })();
  }
}

// ============================================================================
// CAMPAIGN WORKER (Dynamic Atomic Loop)
// ============================================================================

async function startCampaignWorker() {
  console.log('🚀 Worker started for queue: campaign-processing (Dynamic Loop, 10 msgs/sec)');

  while (true) {
    try {
      const job = await Job.findOneAndUpdate(
        { queue: 'campaign-processing', $or: [{ status: "pending" }, { status: "processing", lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();

      if (job) {
        if (job.name === 'process-campaign') {
          await processCampaignLoop(job.data, job._id);
          await Job.deleteOne({ _id: job._id }); // Delete job when loop finishes
        } else {
          // Fallback for any old chunk jobs
          await Job.deleteOne({ _id: job._id });
        }
      } else { await new Promise(r => setTimeout(r, 1000)); }
    } catch (err) {
      console.error('Polling error for campaign-processing:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function processCampaignLoop(data: any, jobId: any) {
  const { campaignId, userId, payerId, PHONE_NUMBER_ID, ACCESS_TOKEN } = data;
  await ensureDbConnected();

  // ✅ FIX: Reset any stuck "queued" documents back to "pending" (in case of crash/restart)
  await CampaignReport.updateMany({ campaignId, status: "queued" }, { $set: { status: "pending" } });

  let thf = "";
  const batchSize = 20;
  
  // Fetch payer once at the start to calculate prices dynamically if needed
  const payer: any = await User.findById(payerId).lean();
  if (!payer) {
    console.error("Payer not found, stopping campaign.");
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: "failed" } });
    return;
  }
  
  while (true) {
    // 1. Check Campaign Status (Pause / Stop)
    const campaign: any = await Campaign.findById(campaignId).lean();
    if (!campaign) break;
    
    if (campaign.status === "paused") {
      await Job.updateOne({ _id: jobId }, { $set: { status: "pending", lockedAt: null } }).catch(()=>{});
      console.log(`⏸ Campaign ${campaign.name} paused. Job returned to queue.`);
      return; 
    }
    if (campaign.status === "stopped" || campaign.status === "completed") {
      console.log(`⏹ Campaign ${campaign.name} stopped/completed. Exiting loop.`);
      return; 
    }

    if (!thf) {
      thf = campaign.templateHeaderFormat || "";
      if (!thf) { 
        thf = await fetchTemplateHeaderFormat(PHONE_NUMBER_ID, ACCESS_TOKEN, cleanStr(campaign.templateName).toLowerCase(), cleanStr(campaign.languageCode || "en"), cleanStr(campaign.mediaType || "none")); 
        await Campaign.updateOne({ _id: campaignId }, { $set: { templateHeaderFormat: thf } }); 
      }
    }

    const tc = { 
      templateName: cleanStr(campaign.templateName).toLowerCase(), 
      languageCode: cleanStr(campaign.languageCode || "en"), 
      templateCategory: campaign.templateCategory, 
      generateOtp: campaign.generateOtp, 
      otpLength: campaign.otpLength || 4, 
      mediaUrl: campaign.mediaUrl 
    };

    // 2. ATOMIC FETCH: Grab the next 20 PENDING contacts and lock them
    const reports = [];
    for (let i = 0; i < batchSize; i++) {
      const doc = await CampaignReport.findOneAndUpdate(
        { campaignId, status: "pending" },
        { $set: { status: "queued" } },
        { sort: { index: 1 }, new: true }
      ).lean();
      if (doc) reports.push(doc);
      else break;
    }
    
    // 3. If none left, Campaign is Complete!
    if (reports.length === 0) {
      const pendingCount = await CampaignReport.countDocuments({ campaignId, status: "pending" });
      const queuedCount = await CampaignReport.countDocuments({ campaignId, status: "queued" });
      
      if (pendingCount === 0 && queuedCount === 0) {
        await Campaign.updateOne({ _id: campaignId }, { $set: { status: "completed", completedAt: new Date() } });
        console.log(`✅ Campaign ${campaign.name} fully processed!`);
        try {
          const finalCampaign = await Campaign.findById(campaignId).lean();
          const plainReportData = await CampaignReport.find({ campaignId }).select("name phone status error replies reply tags additionalData -_id").lean();
          await syncCampaignToGoogleSheet(userId, { name: finalCampaign?.name || "Campaign", reportData: plainReportData });
        } catch (e) {}
      }
      return; // Exit loop
    }

    const metaPromises: Promise<any>[] = [];
    const batchPhones: string[] = [];

    for (let i = 0; i < reports.length; i++) {
      const report: any = reports[i];
      let cv: string[] = [];
      const absoluteIndex = report.index; // Use stored index for variables

      if (campaign.templateCategory === "AUTHENTICATION") {
        if (campaign.generateOtp || !campaign.mappedVariables?.[absoluteIndex]?.length) {
          const l = campaign.otpLength || 4; const min = Math.pow(10, l - 1); const max = Math.pow(10, l) - 1;
          cv = [Math.floor(Math.random() * (max - min + 1) + min).toString()];
        } else cv = campaign.mappedVariables[absoluteIndex];
      } else cv = (campaign.mappedVariables?.[absoluteIndex]?.length > 0) ? campaign.mappedVariables[absoluteIndex] : (campaign.variables || []);

      cv = (Array.isArray(cv) ? cv : []).filter((v: string) => v && String(v).trim() !== "");
      metaPromises.push(metaSenderWorker(report.phone, cv, tc, ACCESS_TOKEN, PHONE_NUMBER_ID, thf));
      batchPhones.push(report.phone);
    }

    // 4. Send them via Meta API
    const metaResults = await Promise.allSettled(metaPromises);
    let bd = 0, sent = 0, failed = 0, ded = 0;
    const messagesToCreate: any[] = [];
    const bulkReportOps: any[] = [];

    for (let i = 0; i < metaResults.length; i++) {
      const res = metaResults[i];
      const reportId = reports[i]._id;
      const ph = batchPhones[i].replace(/\+/g, "");

      if (res.status !== 'fulfilled') {
        failed++;
        bulkReportOps.push({ updateOne: { filter: { _id: reportId }, update: { $set: { status: "failed", error: "System Error: Promise rejected" } } } });
        continue;
      }
      const r = res.value;

      if (r.status === "sent") {
        sent++;
        
        // ✅ CRITICAL FIX: Calculate the EXACT price the same way the UI does
        let pp = Number(campaign.pricePerMessage);
        if (!pp || pp <= 0) {
           // Fallback to dynamic calculation using the payer's current settings
           pp = getPriceForCategory(payer, campaign.templateCategory || "MARKETING");
        }

        bd += pp;
        bulkReportOps.push({ updateOne: { filter: { _id: reportId }, update: { $set: { status: "sent", sentWamid: r.wamid, charged: true, chargedAmount: pp } } } });
        messagesToCreate.push({ userId, phone: ph, text: "", direction: "out", messageType: "template", mediaUrl: tc.mediaUrl || null, whatsappMessageId: r.wamid, status: "sent", templateName: tc.templateName, templateLanguage: tc.languageCode, whatsappPhoneNumberId: PHONE_NUMBER_ID });
      } else {
        failed++;
        bulkReportOps.push({ updateOne: { filter: { _id: reportId }, update: { $set: { status: "failed", error: r.error || "Unknown error" } } } });
      }
    }

    if (bd > 0) ded = Math.round((ded + bd) * 100) / 100;
    if (bulkReportOps.length > 0) try { await CampaignReport.bulkWrite(bulkReportOps); } catch (e) {}
    if (messagesToCreate.length > 0) try { await Message.insertMany(messagesToCreate, { ordered: false }); } catch (e) {}
    if (bd > 0) try { await User.updateOne({ _id: payerId }, { $inc: { balance: -bd } }); } catch (e) {}
    try { await Campaign.updateOne({ _id: campaignId }, { $inc: { sentCount: sent, failedCount: failed, totalDeducted: ded } }); } catch (e) {}

    // 5. Wait 250ms (Rate limit: ~40 msgs/sec) and loop back to step 1
    await new Promise(r => setTimeout(r, 250));
  }
}

// ============================================================================
// INACTIVITY TIMER WORKER
// ============================================================================

async function startInactivityWorker() {
  while (true) {
    try {
      await ensureDbConnected();
      const job = await Job.findOneAndUpdate(
        { queue: "workflow-inactivity", status: "pending", $expr: { $lt: [{ $add: ["$createdAt", { $multiply: [{ $ifNull: ["$data.delaySeconds", 30] }, 1000] }] }, new Date()] } },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();
      if (job) {
        try {
          const data = job.data;
          const session = await Session.findOne({ phone: data.phone, userId: data.userId });
          if (session && session.formId) { await Job.deleteOne({ _id: job._id }); }
          else if (data.sentCount < data.repeatCount) {
            await fetch(`https://graph.facebook.com/v21.0/${data.phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${data.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: data.phone, type: "text", text: { body: data.message, preview_url: true } }) });
            await Message.create({ userId: data.userId, phone: data.phone, text: data.message, direction: "out", messageType: "text", status: "sent", whatsappPhoneNumberId: data.phoneNumberId });
            if (data.sentCount + 1 < data.repeatCount) await Job.create({ queue: "workflow-inactivity", name: "send-inactivity-message", data: { ...data, sentCount: data.sentCount + 1 }, status: "pending", createdAt: new Date() });
            await Job.deleteOne({ _id: job._id });
          } else { await Job.deleteOne({ _id: job._id }); }
        } catch (err: any) { await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } }); }
        await new Promise(r => setTimeout(r, 1000));
      } else { await new Promise(r => setTimeout(r, 2000)); }
    } catch (err) { await new Promise(r => setTimeout(r, 2000)); }
  }
}

function cleanStr(val: any): string { if (val == null) return ""; let s = String(val).trim(); if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1); if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1); s = s.replace(/\\"/g, '"').replace(/\\'/g, "'"); return s; }

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
          liveStats: 1
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

process.on('SIGTERM', async () => { console.log('Main Worker process shutting down...'); process.exit(0); });
