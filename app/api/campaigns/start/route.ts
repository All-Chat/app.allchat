/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

export const runtime = "nodejs";

function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s;
}

function resolveCredentials(
  user: any,
  payer: any,
  explicitPhoneId?: string
): { PHONE_NUMBER_ID: string; ACCESS_TOKEN: string } {
  let PHONE_NUMBER_ID = cleanStr(explicitPhoneId || "");
  let ACCESS_TOKEN = "";

  if (PHONE_NUMBER_ID) {
    if (user?.whatsappNumbers?.length > 0) {
      const m = user.whatsappNumbers.find(
        (n: any) =>
          n.whatsappPhoneNumberId === PHONE_NUMBER_ID ||
          n.phoneNumberId === PHONE_NUMBER_ID ||
          n.id === PHONE_NUMBER_ID ||
          n._id?.toString() === PHONE_NUMBER_ID
      );
      if (m) ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || "";
    }
    if (!ACCESS_TOKEN && payer?.whatsappNumbers?.length > 0) {
      const m = payer.whatsappNumbers.find(
        (n: any) =>
          n.whatsappPhoneNumberId === PHONE_NUMBER_ID ||
          n.phoneNumberId === PHONE_NUMBER_ID ||
          n.id === PHONE_NUMBER_ID ||
          n._id?.toString() === PHONE_NUMBER_ID
      );
      if (m) ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || "";
    }
    if (!ACCESS_TOKEN) ACCESS_TOKEN = user?.whatsappAccessToken || payer?.whatsappAccessToken || "";
    if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
    return { PHONE_NUMBER_ID, ACCESS_TOKEN };
  }

  if (user?.whatsappPhoneNumberId) {
    PHONE_NUMBER_ID = user.whatsappPhoneNumberId;
    ACCESS_TOKEN = user.whatsappAccessToken || "";
  }

  if (!PHONE_NUMBER_ID && user?.whatsappNumbers?.length > 0) {
    const active = user.whatsappNumbers.find((n: any) => n.isActive) || user.whatsappNumbers[0];
    PHONE_NUMBER_ID = active.whatsappPhoneNumberId || active.phoneNumberId || active.id || "";
    ACCESS_TOKEN = active.whatsappAccessToken || active.accessToken || user.whatsappAccessToken || "";
  }

  if (!PHONE_NUMBER_ID && payer?.whatsappPhoneNumberId) {
    PHONE_NUMBER_ID = payer.whatsappPhoneNumberId;
    ACCESS_TOKEN = payer.whatsappAccessToken || "";
  }

  if (!PHONE_NUMBER_ID && payer?.whatsappNumbers?.length > 0) {
    const active = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0];
    PHONE_NUMBER_ID = active.whatsappPhoneNumberId || active.phoneNumberId || active.id || "";
    ACCESS_TOKEN = active.whatsappAccessToken || active.accessToken || payer.whatsappAccessToken || "";
  }

  if (!PHONE_NUMBER_ID) PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";

  return { PHONE_NUMBER_ID, ACCESS_TOKEN };
}

function getPriceForPhone(payer: any, phone: string, category: string): number {
  if (payer.enabledCountries && payer.enabledCountries.length > 0) {
    const matchedCountry = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
    if (matchedCountry) {
      if (category === "MARKETING") return matchedCountry.priceMarketing || 0;
      if (category === "UTILITY") return matchedCountry.priceUtility || 0;
      if (category === "AUTHENTICATION") return matchedCountry.priceAuthentication || 0;
    }
    return -1;
  }
  return getPriceForCategory(payer, category);
}

async function fetchTemplateHeaderFormat(
  phoneNumberId: string,
  accessToken: string,
  templateName: string,
  languageCode: string,
  userProvidedMediaType: string
): Promise<string> {
  const validMediaTypes = ["image", "video", "document"];
  const cleanMediaType = cleanStr(userProvidedMediaType).toLowerCase().trim();

  try {
    let res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}&language=${encodeURIComponent(languageCode)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const tpl = data?.data?.[0];
      if (tpl?.components) {
        for (const comp of tpl.components) {
          if (comp.type === "HEADER") return (comp.format || "none").toUpperCase();
        }
      }
    }

    res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const tpl = data?.data?.[0];
      if (tpl?.components) {
        for (const comp of tpl.components) {
          if (comp.type === "HEADER") return (comp.format || "none").toUpperCase();
        }
      }
    }
  } catch (err) {
    console.error("⚠️ Template fetch failed:", err);
  }

  if (validMediaTypes.includes(cleanMediaType)) {
    console.log(`⚠️ API couldn't detect header, using user-provided: ${cleanMediaType}`);
    return cleanMediaType.toUpperCase();
  }

  return "none";
}

function buildCampaignComponents(
  headerFormat: string,
  variables: string[],
  mediaUrl: string
): any[] {
  const components: any[] = [];
  const validMediaTypes = ["image", "video", "document"];
  const needsMedia = validMediaTypes.includes(headerFormat.toLowerCase());

  if (needsMedia && mediaUrl) {
    const headerType = headerFormat.toLowerCase();
    let mediaObj: any = mediaUrl.startsWith("http") ? { link: mediaUrl } : { id: mediaUrl };

    const param: any = { type: headerType };
    if (headerType === "image") param.image = mediaObj;
    else if (headerType === "video") param.video = mediaObj;
    else if (headerType === "document") param.document = { ...mediaObj, filename: "document.pdf" };

    components.push({ type: "header", parameters: [param] });
  }

  if (variables.length > 0) {
    components.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: String(v) })) });
  }

  return components;
}

// ✅ KEY FIX: Extract WAMID regardless of HTTP status code
function extractWamid(data: any): string | null {
  if (data?.messages?.[0]?.id) return data.messages[0].id;
  return null;
}

async function workerProcess(
  phone: string,
  campaignDoc: any,
  index: number,
  token: string,
  phoneNumberId: string,
  templateHeaderFormat: string
): Promise<{ status: string; wamid?: string | null }> {
  const currentStatus = campaignDoc.reportData[index]?.status;
  if (["sent", "delivered", "read", "failed", "invalid"].includes(currentStatus)) {
    return { status: "skipped" };
  }

  try {
    let currentVariables: string[] = [];

    if (campaignDoc.templateCategory === "AUTHENTICATION") {
      if (campaignDoc.generateOtp || currentVariables.length === 0) {
        const len = campaignDoc.otpLength || 4;
        const min = Math.pow(10, len - 1);
        const max = Math.pow(10, len) - 1;
        const otp = Math.floor(Math.random() * (max - min + 1) + min).toString();
        currentVariables = [otp];
      } else if (campaignDoc.mappedVariables?.[index]?.length > 0) {
        currentVariables = campaignDoc.mappedVariables[index];
      } else {
        currentVariables = campaignDoc.variables || [];
      }
    } else {
      if (campaignDoc.mappedVariables?.[index]?.length > 0) {
        currentVariables = campaignDoc.mappedVariables[index];
      } else {
        currentVariables = campaignDoc.variables || [];
      }
    }

    currentVariables = (Array.isArray(currentVariables) ? currentVariables : []).filter((v: string) => v && String(v).trim() !== "");

    let components = buildCampaignComponents(templateHeaderFormat, currentVariables, campaignDoc.mediaUrl || "");

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: { name: campaignDoc.templateName, language: { code: campaignDoc.languageCode || "en" }, components },
    };

    let sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let sendData = await sendRes.json();

    // ✅ KEY FIX: Check for WAMID first!
    let wamid = extractWamid(sendData);
    if (wamid) return { status: "sent", wamid };

    // ✅ Retry 131008
    if (sendData.error?.code === 131008 && campaignDoc.templateCategory === "AUTHENTICATION" && currentVariables.length > 0) {
      const retryComponents: any[] = [];
      if (components.length > 0 && components[0].type === "header") retryComponents.push(components[0]);
      retryComponents.push({ type: "body", parameters: currentVariables.map((v: string) => ({ type: "text", text: String(v) })) });
      retryComponents.push({ type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: String(currentVariables[0]) }] });

      sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: campaignDoc.templateName, language: { code: campaignDoc.languageCode || "en" }, components: retryComponents } }),
      });
      sendData = await sendRes.json();
      wamid = extractWamid(sendData);
      if (wamid) return { status: "sent", wamid };
    }

    // ✅ Retry 132012 - parse expected format
    if (sendData.error?.code === 132012 && (campaignDoc.mediaUrl)) {
      const details = sendData.error?.error_data?.details || "";
      const match = details.match(/expected\s+(\w+)/i);
      if (match) {
        const expectedFormat = match[1].toUpperCase();
        const validMediaTypes = ["IMAGE", "VIDEO", "DOCUMENT"];
        if (validMediaTypes.includes(expectedFormat)) {
          components = buildCampaignComponents(expectedFormat, currentVariables, campaignDoc.mediaUrl);
          sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: campaignDoc.templateName, language: { code: campaignDoc.languageCode || "en" }, components } }),
          });
          sendData = await sendRes.json();
          wamid = extractWamid(sendData);
          if (wamid) return { status: "sent", wamid };
        }
      }
    }

    // ✅ Retry 132012 - try without header
    if (sendData.error?.code === 132012 && components.length > 0 && components[0].type === "header") {
      const noHeaderComponents = components.filter((c: any) => c.type !== "header");
      sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: campaignDoc.templateName, language: { code: campaignDoc.languageCode || "en" }, components: noHeaderComponents } }),
      });
      sendData = await sendRes.json();
      wamid = extractWamid(sendData);
      if (wamid) return { status: "sent", wamid };
    }

    console.error(`❌ Send error for ${phone}:`, sendData.error?.message);
    return { status: "failed" };
  } catch (err: any) {
    console.error(`❌ Send error for ${phone}:`, err.message);
    return { status: "failed" };
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== userId) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status === "running") {
      return NextResponse.json({ success: false, message: "Campaign is already running" }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    let payer = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) payer = parent;
    }

    let explicitPhoneId = "";
    if (campaign.senderPhoneId) {
      const selectedNumber = user.whatsappNumbers?.find((n: any) => n._id?.toString() === campaign.senderPhoneId);
      if (selectedNumber) {
        explicitPhoneId = selectedNumber.whatsappPhoneNumberId || "";
      } else {
        explicitPhoneId = campaign.senderPhoneId;
      }
    }

    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject(), explicitPhoneId);

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });
    }

    const cleanTemplateName = cleanStr(campaign.templateName);
    const cleanLanguageCode = cleanStr(campaign.languageCode || "en");
    const cleanMediaType = cleanStr(campaign.mediaType || "none");

    const templateHeaderFormat = await fetchTemplateHeaderFormat(PHONE_NUMBER_ID, ACCESS_TOKEN, cleanTemplateName, cleanLanguageCode, cleanMediaType);
    console.log(`📋 Campaign template "${cleanTemplateName}" header: ${templateHeaderFormat}`);

    const category = (campaign.templateCategory || "MARKETING").toUpperCase().trim();
    const basePrice = getPriceForCategory(payer, category);
    const currentBalance = payer.balance || 0;

    if (basePrice > 0 && currentBalance < basePrice) {
      return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${basePrice}, Available: ₹${currentBalance}.` }, { status: 402 });
    }

    campaign.status = "running";
    campaign.whatsappPhoneNumberId = PHONE_NUMBER_ID;
    campaign.templateName = cleanTemplateName;
    campaign.languageCode = cleanLanguageCode;
    await campaign.save();

    let sentCount = campaign.sentCount || 0;
    let failedCount = campaign.failedCount || 0;
    let skippedCount = campaign.skippedCount || 0;
    let totalDeducted = campaign.totalDeducted || 0;

    const BATCH_SIZE = 4;
    let index = 0;

    while (index < campaign.phoneNumbers.length) {
      const liveCampaign = await Campaign.findById(campaignId);
      if (liveCampaign.status === "paused") {
        campaign.status = "paused";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        campaign.skippedCount = skippedCount;
        campaign.totalDeducted = totalDeducted;
        await payer.save();
        await campaign.save();
        return NextResponse.json({ success: true, message: "Campaign paused", sent: sentCount, failed: failedCount, skipped: skippedCount });
      }
      if (liveCampaign.status === "completed" || liveCampaign.status === "stopped") {
        campaign.status = "completed";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        campaign.skippedCount = skippedCount;
        campaign.totalDeducted = totalDeducted;
        await payer.save();
        await campaign.save();
        return NextResponse.json({ success: true, message: "Campaign stopped", sent: sentCount, failed: failedCount, skipped: skippedCount });
      }

      if (basePrice > 0 && payer.balance < basePrice) {
        campaign.status = "paused";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        campaign.skippedCount = skippedCount;
        campaign.totalDeducted = totalDeducted;
        campaign.pausedReason = "Insufficient balance";
        await payer.save();
        await campaign.save();
        return NextResponse.json({ success: false, message: `Campaign paused. Required: ₹${basePrice}, Available: ₹${payer.balance}.`, sent: sentCount, failed: failedCount, skipped: skippedCount, balancePaused: true });
      }

      const workerPromises: Promise<{ status: string; wamid?: string | null }>[] = [];
      const batchIndices: number[] = [];
      const batchPhones: string[] = [];

      for (let w = 0; w < BATCH_SIZE; w++) {
        if (index < campaign.phoneNumbers.length) {
          batchIndices.push(index);
          batchPhones.push(campaign.phoneNumbers[index]);
          workerPromises.push(workerProcess(campaign.phoneNumbers[index], campaign, index, ACCESS_TOKEN, PHONE_NUMBER_ID, templateHeaderFormat));
          index++;
        }
      }

      const results = await Promise.all(workerPromises);
      let batchDeducted = 0;

      results.forEach((res, i) => {
        const currentI = batchIndices[i];
        const phone = batchPhones[i];

        if (res.status === "sent") {
          sentCount++;
          const phonePrice = getPriceForPhone(payer, phone, category);
          if (phonePrice >= 0) {
            batchDeducted += phonePrice;
          } else {
            failedCount++;
            sentCount--;
            if (campaign.reportData[currentI]) {
              campaign.reportData[currentI].status = "failed";
              campaign.reportData[currentI].error = "Country not enabled";
            }
            return;
          }
          if (campaign.reportData[currentI]) {
            campaign.reportData[currentI].status = "sent";
            campaign.reportData[currentI].sentWamid = res.wamid;
            campaign.reportData[currentI].charged = true;
            campaign.reportData[currentI].chargedAmount = phonePrice;
          }
        } else if (res.status === "failed") {
          failedCount++;
          if (campaign.reportData[currentI]) campaign.reportData[currentI].status = "failed";
        } else if (res.status === "skipped") {
          skippedCount++;
        }
      });

      if (batchDeducted > 0) {
        payer.balance = Math.round((payer.balance - batchDeducted) * 100) / 100;
        if (payer.balance < 0) payer.balance = 0;
        totalDeducted = Math.round((totalDeducted + batchDeducted) * 100) / 100;
      }

      await payer.save();
      await campaign.save();

      try { await syncCampaignToGoogleSheet(userId, { name: campaign.name, reportData: campaign.reportData }); } catch {}

      await new Promise((r) => setTimeout(r, 50));
    }

    campaign.sentCount = sentCount;
    campaign.failedCount = failedCount;
    campaign.skippedCount = skippedCount;
    campaign.totalDeducted = totalDeducted;
    campaign.status = sentCount > 0 ? "completed" : "failed";
    campaign.completedAt = new Date();
    await payer.save();
    await campaign.save();

    try { await syncCampaignToGoogleSheet(userId, { name: campaign.name, reportData: campaign.reportData }); } catch {}

    return NextResponse.json({ success: true, sent: sentCount, failed: failedCount, skipped: skippedCount, totalDeducted, balance: payer.balance, message: "Campaign complete." });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
