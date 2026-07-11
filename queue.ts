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

// Redis connection config
// Redis connection config
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_HOST ? {} : undefined, // ✅ Enables TLS for Upstash cloud
  maxRetriesPerRequest: null, // ✅ Required by BullMQ
};

// 1. Export the Queue so API routes can add jobs to it
export const campaignQueue = new Queue('campaign-processing', { connection });

// 2. Create the Worker (only once per process)
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
    concurrency: 5 // Processes 5 chunks (250 messages) simultaneously
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
// WORKER LOGIC: Process 50 messages
// ==========================================
async function processCampaignChunk(data: any) {
  const { campaignId, userId, payerId, startIdx, endIdx, PHONE_NUMBER_ID, ACCESS_TOKEN } = data;

  await connectDB();
  const campaign = await Campaign.findById(campaignId);
  const payer = await User.findById(payerId);
  if (!campaign || !payer) throw new Error("Campaign or User not found");

  // If paused or stopped, skip this chunk
  if (["paused", "stopped", "completed"].includes(campaign.status)) return;

  const cTName = (campaign.templateName || "").trim();
  const cLang = (campaign.languageCode || "en").trim();
  const cMedia = (campaign.mediaType || "none").trim();
  const cat = (campaign.templateCategory || "MARKETING").toUpperCase().trim();
  const bPrice = getPriceForCategory(payer, cat);
  let payerBalance = payer.balance || 0;

  const tc = { 
    templateName: cTName, languageCode: cLang, templateCategory: campaign.templateCategory, 
    generateOtp: campaign.generateOtp, otpLength: campaign.otpLength || 4, mediaUrl: campaign.mediaUrl 
  };

  const metaPromises: Promise<any>[] = []; 
  const batchIndices: number[] = []; 
  const batchPhones: string[] = [];
  const claimOps: any[] = [];

  for (let ci = startIdx; ci < endIdx; ci++) {
    const ph = campaign.phoneNumbers[ci];
    const cs = campaign.reportData[ci]?.status;
    
    if (["sent", "delivered", "read", "failed", "invalid", "queued"].includes(cs)) continue;
    
    claimOps.push({ updateOne: { filter: { _id: campaignId, [`reportData.${ci}.status`]: "pending" }, update: { $set: { [`reportData.${ci}.status`]: "queued" } } } });
    
    let cv: string[] = [];
    if (campaign.templateCategory === "AUTHENTICATION") { 
      if (campaign.generateOtp || !campaign.mappedVariables?.[ci]?.length) { 
        const l = campaign.otpLength || 4; 
        cv = [Math.floor(Math.random() * (Math.pow(10, l) - Math.pow(10, l - 1) + 1) + Math.pow(10, l - 1)).toString()]; 
      } else cv = campaign.mappedVariables[ci]; 
    } else cv = (campaign.mappedVariables?.[ci]?.length > 0) ? campaign.mappedVariables[ci] : (campaign.variables || []);
    
    cv = (Array.isArray(cv) ? cv : []).filter((v: string) => v && String(v).trim() !== "");
    metaPromises.push(metaSenderWorker(ph, cv, tc, ACCESS_TOKEN, PHONE_NUMBER_ID));
    batchIndices.push(ci); 
    batchPhones.push(ph);
  }

  if (claimOps.length > 0) try { await Campaign.bulkWrite(claimOps); } catch (e) {}

  const metaResults = await Promise.all(metaPromises); 
  let bd = 0;
  let sent = 0, failed = 0, ded = 0;

  const campaignBulkOps: any[] = [];
  const messagesToCreate: any[] = [];
  
  for (let i = 0; i < metaResults.length; i++) {
    const r = metaResults[i]; 
    const ci = batchIndices[i]; 
    const ph = batchPhones[i].replace(/\+/g, "");
    
    if (r.status === "sent") {
      sent++;
      const pp = getPriceForPhone(payer, ph, cat); 
      bd += pp;
      
      campaignBulkOps.push({
        updateOne: { 
          filter: { _id: campaignId, [`reportData.${ci}.status`]: "queued" }, 
          update: { $set: {
            [`reportData.${ci}.status`]: "sent",
            [`reportData.${ci}.sentWamid`]: r.wamid,
            [`reportData.${ci}.charged`]: true,
            [`reportData.${ci}.chargedAmount`]: pp
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
          filter: { _id: campaignId, [`reportData.${ci}.status`]: "queued" }, 
          update: { $set: {
            [`reportData.${ci}.status`]: "failed",
            [`reportData.${ci}.error`]: r.error || "Unknown error"
          }}
        }
      });
    }
  }

  if (bd > 0) { 
    payerBalance = Math.round((payerBalance - bd) * 100) / 100; 
    if (payerBalance < 0) payerBalance = 0; 
    ded = Math.round((ded + bd) * 100) / 100;
  }

  if (campaignBulkOps.length > 0) try { await Campaign.bulkWrite(campaignBulkOps); } catch (e) {}
  if (messagesToCreate.length > 0) try { await Message.insertMany(messagesToCreate, { ordered: false }); } catch (e) {}

  // Use atomic $inc to prevent race conditions when concurrency > 1
  await User.updateOne({ _id: payer._id }, { $set: { balance: payerBalance } });
  await Campaign.updateOne({ _id: campaignId }, { $inc: { sentCount: sent, failedCount: failed, totalDeducted: ded } });

  // Check if this was the last chunk
  const freshCampaign = await Campaign.findById(campaignId).lean();
  const totalProcessed = (freshCampaign?.sentCount || 0) + (freshCampaign?.failedCount || 0) + (freshCampaign?.skippedCount || 0);
  
  if (totalProcessed >= freshCampaign?.phoneNumbers.length) {
    const finalStatus = (freshCampaign?.sentCount || 0) > 0 ? "completed" : "failed";
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: finalStatus, completedAt: new Date() } });
    
    try {
      const plainReportData = (freshCampaign?.reportData || []).map((r: any) => ({
        name: r.name || "", phone: r.phone || "", status: r.status || "", error: r.error || "",
        replies: r.replies || [], reply: r.reply || null, tags: r.tags || [], additionalData: r.additionalData || []
      }));
      await syncCampaignToGoogleSheet(userId, { name: freshCampaign?.name || "Campaign", reportData: plainReportData });
    } catch (e) { console.error("Sheet sync failed:", e); }
  }
}

// ==========================================
// META API WORKER FUNCTION
// ==========================================
async function metaSenderWorker(phone: string, variables: string[], tc: any, token: string, pnId: string): Promise<{ status: string; wamid?: string | null; error?: string }> {
  try {
    const comps: any[] = [];
    if (variables.length > 0) comps.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: String(v) })) });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const sendRes = await fetch(`https://graph.facebook.com/v21.0/${pnId}/messages`, { 
      method: "POST", 
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, 
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: comps } }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (sendRes.ok) { let wamid = null; try { const d = await sendRes.json(); wamid = d?.messages?.[0]?.id || d?.message_id; } catch {} return { status: "sent", wamid }; }
    
    let sendData: any = { error: {} }; 
    try { sendData = await sendRes.json(); } catch { return { status: "failed", error: "Meta API invalid response" }; }
    
    return { status: "failed", error: sendData?.error?.message || "Failed to send" };
  } catch (err: any) { 
    if (err.name === 'AbortError') return { status: "failed", error: "Meta API Timeout (30s)" };
    return { status: "failed", error: err.message || "System error" }; 
  }
}

function getPriceForPhone(payer: any, phone: string, category: string): number {
  if (payer.enabledCountries && payer.enabledCountries.length > 0) {
    const c = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
    if (c) {
      if (category === "MARKETING") return c.priceMarketing ?? getPriceForCategory(payer, category);
      if (category === "UTILITY") return c.priceUtility ?? getPriceForCategory(payer, category);
      if (category === "AUTHENTICATION") return c.priceAuthentication ?? getPriceForCategory(payer, category);
    }
    return getPriceForCategory(payer, category);
  }
  return getPriceForCategory(payer, category);
}
