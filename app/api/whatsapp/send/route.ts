/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import { checkLimit, incrementUsage } from "@/lib/limits";

export const runtime = "nodejs";

async function fetchFullTemplate(phoneNumberId: string, accessToken: string, templateName: string, languageCode: string): Promise<any | null> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}&language=${encodeURIComponent(languageCode)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0] || null;
  } catch { return null; }
}

function extractTemplateDisplayData(metaTemplate: any, variables: string[], headerMediaId: string | null) {
  const result: any = { templateHeaderType: "none" };
  if (!metaTemplate?.components) return result;
  for (const comp of metaTemplate.components) {
    if (comp.type === "HEADER") {
      if (comp.format === "TEXT" && comp.text) { result.templateHeaderType = "text"; result.templateHeaderText = comp.text; }
      else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(comp.format)) { result.templateHeaderType = comp.format.toLowerCase(); if (headerMediaId) result.templateHeaderText = headerMediaId; }
    } else if (comp.type === "BODY" && comp.text) {
      let bodyText = comp.text;
      variables.forEach((val, idx) => { bodyText = bodyText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g"), val || `{{${idx + 1}}}`); });
      result.templateBodyText = bodyText;
    } else if (comp.type === "FOOTER" && comp.text) { result.templateFooter = comp.text; }
    else if (comp.type === "BUTTONS" && comp.buttons) {
      result.templateButtons = comp.buttons.map((btn: any, idx: number) => {
        const btnObj: any = { type: btn.type === "quick_reply" ? "quick_reply" : btn.type === "url" ? "url" : "phone_number", text: btn.text || btn.title || "", index: idx };
        if (btn.type === "url") btnObj.url = btn.url || "";
        if (btn.type === "phone_number") btnObj.phone_number = btn.phone_number || "";
        return btnObj;
      });
    }
  }
  return result;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const limitCheck = await checkLimit(session.user.id, "testMessages");
    if (!limitCheck.allowed) return NextResponse.json({ success: false, message: `Test message limit reached.`, limitExceeded: true }, { status: 429 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    let payer = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) payer = parent;
    }

    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    let formData: FormData | null = null;

    if (contentType.includes("multipart/form-data")) {
      formData = await req.formData();
    } else {
      body = await req.json();
    }

    let phone = formData?.get("phone") as string || body.phone || "";
    let templateName = formData?.get("templateName") as string || body.templateName || "";
    let languageCode = formData?.get("languageCode") as string || body.languageCode || "en";
    let variables = JSON.parse(formData?.get("variables") as string || "[]") || body.variables || [];
    let headerMediaType = formData?.get("headerMediaType") as string || body.headerMediaType || body.mediaType || "none";
    let file = formData?.get("file") as File | null || null;
    let mediaUrl = formData?.get("mediaUrl") as string || body.mediaUrl || null;
    let category = formData?.get("category") as string || body.category || "MARKETING";

    // ✅ Allow frontend to explicitly pass the whatsappPhoneNumberId to use
    // eslint-disable-next-line prefer-const
    let explicitPhoneId = formData?.get("whatsappPhoneNumberId") as string || body.whatsappPhoneNumberId || "";

    if (!phone || !templateName) return NextResponse.json({ success: false, message: "Phone and templateName are required" }, { status: 400 });
    category = (category || "MARKETING").toUpperCase().trim();
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) category = "MARKETING";

    /* ══════════════════════════════════════════════════════════════════════════
       ✅ FIX: MULTI-ACCOUNT CREDENTIAL RESOLUTION
       If the user's number is stored in the `whatsappNumbers` array instead of 
       the top-level field, we must look inside the array to find the correct 
       Phone Number ID and Access Token for Account B.
       ══════════════════════════════════════════════════════════════════════════ */
    let PHONE_NUMBER_ID = explicitPhoneId || user.whatsappPhoneNumberId || payer.whatsappPhoneNumberId || "";
    let ACCESS_TOKEN = user.whatsappAccessToken || payer.whatsappAccessToken || "";

    if (!PHONE_NUMBER_ID) {
      const findInArray = (u: any) => {
        if (u?.whatsappNumbers?.length > 0) {
          return u.whatsappNumbers.find((n: any) => n.isActive) || u.whatsappNumbers[0];
        }
        return null;
      };
      const matchedNum = findInArray(user) || findInArray(payer);
      if (matchedNum) {
        PHONE_NUMBER_ID = matchedNum.whatsappPhoneNumberId || "";
        if (!ACCESS_TOKEN && matchedNum.whatsappAccessToken) ACCESS_TOKEN = matchedNum.whatsappAccessToken;
      }
    }

    if (!PHONE_NUMBER_ID) PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured" }, { status: 400 });

    // ─── Country-based pricing ───
    let messagePrice = 0;
    if (payer.enabledCountries && payer.enabledCountries.length > 0) {
      const matchedCountry = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
      if (!matchedCountry) return NextResponse.json({ success: false, message: `Messaging to this country is not enabled.` }, { status: 403 });
      if (category === "MARKETING") messagePrice = matchedCountry.priceMarketing || 0;
      else if (category === "UTILITY") messagePrice = matchedCountry.priceUtility || 0;
      else if (category === "AUTHENTICATION") messagePrice = matchedCountry.priceAuthentication || 0;
    } else {
      messagePrice = getPriceForCategory(payer, category);
    }

    const currentBalance = payer.balance || 0;
    if (messagePrice > 0 && currentBalance < messagePrice) return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${messagePrice}, Available: ₹${currentBalance}.` }, { status: 402 });

    const sanitizedPhone = phone.replace(/\+/g, "");
    variables = variables.filter((v: any) => v && String(v).trim() !== "");
    if (category === "AUTHENTICATION" && variables.length === 0) variables = [Math.floor(1000 + Math.random() * 9000).toString()];
    
    headerMediaType = (headerMediaType || "none").toLowerCase().trim();
    if (headerMediaType === "" || headerMediaType === "undefined") headerMediaType = "none";

    let uploadedMediaId: string | null = null;
    if (headerMediaType !== "none" && file) {
      const mediaFormData = new FormData();
      mediaFormData.append("file", file);
      mediaFormData.append("messaging_product", "whatsapp");
      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, body: mediaFormData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) return NextResponse.json({ success: false, message: uploadData.error?.message || "Failed to upload media" }, { status: 500 });
      uploadedMediaId = uploadData.id;
    }

    const components: any[] = [];
    if (headerMediaType !== "none") {
      const type = headerMediaType;
      let mediaObj = null;
      if (uploadedMediaId) mediaObj = { id: uploadedMediaId };
      else if (mediaUrl) mediaObj = mediaUrl.startsWith("http") ? { link: mediaUrl } : { id: mediaUrl };
      if (mediaObj) components.push({ type: "header", parameters: [{ type, [type]: mediaObj }] });
    }
    if (variables.length > 0) components.push({ type: "body", parameters: variables.map((value: string) => ({ type: "text", text: value })) });

    const templatePayload = { name: templateName, language: { code: languageCode }, components };
    const messagePayload = { messaging_product: "whatsapp", to: sanitizedPhone, type: "template", template: templatePayload };

    let response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(messagePayload),
    });
    let data = await response.json();

    if (!response.ok && data.error?.code === 131008 && category === "AUTHENTICATION" && variables.length > 0) {
      const retryPayload = { messaging_product: "whatsapp", to: sanitizedPhone, type: "template", template: { name: templateName, language: { code: languageCode }, components: [ { type: "body", parameters: variables.map((v: string) => ({ type: "text", text: v })) }, { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: variables[0] }] } ] } };
      response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(retryPayload) });
      data = await response.json();
    }

    if (!response.ok) {
      console.error("❌ WhatsApp Error:", JSON.stringify(data, null, 2));
      return NextResponse.json({ success: false, error: data.error, message: data.error?.message || "Failed to send" }, { status: 400 });
    }

    if (messagePrice > 0) { payer.balance = Math.max(0, Math.round((currentBalance - messagePrice) * 100) / 100); await payer.save(); }
    await incrementUsage(session.user.id, "testMessages");

    /* ══════════════════════════════════════════════════════════════════════════
       ✅ FIX: SAVE TO DB FOR LIVE CHAT
       Using the EXACT PHONE_NUMBER_ID we used to send, so Account B sees it.
       ══════════════════════════════════════════════════════════════════════════ */
    try {
      const wamid = data?.messages?.[0]?.id || null;
      const metaTemplate = await fetchFullTemplate(PHONE_NUMBER_ID, ACCESS_TOKEN, templateName, languageCode);
      const displayData = extractTemplateDisplayData(metaTemplate, variables, uploadedMediaId || null);
      
      await Message.create({
        userId: session.user.id,
        phone: sanitizedPhone,
        text: displayData.templateBodyText || `[Template: ${templateName}]`,
        direction: "out",
        messageType: "template",
        mediaUrl: uploadedMediaId || mediaUrl || null,
        whatsappMessageId: wamid,
        status: "sent",
        templateName: templateName,
        templateLanguage: languageCode,
        templateHeaderType: displayData.templateHeaderType || "none",
        templateHeaderText: displayData.templateHeaderText || undefined,
        templateBodyText: displayData.templateBodyText || undefined,
        templateFooter: displayData.templateFooter || undefined,
        templateButtons: displayData.templateButtons?.length > 0 ? displayData.templateButtons : undefined,
        // ✅ THE CRITICAL FIX: This links the message to Account B in the DB
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      });
    } catch (dbErr) {
      console.error("⚠️ DB save failed (message still sent):", dbErr);
    }

    return NextResponse.json({ success: true, data, balance: payer.balance, chargedAmount: messagePrice, category });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Send Error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
