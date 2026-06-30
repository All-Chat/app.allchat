/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

export const runtime = "nodejs";

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
   2. WORKER & BULK UPDATE LOGIC
   ============================================================================ */

async function workerProcess(phone: string, variables: string[], tc: any, token: string, pnId: string, thf: string): Promise<{ status: string; wamid?: string | null; error?: string }> {
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

// ✅ FIX: Bulletproof safe update that NEVER crashes the route
async function safeUpdateCampaign(campaignId: string, campaignData: any, batchIndices: number[]) {
  const bulkOps = [];
  for (const i of batchIndices) {
    const item = campaignData.reportData[i]; 
    if (!item) continue;
    
    const uSet: any = {}; 
    let allow = ["pending", "queued", "sent", "failed", "invalid"]; // Added 'queued' to allow transition
    
    if (item.status === "sent") { 
      uSet["reportData.$.status"] = "sent"; 
      uSet["reportData.$.sentWamid"] = item.sentWamid; 
      uSet["reportData.$.charged"] = item.charged; 
      uSet["reportData.$.chargedAmount"] = item.chargedAmount; 
    } else if (item.status === "failed") { 
      uSet["reportData.$.status"] = "failed"; 
      uSet["reportData.$.error"] = item.error; 
    } else continue;
    
    bulkOps.push({ 
      updateOne: { 
        filter: { _id: campaignId, "reportData.phone": item.phone, "reportData.status": { $in: allow } }, 
        update: { $set: uSet } 
      } 
    });
  }
  
  if (bulkOps.length > 0) try { await Campaign.bulkWrite(bulkOps); } catch (e) { console.error("Bulk write error:", e); }
  
  try { 
    await Campaign.updateOne({ _id: campaignId }, { 
      $set: { 
        sentCount: campaignData.sentCount, 
        failedCount: campaignData.failedCount, 
        skippedCount: campaignData.skippedCount, 
        totalDeducted: campaignData.totalDeducted, 
        pausedReason: campaignData.pausedReason, 
        completedAt: campaignData.completedAt 
        // ✅ FIX: REMOVED `status: campaignData.status` from here. 
        // This was overwriting the "paused" status in the DB every batch!
      } 
    }); 
  } catch (e) { console.error("Scalar update error:", e); }
}

/* ============================================================================
   3. MAIN POST ROUTE - START / RESUME
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
    
    // ✅ FIX: If it was paused before the loop could start, abort immediately.
    if (campaign.status === "paused") {
      return NextResponse.json({ success: false, message: "Campaign was paused before it could start." }, { status: 400 });
    }

    if (campaign.status === "running") {
      const totalProcessed = (campaign.sentCount || 0) + (campaign.failedCount || 0) + (campaign.skippedCount || 0);
      if (totalProcessed >= campaign.phoneNumbers.length) {
        return NextResponse.json({ success: false, message: "Already completed" }, { status: 400 });
      }
      // If not completed, we let it proceed to restart the loop (Resume logic)
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
    
    // ✅ FIX: Recover any messages that were marked "queued" in a previous crashed/paused loop
    await Campaign.updateMany(
      { _id: campaignId, "reportData.status": "queued" },
      { $set: { "reportData.$.status": "pending" } }
    );

    await Campaign.updateOne({ _id: campaignId }, { $set: { status: "running", whatsappPhoneNumberId: PHONE_NUMBER_ID, templateName: cTName, languageCode: cLang } });

    let sent = campaign.sentCount || 0, failed = campaign.failedCount || 0, skipped = campaign.skippedCount || 0, ded = campaign.totalDeducted || 0;
    const BS = 4; // Batch Size
    let idx = 0;

    // Main sending loop
    while (idx < campaign.phoneNumbers.length) {
      // Check live status (Pause/Stop detection)
      const live = await Campaign.findById(campaignId).select("status");
      if (["paused", "completed", "stopped"].includes(live.status)) {
        campaign.status = live.status === "paused" ? "paused" : "completed";
        campaign.sentCount = sent; campaign.failedCount = failed; campaign.skippedCount = skipped; campaign.totalDeducted = ded;
        await User.updateOne({ _id: payer._id }, { $set: { balance: payer.balance } });
        await safeUpdateCampaign(campaignId, campaign, []);
        await Campaign.updateOne({ _id: campaignId }, { $set: { status: campaign.status } }); // Explicitly save final status
        return NextResponse.json({ success: true, message: `Campaign ${live.status}`, sent, failed, skipped });
      }
      
      // Balance check
      if (bPrice > 0 && payer.balance < bPrice) {
        campaign.status = "paused"; campaign.sentCount = sent; campaign.failedCount = failed; campaign.skippedCount = skipped; campaign.totalDeducted = ded; campaign.pausedReason = "Insufficient balance";
        await User.updateOne({ _id: payer._id }, { $set: { balance: payer.balance } });
        await safeUpdateCampaign(campaignId, campaign, []);
        await Campaign.updateOne({ _id: campaignId }, { $set: { status: campaign.status } }); // Explicitly save final status
        return NextResponse.json({ success: false, message: `Paused. Required: ₹${bPrice}, Available: ₹${payer.balance}.`, sent, failed, skipped, balancePaused: true });
      }

      const wp: any[] = []; const bi: number[] = []; const bp: string[] = [];
      
      // Prepare batch
      for (let w = 0; w < BS; w++) {
        if (idx < campaign.phoneNumbers.length) {
          const ci = idx; 
          const ph = campaign.phoneNumbers[ci];
          const cs = campaign.reportData[ci]?.status;
          
          if (["sent", "delivered", "read", "failed", "invalid", "queued"].includes(cs)) {
            wp.push(Promise.resolve({ status: "skipped" }));
          } else {
            // ✅ ATOMIC CLAIM: Lock this number so duplicate loops don't send it
            const claim = await Campaign.updateOne(
              { _id: campaignId, "reportData.phone": ph, "reportData.status": "pending" },
              { $set: { "reportData.$.status": "queued" } }
            );
            
            if (claim.modifiedCount > 0) {
              let cv: string[] = [];
              if (campaign.templateCategory === "AUTHENTICATION") { 
                if (campaign.generateOtp || !campaign.mappedVariables?.[ci]?.length) { 
                  const l = campaign.otpLength || 4; 
                  cv = [Math.floor(Math.random() * (Math.pow(10, l) - Math.pow(10, l - 1) + 1) + Math.pow(10, l - 1)).toString()]; 
                } else cv = campaign.mappedVariables[ci]; 
              }
              else cv = (campaign.mappedVariables?.[ci]?.length > 0) ? campaign.mappedVariables[ci] : (campaign.variables || []);
              
              cv = (Array.isArray(cv) ? cv : []).filter((v: string) => v && String(v).trim() !== "");
              wp.push(workerProcess(ph, cv, tc, ACCESS_TOKEN, PHONE_NUMBER_ID, thf));
            } else {
              // Failed to claim (another loop got it), skip
              wp.push(Promise.resolve({ status: "skipped" }));
            }
          }
          bi.push(ci); bp.push(ph); idx++;
        }
      }

      const res = await Promise.all(wp); 
      let bd = 0;
      
      // Process batch results
      for (let i = 0; i < res.length; i++) {
        const r = res[i]; 
        const ci = bi[i]; 
        const ph = bp[i].replace(/\+/g, "");
        
        if (r.status === "sent") {
          sent++; 
          const pp = getPriceForPhone(payer, ph, cat); 
          bd += pp;
          if (campaign.reportData[ci]) { 
            campaign.reportData[ci].status = "sent"; 
            campaign.reportData[ci].sentWamid = r.wamid; 
            campaign.reportData[ci].charged = true; 
            campaign.reportData[ci].chargedAmount = pp; 
          }
          try { 
            await Message.create({ 
              userId, phone: ph, text: "", direction: "out", messageType: "template", 
              mediaUrl: tc.mediaUrl || null, whatsappMessageId: r.wamid, status: "sent", 
              templateName: tc.templateName, templateLanguage: tc.languageCode, whatsappPhoneNumberId: PHONE_NUMBER_ID 
            }); 
          } catch {}
        } else if (r.status === "failed") {
          failed++; 
          if (campaign.reportData[ci]) { 
            campaign.reportData[ci].status = "failed"; 
            campaign.reportData[ci].error = r.error || "Unknown error"; 
          }
        } else if (r.status === "skipped") {
          skipped++;
        }
      }

      // Deduct balance dynamically
      if (bd > 0) { 
        payer.balance = Math.round((payer.balance - bd) * 100) / 100; 
        if (payer.balance < 0) payer.balance = 0; 
        ded = Math.round((ded + bd) * 100) / 100; 
      }
      
      await User.updateOne({ _id: payer._id }, { $set: { balance: payer.balance } });
      await safeUpdateCampaign(campaignId, campaign, bi);
      await new Promise(r => setTimeout(r, 50)); // Tiny delay to prevent API spam
    }

    // Loop finished naturally
    campaign.sentCount = sent; 
    campaign.failedCount = failed; 
    campaign.skippedCount = skipped; 
    campaign.totalDeducted = ded; 
    campaign.completedAt = new Date();
    campaign.status = (sent > 0 || skipped > 0) ? "completed" : "failed";
    
    await User.updateOne({ _id: payer._id }, { $set: { balance: payer.balance } });
    await safeUpdateCampaign(campaignId, campaign, []);
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: campaign.status } }); // Explicitly save final status
    
    try { await syncCampaignToGoogleSheet(userId, { name: campaign.name, reportData: campaign.reportData }); } catch {}

    return NextResponse.json({ success: true, sent, failed, skipped, totalDeducted: ded, balance: payer.balance, message: `Campaign complete. Sent: ${sent}, Failed: ${failed}.` });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
