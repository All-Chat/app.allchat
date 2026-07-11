/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/queue.ts
import { Queue, Worker } from 'bullmq';
import { connectDB } from '@/lib/mongodb';
import Campaign from '@/models/Campaign';
import User from '@/models/User';
import Message from '@/models/Message';
import mongoose from 'mongoose';
import { getPriceForCategory } from '@/lib/billing';
import { syncCampaignToGoogleSheet } from '@/lib/googleSheetSync';

// ==========================================
// 1. DATABASE CONNECTION OPTIMIZATION
// ==========================================
export async function ensureDbConnected() {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }
}

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s;
}

// ==========================================
// 3. REDIS & QUEUE CONFIGURATION
// ==========================================
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_HOST ? {} : undefined, 
  maxRetriesPerRequest: null,
  keepAlive: 30000,
  enableReadyCheck: false,
  connectTimeout: 10000,
};

export const campaignQueue = new Queue('campaign-processing', { connection });

declare global {
  // eslint-disable-next-line no-var
  var campaignWorker: any;
}

if (!global.campaignWorker) {
  global.campaignWorker = new Worker('campaign-processing', async (job) => {
    if (job.name === 'send-chunk') {
      await processCampaignChunk(job.data);
    }
  }, { 
    connection,
    concurrency: 10 
  });

  global.campaignWorker.on('completed', (job: any) => {
    console.log(`✅ Chunk ${job.data.startIdx}-${job.data.endIdx} completed`);
  });

  global.campaignWorker.on('failed', (job: any, err: Error) => {
    console.error(`❌ Chunk ${job?.data.startIdx}-${job?.data.endIdx} failed:`, err.message);
  });

  console.log('🚀 BullMQ Campaign Worker started in background...');
}

// ==========================================
// 4. PRICE CACHE OPTIMIZATION (O(1) + TTL)
// ==========================================
const priceMapCache = new Map<string, { map: Map<string, number>, defaultPrice: number, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getOptimizedPriceForPhone(payerId: string, payer: any, phone: string, category: string): number {
  const now = Date.now();
  let cache = priceMapCache.get(payerId);

  if (!cache || (now - cache.timestamp > CACHE_TTL)) {
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

// ==========================================
// 5. WORKER LOGIC: Process 50 messages
// ==========================================
async function processCampaignChunk(data: any) {
  const { campaignId, userId, payerId, startIdx, endIdx, PHONE_NUMBER_ID, ACCESS_TOKEN } = data;
  const chunkSize = endIdx - startIdx;

  await ensureDbConnected();

  const payer = await User.findById(payerId).lean();
  if (!payer) throw new Error("User not found");

  const campaign = await Campaign.findById(campaignId, {
    phoneNumbers: { $slice: [startIdx, chunkSize] },
    reportData: { $slice: [startIdx, chunkSize] },
    mappedVariables: { $slice: [startIdx, chunkSize] },
    templateName: 1,
    templateCategory: 1,
    languageCode: 1,
    mediaType: 1,
    mediaUrl: 1,
    generateOtp: 1,
    otpLength: 1,
    variables: 1,
    status: 1,
    totalMessages: 1
  }).lean();
  
  if (!campaign) throw new Error("Campaign not found");

  if (["paused", "stopped", "completed"].includes(campaign.status)) return;

  // ✅ FIX 132001: Meta API requires template names to be strictly lowercase and match exactly
  const cTName = cleanStr(campaign.templateName).toLowerCase();
  const cLang = cleanStr(campaign.languageCode || "en");
  const cat = (campaign.templateCategory || "MARKETING").toUpperCase();

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
    
    metaPromises.push(metaSenderWorker(ph, cv, tc, ACCESS_TOKEN, PHONE_NUMBER_ID));
    batchAbsoluteIndices.push(absoluteIndex); 
    batchPhones.push(ph);
  }

  if (claimOps.length > 0) {
    try {
      const claimResult = await Campaign.bulkWrite(claimOps);
      if (claimResult.modifiedCount < claimOps.length) {
        console.warn(`[Worker] Claim mismatch for campaign ${campaignId}. Expected ${claimOps.length}, got ${claimResult.modifiedCount}.`);
      }
    } catch (e) {
      console.error(`[Worker] BulkWrite claim error:`, e);
    }
  }

  const metaResults = await Promise.allSettled(metaPromises); 
  let bd = 0;
  let sent = 0, failed = 0, ded = 0;

  const campaignBulkOps: any[] = [];
  const messagesToCreate: any[] = [];
  
  for (let i = 0; i < metaResults.length; i++) {
    const res = metaResults[i];
    if (res.status !== 'fulfilled') {
      failed++;
      const absoluteIndex = batchAbsoluteIndices[i];
      campaignBulkOps.push({
        updateOne: { 
          filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "queued" }, 
          update: { $set: {
            [`reportData.${absoluteIndex}.status`]: "failed",
            [`reportData.${absoluteIndex}.error`]: "System Error: Promise rejected"
          }}
        }
      });
      continue;
    }

    const r = res.value;
    const absoluteIndex = batchAbsoluteIndices[i]; 
    const ph = batchPhones[i].replace(/\+/g, "");
    
    if (r.status === "sent") {
      sent++;
      const pp = getOptimizedPriceForPhone(payerId, payer, ph, cat); 
      bd += pp;
      
      campaignBulkOps.push({
        updateOne: { 
          filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "queued" }, 
          update: { $set: {
            [`reportData.${absoluteIndex}.status`]: "sent",
            [`reportData.${absoluteIndex}.sentWamid`]: r.wamid,
            [`reportData.${absoluteIndex}.charged`]: true,
            [`reportData.${absoluteIndex}.chargedAmount`]: pp
          }}
        }
      });

      messagesToCreate.push({ 
        userId, phone: ph, text: "", direction: "out", messageType: "template", 
        mediaUrl: tc.mediaUrl || null, whatsappMessageId: r.wamid, status: "sent", 
        templateName: tc.templateName, templateLanguage: tc.languageCode, whatsappPhoneNumberId: PHONE_NUMBER_ID 
      });
    } else if (r.status === "failed") {
      failed++;
      campaignBulkOps.push({
        updateOne: { 
          filter: { _id: campaignId, [`reportData.${absoluteIndex}.status`]: "queued" }, 
          update: { $set: {
            [`reportData.${absoluteIndex}.status`]: "failed",
            [`reportData.${absoluteIndex}.error`]: r.error || "Unknown error"
          }}
        }
      });
    }
  }

  if (bd > 0) { 
    ded = Math.round((ded + bd) * 100) / 100;
  }

  if (campaignBulkOps.length > 0) {
    try { await Campaign.bulkWrite(campaignBulkOps); } catch (e) {
      console.error(`[Worker] Campaign bulkWrite error:`, e);
    }
  }
  if (messagesToCreate.length > 0) {
    try { await Message.insertMany(messagesToCreate, { ordered: false }); } catch (e) {
      console.error(`[Worker] Message insertMany error:`, e);
    }
  }

  // ATOMIC USER BALANCE UPDATE
  if (bd > 0) {
    try {
      await User.updateOne({ _id: payerId }, { $inc: { balance: -bd } });
    } catch (e) {
      console.error(`[Worker] User balance deduction error:`, e);
    }
  }

  // ATOMIC CAMPAIGN COMPLETION & SHEET SYNC LOCK
  try {
    await Campaign.updateOne(
      { _id: campaignId }, 
      { $inc: { sentCount: sent, failedCount: failed, totalDeducted: ded } }
    );
  } catch (e) {
    console.error(`[Worker] Campaign counter increment error:`, e);
  }

  try {
    const completedCampaign = await Campaign.findOneAndUpdate(
      { 
        _id: campaignId, 
        status: { $ne: "completed" }, 
        $expr: { $gte: [ { $add: ["$sentCount", "$failedCount", { $ifNull: ["$skippedCount", 0] } ] }, "$totalMessages" ] }
      },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: true, fields: "status" }
    );

    if (completedCampaign && completedCampaign.status === "completed") {
      try {
        const finalCampaign = await Campaign.findById(campaignId).lean();
        const plainReportData = (finalCampaign?.reportData || []).map((r: any) => ({
          name: r.name || "", phone: r.phone || "", status: r.status || "", error: r.error || "",
          replies: r.replies || [], reply: r.reply || null, tags: r.tags || [], additionalData: r.additionalData || []
        }));
        await syncCampaignToGoogleSheet(userId, { name: finalCampaign?.name || "Campaign", reportData: plainReportData });
      } catch (e) { 
        console.error("[Worker] Sheet sync failed:", e); 
      }
    }
  } catch (e) {
    console.error(`[Worker] Campaign completion check error:`, e);
  }
}

// ==========================================
// 6. META API WORKER FUNCTION
// ==========================================
async function metaSenderWorker(phone: string, variables: string[], tc: any, token: string, pnId: string): Promise<{ status: string; wamid?: string | null; error?: string }> {
  const comps: any[] = [];
  
  if (variables.length > 0) {
    const params = new Array(variables.length);
    for (let i = 0; i < variables.length; i++) {
      params[i] = { type: "text", text: String(variables[i]) };
    }
    comps.push({ type: "body", parameters: params });
  }

  const payload = JSON.stringify({ 
    messaging_product: "whatsapp", 
    to: phone, 
    type: "template", 
    template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: comps } 
  });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const url = `https://graph.facebook.com/v21.0/${pnId}/messages`;

  const maxRetries = 3;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const sendRes = await fetch(url, { 
        method: "POST", 
        headers, 
        body: payload,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (sendRes.ok) { 
        let wamid = null; 
        try { 
          const d = await sendRes.json(); 
          wamid = d?.messages?.[0]?.id || d?.message_id; 
        } catch (e) {
          console.error(`[Meta API] Failed to parse success JSON for ${phone}:`, e);
        } 
        return { status: "sent", wamid }; 
      }
      
      let sendData: any = null; 
      try { 
        sendData = await sendRes.json(); 
      } catch { 
        return { status: "failed", error: "Meta API invalid response" }; 
      }

      const statusCode = sendRes.status;
      const errorMsg = sendData?.error?.message || "Failed to send";

      if (statusCode === 429 || statusCode >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; 
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }
        return { status: "failed", error: `Retry limit reached: ${errorMsg}` };
      }

      return { status: "failed", error: errorMsg };
      
    } catch (err: any) { 
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          attempt++;
          continue;
        }
        return { status: "failed", error: "Meta API Timeout (30s)" };
      }
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }
      return { status: "failed", error: err.message || "System error" }; 
    }
  }
  return { status: "failed", error: "Exited retry loop unexpectedly" };
}
