/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/queue.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
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
    for (let i = 0; i < variables.length; i++) {
      params[i] = { type: "text", text: String(variables[i]) };
    }
    comps.push({ type: "body", parameters: params });
  }
  return comps;
}

// ==========================================
// 3. REDIS & QUEUE CONFIGURATION
// ==========================================
export const connection = {
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
    // Only 1 chunk in flight at a time — each chunk = 10 messages
    // sent in parallel via Promise.allSettled. Combined with the
    // limiter below, this gives exactly 10 msgs/sec.
    concurrency: 1,
    limiter: {
      // 1 chunk per 1000ms = 1 batch of 10 messages per second
      max: 1,
      duration: 1000
    },
    stalledInterval: 300000, 
    maxStalledCount: 2
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
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    templateHeaderFormat: 1,
    generateOtp: 1,
    otpLength: 1,
    variables: 1,
    status: 1,
    totalMessages: 1
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

  if (bd > 0) {
    try {
      await User.updateOne({ _id: payerId }, { $inc: { balance: -bd } });
    } catch (e) {
      console.error(`[Worker] User balance deduction error:`, e);
    }
  }

  try {
    await Campaign.updateOne(
      { _id: campaignId }, 
      { $inc: { sentCount: sent, failedCount: failed, totalDeducted: ded } }
    );
  } catch (e) {
    console.error(`[Worker] Campaign counter increment error:`, e);
  }

  try {
    // 🐛 FIX: the old check relied on `skippedCount`, which is never
    // incremented anywhere in this codebase — invalid/duplicate items are
    // skipped in the loop above without ever bumping any counter. That
    // permanently understated the "processed" total whenever a campaign
    // had ANY invalid/duplicate numbers, so completion was never reached.
    //
    // Fix: count directly from reportData (server-side $filter, doesn't
    // pull the array over the wire) — this always reflects reality,
    // regardless of which counters did or didn't get incremented.
    const [statResult] = await Campaign.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(campaignId) } },
      {
        $project: {
          status: 1,
          totalMessages: 1,
          processedCount: {
            $size: {
              $filter: {
                input: { $ifNull: ["$reportData", []] },
                as: "r",
                cond: {
                  $in: ["$$r.status", ["sent", "delivered", "read", "failed", "invalid", "duplicate"]],
                },
              },
            },
          },
        },
      },
    ]);

    let completedCampaign: any = null;
    if (
      statResult &&
      statResult.status !== "completed" &&
      statResult.processedCount >= (statResult.totalMessages || 0)
    ) {
      completedCampaign = await Campaign.findOneAndUpdate(
        { _id: campaignId, status: { $ne: "completed" } },
        { $set: { status: "completed", completedAt: new Date() } },
        { new: true, fields: "status" }
      );
    }

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
      const payload = JSON.stringify({ 
        messaging_product: "whatsapp", to: phone, type: "template", 
        template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: comps } 
      });

      const sendRes = await fetch(url, { method: "POST", headers, body: payload, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (sendRes.ok) { 
        let wamid = null; 
        try { const d = await sendRes.json(); wamid = d?.messages?.[0]?.id || d?.message_id; } catch (e) {
          console.error(`[Meta API] Failed to parse success JSON for ${phone}:`, e);
        } 
        return { status: "sent", wamid }; 
      }
      
      let sendData: any = null; 
      try { sendData = await sendRes.json(); } catch { return { status: "failed", error: "Meta API invalid response" }; }

      const statusCode = sendRes.status;
      const errorMsg = sendData?.error?.message || "Failed to send";

      if (sendData.error?.code === 132012 && tc.mediaUrl) {
        const m = (sendData.error?.error_data?.details || "").match(/expected\s+(\w+)/i);
        if (m && ["IMAGE", "VIDEO", "DOCUMENT"].includes(m[1].toUpperCase())) {
          comps = buildCampaignComponents(m[1].toUpperCase(), variables, tc.mediaUrl);
          attempt++; 
          continue;
        }
      }
      if (sendData.error?.code === 132012 && comps.length > 0 && comps[0].type === "header") {
        comps = comps.filter((c: any) => c.type !== "header");
        attempt++;
        continue;
      }

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

// ==========================================
// 7. COUNTS QUEUE & WORKER (For Fast List Loading)
// ==========================================
export const countsQueue = new Queue('counts-processing', { connection });
export const countsQueueEvents = new QueueEvents('counts-processing', { connection });

declare global {
  // eslint-disable-next-line no-var
  var countsWorker: any;
}

if (!global.countsWorker) {
  global.countsWorker = new Worker('counts-processing', async (job) => {
    if (job.name === 'generate-counts') {
      return await generateCountsData(job.data.userId, job.data.cacheKey, job.data.lockKey);
    }
  }, { 
    connection,
    concurrency: 5 
  });

  global.countsWorker.on('completed', (job: any) => {
    console.log(`✅ Counts job completed for user`);
  });

  global.countsWorker.on('failed', (job: any, err: Error) => {
    console.error(`❌ Counts job failed:`, err.message);
  });

  console.log('🚀 BullMQ Counts Worker started in background...');
}

async function generateCountsData(userId: string, cacheKey: string, lockKey: string) {
  try {
    await ensureDbConnected();

    // 🚀 FIX (from earlier list-speed pass): ObjectId match instead of
    // $toString, so the {userId:1, createdAt:-1} index is actually used.
    const campaigns = await Campaign.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId)
        } 
      },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          name: 1,
          templateName: 1,
          templateCategory: 1,
          variables: 1,
          mappedVariables: 1,
          generateOtp: 1,
          otpLength: 1,
          
          phoneNumbers: { $slice: [{ $ifNull: ["$phoneNumbers", []] }, 15] },
          names: { $slice: [{ $ifNull: ["$names", []] }, 15] },
          additionalFieldsData: { $slice: [{ $ifNull: ["$additionalFieldsData", []] }, 15] },
          
          mediaUrl: 1,
          mediaType: 1,
          languageCode: 1,
          status: 1,
          totalMessages: 1,
          totalDeducted: 1,
          scheduledAt: 1,
          createdAt: 1,
          additionalFields: 1,
          
          sentCount: 1,
          failedCount: 1,
          skippedCount: 1,
          
          liveStats: {
            total: { $ifNull: ["$totalMessages", 0] },
            replied: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: {
                    $or: [
                      { $ne: [ { $ifNull: ["$$r.reply", ""] }, "" ] },
                      { 
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: { $ifNull: ["$$r.replies", []] },
                                as: "rep",
                                cond: { $ne: ["$$rep", ""] }
                              }
                            }
                          },
                          0
                        ]
                      }
                    ]
                  }
                }
              }
            },
            read: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }
                }
              }
            },
            delivered: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }
                }
              }
            },
            invalid: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }
                }
              }
            },
            duplicate: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }
                }
              }
            }
          }
        }
      }
    ]);

    const fixedCampaigns = campaigns.map((c: any) => {
      const ls = c.liveStats || {};
      const total = ls.total || 0;
      const replied = ls.replied || 0;
      const read = ls.read || 0;
      const delivered = ls.delivered || 0;
      const sent = c.sentCount || 0;
      const failed = c.failedCount || 0;
      const skipped = c.skippedCount || 0;
      const invalid = ls.invalid || 0;
      const duplicate = ls.duplicate || 0;
      
      // 🐛 FIX: same double-counting issue as before — "replied" overlaps
      // with status-based buckets, don't add it into processed/progress math.
      const processed = read + delivered + sent + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);
      const progress = total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;

      return {
        ...c,
        liveStats: {
          ...ls,
          sent,
          failed,
          skipped,
          pending,
          deliveredRead: delivered + read,
          failedInvalid: failed + invalid,
          progress
        },
        languageCode: c.languageCode || "en",
        totalDeducted: c.totalDeducted || 0,
      };
    });

    const cachePayload = JSON.stringify({
      campaigns: fixedCampaigns,
      _cachedAt: Date.now()
    });
    
    if (countsQueue.client) {
      const redisClient = await countsQueue.client;
      await (redisClient as any).set(cacheKey, cachePayload, 'EX', 3600);
    }

    return { success: true, campaigns: fixedCampaigns };
  } catch (error) {
    console.error("❌ Counts generation error:", error);
    return { success: false, message: "Failed to generate counts" };
  } finally {
    if (countsQueue.client) {
      const redisClient = await countsQueue.client;
      await redisClient.del(lockKey).catch(() => {});
    }
  }
}

// ==========================================
// 8. REPORT QUEUE & WORKER (Microsecond Loading)
// ==========================================
export const reportQueue = new Queue('report-processing', { connection });
export const reportQueueEvents = new QueueEvents('report-processing', { connection });

declare global {
  // eslint-disable-next-line no-var
  var reportWorker: any;
}

if (!global.reportWorker) {
  global.reportWorker = new Worker('report-processing', async (job) => {
    if (job.name === 'refresh-report-cache') {
      return await refreshReportCache(job.data);
    }
  }, { 
    connection,
    concurrency: 5 
  });

  global.reportWorker.on('completed', (job: any) => {
    console.log(`✅ Report cache refreshed for campaign ${job.data.campaignId}`);
  });

  global.reportWorker.on('failed', (job: any, err: Error) => {
    console.error(`❌ Report job failed:`, err.message);
  });

  console.log('🚀 BullMQ Report Worker started in background...');
}

async function refreshReportCache(data: any) {
  const { campaignId, userId, cacheKey, lockKey } = data;

  try {
    await ensureDbConnected();

    const pipeline: any[] = [
      { $match: { _id: new mongoose.Types.ObjectId(campaignId), userId: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: "messages",
          let: { camp_createdAt: "$createdAt", user_id: "$userId" },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ["$userId", "$$user_id"] }, { $eq: ["$direction", "in"] }, { $gte: ["$createdAt", "$$camp_createdAt"] } ] } } },
            { $project: { phone: 1, _id: 0 } }
          ],
          as: "inboundMsgs"
        }
      },
      {
        $addFields: {
          repliedPhonesArr: {
            $map: {
              input: { $filter: { input: "$inboundMsgs", as: "msg", cond: { $ne: [{ $toString: { $ifNull: ["$$msg.phone", ""] } }, ""] } } },
              as: "msg", in: { $toString: "$$msg.phone" }
            }
          }
        }
      },
      {
        $project: {
          name: 1, templateName: 1, additionalFields: 1, languageCode: 1, totalDeducted: 1,
          mappedReportData: {
            $map: {
              input: { $ifNull: ["$reportData", []] },
              as: "r",
              in: {
                $mergeObjects: [
                  "$$r",
                  {
                    _effStatus: {
                      $switch: {
                        branches: [
                          { case: { $or: [ { $ne: [ { $ifNull: ["$$r.reply", ""] }, "" ] }, { $gt: [ { $size: { $filter: { input: { $ifNull: ["$$r.replies", []] }, as: "rep", cond: { $ne: ["$$rep", ""] } } } }, 0 ] }, { $in: [{ $toString: { $ifNull: ["$$r.phone", ""] } }, "$repliedPhonesArr"] } ] }, then: "replied" },
                          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, then: "read" },
                          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }, then: "delivered" },
                          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, then: "sent" },
                          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }, then: "failed" },
                          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }, then: "invalid" },
                          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }, then: "duplicate" }
                        ],
                        default: "pending"
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1, templateName: 1, additionalFields: 1, languageCode: 1, totalDeducted: 1,
          campaignStats: {
            total: { $size: { $ifNull: ["$mappedReportData", []] } },
            replied: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "replied"] } } } },
            read: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "read"] } } } },
            delivered: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "delivered"] } } } },
            sent: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "sent"] } } } },
            failed: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "failed"] } } } },
            invalid: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "invalid"] } } } },
            duplicate: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "duplicate"] } } } },
            pending: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "pending"] } } } }
          },
          mappedReportData: 1
        }
      }
    ];

    const result = await Campaign.aggregate(pipeline);
    
    if (!result || result.length === 0) {
      return { success: false, message: "Campaign not found", status: 404 };
    }

    const campaign = result[0];

    if (reportQueue.client) {
      const redisClient = await reportQueue.client;
      const cachePayload = JSON.stringify({
        stats: campaign.campaignStats,
        data: campaign.mappedReportData,
        meta: { name: campaign.name, templateName: campaign.templateName, additionalFields: campaign.additionalFields, languageCode: campaign.languageCode, totalDeducted: campaign.totalDeducted }
      });
      await (redisClient as any).set(cacheKey, cachePayload, 'EX', 3600);
    }

    return { success: true };
  } catch (error: any) {
    console.error("❌ Report Worker Error:", error);
    return { success: false, message: error.message, status: 500 };
  } finally {
    if (reportQueue.client) {
      const redisClient = await reportQueue.client;
      await redisClient.del(lockKey).catch(() => {});
    }
  }
}
