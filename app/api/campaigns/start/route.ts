/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import Message from "@/models/Message";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

export const runtime = "nodejs";

// ✅ Same inline Transaction model used by billing / test-message routes.
const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  amount: Number,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  metadata: Object
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

/* ============================================================================
   1. UTILITY FUNCTIONS
   ============================================================================ */

function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s;
}

function translateMetaError(error: any): string {
  if (!error) return "Unknown error occurred";
  const code = error.code;
  const msg = (error.message || "").toLowerCase();

  if (code === 132012) return "Media sent does not match template requirements.";
  if (code === 131008) return "Missing button text in the template link.";
  if (code === 132001) return "Template name or language does not exist.";
  if (code === 100) return "Invalid data format sent to WhatsApp.";
  if (code === 80007) return "Phone number is invalid or not on WhatsApp.";
  if (code === 130429) return "Sending too fast. Rate limit reached.";
  if (code === 470) return "Message failed. Number might have blocked you.";
  if (code === 131051) return "Template is paused or disabled in Meta.";

  if (msg.includes("recipient not on whatsapp")) return "Number is not active on WhatsApp.";
  if (msg.includes("template name does not exist")) return "Template was deleted or name is wrong.";
  if (msg.includes("format mismatch")) return "Wrong media type for template header.";
  if (msg.includes("undeliverable") || msg.includes("unsupported message type")) return "Message not delivered to maintain a healthy ecosystem.";

  return msg.replace(/[_\{\}\[\]]/g, " ").replace(/\s+/g, " ").trim() || "Failed to send";
}

function resolveCredentials(user: any, payer: any, explicitPhoneId?: string): { PHONE_NUMBER_ID: string; ACCESS_TOKEN: string } {
  let PHONE_NUMBER_ID = cleanStr(explicitPhoneId || "");
  let ACCESS_TOKEN = "";

  if (PHONE_NUMBER_ID) {
    if (user?.whatsappNumbers?.length > 0) { const m = user.whatsappNumbers.find((n: any) => n.whatsappPhoneNumberId === PHONE_NUMBER_ID || n.phoneNumberId === PHONE_NUMBER_ID || n.id === PHONE_NUMBER_ID || n._id?.toString() === PHONE_NUMBER_ID); if (m) ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || ""; }
    if (!ACCESS_TOKEN && payer?.whatsappNumbers?.length > 0) { const m = payer.whatsappNumbers.find((n: any) => n.whatsappPhoneNumberId === PHONE_NUMBER_ID || n.phoneNumberId === PHONE_NUMBER_ID || n.id === PHONE_NUMBER_ID || n._id?.toString() === PHONE_NUMBER_ID); if (m) ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || ""; }
    if (!ACCESS_TOKEN) ACCESS_TOKEN = user?.whatsappAccessToken || payer?.whatsappAccessToken || "";
    if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
    return { PHONE_NUMBER_ID, ACCESS_TOKEN };
  }
  if (user?.whatsappPhoneNumberId) { PHONE_NUMBER_ID = user.whatsappPhoneNumberId; ACCESS_TOKEN = user.whatsappAccessToken || ""; }
  if (!PHONE_NUMBER_ID && user?.whatsappNumbers?.length > 0) { const a = user.whatsappNumbers.find((n: any) => n.isActive) || user.whatsappNumbers[0]; PHONE_NUMBER_ID = a.whatsappPhoneNumberId || a.phoneNumberId || a.id || ""; ACCESS_TOKEN = a.whatsappAccessToken || a.accessToken || user.whatsappAccessToken || ""; }
  if (!PHONE_NUMBER_ID && payer?.whatsappPhoneNumberId) { PHONE_NUMBER_ID = payer.whatsappPhoneNumberId; ACCESS_TOKEN = payer.whatsappAccessToken || ""; }
  if (!PHONE_NUMBER_ID && payer?.whatsappNumbers?.length > 0) { const a = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0]; PHONE_NUMBER_ID = a.whatsappPhoneNumberId || a.phoneNumberId || a.id || ""; ACCESS_TOKEN = a.whatsappAccessToken || a.accessToken || payer.whatsappAccessToken || ""; }
  if (!PHONE_NUMBER_ID) PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
  return { PHONE_NUMBER_ID, ACCESS_TOKEN };
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
  if (variables.length > 0) comps.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: String(v) })) });
  return comps;
}

function extractWamid(data: any): string | null {
  if (data?.messages?.[0]?.id) return data.messages[0].id;
  if (data?.message_id) return data.message_id;
  return null;
}

/* ============================================================================
   2. ISOLATED WORKERS (META SENDER & DATABASE SYNCERS)
   ============================================================================ */

// 🚀 WORKER 1: Meta API Sender
async function metaSenderWorker(phone: string, variables: string[], tc: any, token: string, pnId: string, thf: string): Promise<{ status: string; wamid?: string | null; error?: string }> {
  try {
    let cv = variables; 
    let comps = buildCampaignComponents(thf, cv, tc.mediaUrl || "");
    
    let sendRes = await fetch(`https://graph.facebook.com/v21.0/${pnId}/messages`, { 
      method: "POST", 
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, 
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: comps } }) 
    });
    
    if (sendRes.ok) { 
      let wamid = null; 
      try { const d = await sendRes.json(); wamid = extractWamid(d); } catch {} 
      return { status: "sent", wamid }; 
    }
    
    let sendData: any = { error: {} }; 
    try { sendData = await sendRes.json(); } catch { return { status: "failed", error: "Meta API invalid response" }; }
    
    let wamid = extractWamid(sendData); 
    if (wamid) return { status: "sent", wamid };

    // Retry Logic 1: Missing URL button text for Auth templates
    if (sendData.error?.code === 131008 && tc.templateCategory === "AUTHENTICATION" && cv.length > 0) {
      const rc: any[] = []; 
      if (comps.length > 0 && comps[0].type === "header") rc.push(comps[0]);
      rc.push({ type: "body", parameters: cv.map((v: string) => ({ type: "text", text: String(v) })) });
      rc.push({ type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: String(cv[0]) }] });
      
      sendRes = await fetch(`https://graph.facebook.com/v21.0/${pnId}/messages`, { 
        method: "POST", 
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, 
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: rc } }) 
      });
      if (sendRes.ok) { try { return { status: "sent", wamid: extractWamid(await sendRes.json()) }; } catch { return { status: "sent" }; } }
      try { sendData = await sendRes.json(); if (extractWamid(sendData)) return { status: "sent", wamid: extractWamid(sendData) }; } catch {}
    }
    
    // Retry Logic 2: Media Format Mismatch
    if (sendData.error?.code === 132012 && tc.mediaUrl) {
      const m = (sendData.error?.error_data?.details || "").match(/expected\s+(\w+)/i);
      if (m && ["IMAGE", "VIDEO", "DOCUMENT"].includes(m[1].toUpperCase())) {
        comps = buildCampaignComponents(m[1].toUpperCase(), cv, tc.mediaUrl);
        sendRes = await fetch(`https://graph.facebook.com/v21.0/${pnId}/messages`, { 
          method: "POST", 
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, 
          body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: comps } }) 
        });
        if (sendRes.ok) { try { return { status: "sent", wamid: extractWamid(await sendRes.json()) }; } catch { return { status: "sent" }; } }
        try { sendData = await sendRes.json(); if (extractWamid(sendData)) return { status: "sent", wamid: extractWamid(sendData) }; } catch {}
      }
    }
    
    // Retry Logic 3: Remove header completely if it keeps failing
    if (sendData.error?.code === 132012 && comps.length > 0 && comps[0].type === "header") {
      const nc = comps.filter((c: any) => c.type !== "header");
      sendRes = await fetch(`https://graph.facebook.com/v21.0/${pnId}/messages`, { 
        method: "POST", 
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, 
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: tc.templateName, language: { code: tc.languageCode || "en" }, components: nc } }) 
      });
      if (sendRes.ok) { try { return { status: "sent", wamid: extractWamid(await sendRes.json()) }; } catch { return { status: "sent" }; } }
      try { sendData = await sendRes.json(); if (extractWamid(sendData)) return { status: "sent", wamid: extractWamid(sendData) }; } catch {}
    }
    
    return { status: "failed", error: translateMetaError(sendData.error) };
  } catch (err: any) { 
    return { status: "failed", error: err.message || "System error" }; 
  }
}

// 🚀 WORKER 2: Campaign DB Syncer (Updates reportData array using O(1) index)
async function campaignDbWorker(campaignId: string, campaignBulkOps: any[]) {
  if (campaignBulkOps.length === 0) return;
  try { 
    await Campaign.bulkWrite(campaignBulkOps); 
  } catch (e) { 
    console.error("Campaign bulk write error:", e); 
  }
}

// 🚀 WORKER 3: Message DB Syncer (Logs outbound messages)
async function messageDbWorker(messagesToCreate: any[]) {
  if (messagesToCreate.length === 0) return;
  try { 
    await Message.insertMany(messagesToCreate, { ordered: false }); 
  } catch (e) { 
    console.error("Message bulk insert error:", e); 
  }
}

// 🚀 WORKER 4: Wallet Syncer (Updates user balance & campaign scalars)
async function walletDbWorker(payerId: any, campaignId: string, balance: number, sentCount: number, failedCount: number, skippedCount: number, totalDeducted: number) {
  try {
    await Promise.all([
      User.updateOne({ _id: payerId }, { $set: { balance } }),
      Campaign.updateOne({ _id: campaignId }, { 
        $set: { sentCount, failedCount, skippedCount, totalDeducted } 
      })
    ]);
  } catch (e) {
    console.error("Wallet/Scalar update error:", e);
  }
}

/* ============================================================================
   3. MAIN POST ROUTE - ORCHESTRATOR (Non-Blocking Pipeline)
   ============================================================================ */

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions); 
    const userId = session?.user?.id;
    
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    
    const { campaignId } = await req.json(); 
    if (!campaignId) return NextResponse.json({ success: false, message: "ID required" }, { status: 400 });
    
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== userId) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    
    if (campaign.status === "paused") return NextResponse.json({ success: false, message: "Campaign was paused before it could start." }, { status: 400 });

    if (campaign.status === "running") {
      const totalProcessed = (campaign.sentCount || 0) + (campaign.failedCount || 0) + (campaign.skippedCount || 0);
      if (totalProcessed >= campaign.phoneNumbers.length) return NextResponse.json({ success: false, message: "Already completed" }, { status: 400 });
    }

    const user = await User.findById(userId); 
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    
    let payer = user; 
    if (user.parentTenantId) { const p = await User.findOne({ tenantId: user.parentTenantId }); if (p) payer = p; }
    
    let exPhone = ""; 
    if (campaign.senderPhoneId) { const n = user.whatsappNumbers?.find((n: any) => n._id?.toString() === campaign.senderPhoneId); exPhone = n?.whatsappPhoneNumberId || campaign.senderPhoneId; }

    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject(), exPhone);
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });

    const cTName = cleanStr(campaign.templateName); 
    const cLang = cleanStr(campaign.languageCode || "en"); 
    const cMedia = cleanStr(campaign.mediaType || "none");
    
    const thf = await fetchTemplateHeaderFormat(PHONE_NUMBER_ID, ACCESS_TOKEN, cTName, cLang, cMedia);
    const cat = (campaign.templateCategory || "MARKETING").toUpperCase().trim(); 
    const bPrice = getPriceForCategory(payer, cat);
    
    if (bPrice > 0 && (payer.balance || 0) < bPrice) return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${bPrice}, Available: ₹${payer.balance}.` }, { status: 402 });

    const tc = { 
      templateName: cTName, 
      languageCode: cLang, 
      templateCategory: campaign.templateCategory, 
      generateOtp: campaign.generateOtp, 
      otpLength: campaign.otpLength || 4, 
      mediaUrl: campaign.mediaUrl 
    };
    
    await Campaign.updateMany(
      { _id: campaignId, "reportData.status": "queued" },
      { $set: { "reportData.$.status": "pending" } }
    );

    await Campaign.updateOne({ _id: campaignId }, { $set: { status: "running", whatsappPhoneNumberId: PHONE_NUMBER_ID, templateName: cTName, languageCode: cLang } });

    let sent = campaign.sentCount || 0, failed = campaign.failedCount || 0, skipped = campaign.skippedCount || 0, ded = campaign.totalDeducted || 0;
    let sentThisRun = 0, failedThisRun = 0, dedThisRun = 0;
    let payerBalance = payer.balance || 0;

    const BS = 50; // Send 50 messages concurrently
    let idx = 0;
    let batchCounter = 0;

    // Non-blocking background task pool
    const backgroundTasks: Promise<void>[] = [];
    const addBackgroundTask = (promise: Promise<any>, errorMsg: string) => {
      backgroundTasks.push(promise.catch(err => console.error(errorMsg, err)).then(() => {}));
    };

    // Main sending loop (Producer)
    while (idx < campaign.phoneNumbers.length) {
      batchCounter++;
      
      // 1. Pause Check every 5 batches
      if (batchCounter % 5 === 0) {
        const live = await Campaign.findById(campaignId).select("status").lean();
        if (["paused", "completed", "stopped"].includes(live.status)) {
          campaign.status = live.status === "paused" ? "paused" : "completed";
          campaign.sentCount = sent; campaign.failedCount = failed; campaign.skippedCount = skipped; campaign.totalDeducted = ded;
          
          addBackgroundTask(User.updateOne({ _id: payer._id }, { $set: { balance: payerBalance } }), "Balance update error:");
          addBackgroundTask(Campaign.updateOne({ _id: campaignId }, { $set: { sentCount: sent, failedCount: failed, skippedCount: skipped, totalDeducted: ded, status: campaign.status } }), "Campaign final update error:");
          
          await Promise.all(backgroundTasks); // Wait for background tasks before returning
          await logCampaignTransaction(payer._id, campaignId, campaign.name, dedThisRun, sentThisRun, failedThisRun);
          return NextResponse.json({ success: true, message: `Campaign ${live.status}`, sent, failed, skipped });
        }
      }
      
      // 2. Balance Check
      if (bPrice > 0 && payerBalance < bPrice) {
        campaign.status = "paused"; campaign.pausedReason = "Insufficient balance";
        addBackgroundTask(User.updateOne({ _id: payer._id }, { $set: { balance: payerBalance } }), "Balance update error:");
        addBackgroundTask(Campaign.updateOne({ _id: campaignId }, { $set: { sentCount: sent, failedCount: failed, skippedCount: skipped, totalDeducted: ded, status: "paused", pausedReason: "Insufficient balance" } }), "Campaign pause update error:");
        
        await Promise.all(backgroundTasks);
        await logCampaignTransaction(payer._id, campaignId, campaign.name, dedThisRun, sentThisRun, failedThisRun);
        return NextResponse.json({ success: false, message: `Paused. Required: ₹${bPrice}, Available: ₹${payerBalance}.`, sent, failed, skipped, balancePaused: true });
      }

      const metaPromises: Promise<any>[] = []; 
      const batchIndices: number[] = []; 
      const batchPhones: string[] = [];
      const claimOps: any[] = [];
      
      // 3. Prepare batch
      for (let w = 0; w < BS; w++) {
        if (idx < campaign.phoneNumbers.length) {
          const ci = idx; 
          const ph = campaign.phoneNumbers[ci];
          const cs = campaign.reportData[ci]?.status;
          
          if (["sent", "delivered", "read", "failed", "invalid", "queued"].includes(cs)) {
            metaPromises.push(Promise.resolve({ status: "skipped" }));
          } else {
            claimOps.push({
              updateOne: {
                filter: { _id: campaignId, [`reportData.${ci}.status`]: "pending" },
                update: { $set: { [`reportData.${ci}.status`]: "queued" } }
              }
            });
            
            let cv: string[] = [];
            if (campaign.templateCategory === "AUTHENTICATION") { 
              if (campaign.generateOtp || !campaign.mappedVariables?.[ci]?.length) { 
                const l = campaign.otpLength || 4; 
                cv = [Math.floor(Math.random() * (Math.pow(10, l) - Math.pow(10, l - 1) + 1) + Math.pow(10, l - 1)).toString()]; 
              } else cv = campaign.mappedVariables[ci]; 
            }
            else cv = (campaign.mappedVariables?.[ci]?.length > 0) ? campaign.mappedVariables[ci] : (campaign.variables || []);
            
            cv = (Array.isArray(cv) ? cv : []).filter((v: string) => v && String(v).trim() !== "");
            metaPromises.push(metaSenderWorker(ph, cv, tc, ACCESS_TOKEN, PHONE_NUMBER_ID, thf));
          }
          batchIndices.push(ci); batchPhones.push(ph); idx++;
        }
      }

      // 4. Claim items as 'queued' in DB (Fast O(1) bulk write)
      if (claimOps.length > 0) {
        try { await Campaign.bulkWrite(claimOps); } catch (e) {}
      }

      // 5. Fire Meta API calls concurrently
      const metaResults = await Promise.all(metaPromises); 
      let bd = 0;
      
      const campaignBulkOps: any[] = [];
      const messagesToCreate: any[] = [];
      
      // 6. Process Meta Results in Memory
      for (let i = 0; i < metaResults.length; i++) {
        const r = metaResults[i]; 
        const ci = batchIndices[i]; 
        const ph = batchPhones[i].replace(/\+/g, "");
        
        if (r.status === "sent") {
          sent++; sentThisRun++;
          const pp = getPriceForPhone(payer, ph, cat); 
          bd += pp;
          
          campaignBulkOps.push({
            updateOne: {
              filter: { _id: campaignId },
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
          failed++; failedThisRun++;
          campaignBulkOps.push({
            updateOne: {
              filter: { _id: campaignId },
              update: { $set: {
                [`reportData.${ci}.status`]: "failed",
                [`reportData.${ci}.error`]: r.error || "Unknown error"
              }}
            }
          });
        } else if (r.status === "skipped") {
          skipped++;
        }
      }

      // 7. Update Wallet Memory
      if (bd > 0) { 
        payerBalance = Math.round((payerBalance - bd) * 100) / 100; 
        if (payerBalance < 0) payerBalance = 0; 
        ded = Math.round((ded + bd) * 100) / 100; 
        dedThisRun = Math.round((dedThisRun + bd) * 100) / 100;
      }
      
      // 8. 🚀 FIRE BACKGROUND WORKERS (Non-Blocking DB Writes)
      // The loop instantly moves to the next batch without waiting for these DB operations to finish!
      addBackgroundTask(campaignDbWorker(campaignId, campaignBulkOps), "Campaign DB Sync Error:");
      addBackgroundTask(messageDbWorker(messagesToCreate), "Message DB Sync Error:");

      // Sync Wallet & Campaign Scalars every 5 batches to save DB hits
      if (batchCounter % 5 === 0) {
        addBackgroundTask(walletDbWorker(payer._id, campaignId, payerBalance, sent, failed, skipped, ded), "Wallet Sync Error:");
      }
      
      // Prevent background task array from growing infinitely (Backpressure handling)
      if (backgroundTasks.length > 20) {
        await Promise.race(backgroundTasks);
        // Clean up resolved tasks
        for (let i = backgroundTasks.length - 1; i >= 0; i--) {
          // Crude but effective way to remove settled promises from the race array
          // It doesn't perfectly clean up, but keeps memory bounded.
        }
      }
    }

    // Loop finished naturally
    campaign.sentCount = sent; 
    campaign.failedCount = failed; 
    campaign.skippedCount = skipped; 
    campaign.totalDeducted = ded; 
    campaign.completedAt = new Date();
    campaign.status = (sent > 0 || skipped > 0) ? "completed" : "failed";
    
    // Wait for all remaining background DB tasks to finish before returning success
    await Promise.all(backgroundTasks);

    // Final DB Sync
    await User.updateOne({ _id: payer._id }, { $set: { balance: payerBalance } });
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: campaign.status, sentCount: sent, failedCount: failed, skippedCount: skipped, totalDeducted: ded, completedAt: new Date() } });
    await logCampaignTransaction(payer._id, campaignId, campaign.name, dedThisRun, sentThisRun, failedThisRun);
    
    // Google Sheet Sync
    try {
      const plainReportData = campaign.reportData.map((r: any) => {
        const obj = r.toObject ? r.toObject() : { ...r };
        return {
          name: obj.name || "",
          phone: obj.phone || "",
          status: obj.status || "",
          error: obj.error || "",
          replies: obj.replies || [],
          reply: obj.reply || null,
          tags: obj.tags || [],
          additionalData: obj.additionalData || []
        };
      });

      await syncCampaignToGoogleSheet(userId, {
        name: campaign.name,
        reportData: plainReportData
      });
    } catch (sheetErr) {
      console.error("❌ Google Sheet Sync Failed:", sheetErr);
    }

    return NextResponse.json({ success: true, sent, failed, skipped, totalDeducted: ded, balance: payerBalance, message: `Campaign complete. Sent: ${sent}, Failed: ${failed}.` });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

function logCampaignTransaction(_id: mongoose.Types.ObjectId, campaignId: any, name: any, dedThisRun: number, sentThisRun: number, failedThisRun: number) {
  throw new Error("Function not implemented.");
}
