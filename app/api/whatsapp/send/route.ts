/* eslint-disable no-var */
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

/* ============================================================================
   ✅ UNIVERSAL CREDENTIAL RESOLVER (Same logic as webhook)
   Finds the correct Phone Number ID and Access Token regardless of 
   where they are stored in the user document.
   ============================================================================ */
function resolveCredentials(user: any, payer: any, explicitPhoneId?: string): { PHONE_NUMBER_ID: string; ACCESS_TOKEN: string } {
  let PHONE_NUMBER_ID = explicitPhoneId || "";
  let ACCESS_TOKEN = "";

  // 1. If explicitly provided, just find the token for it
  if (PHONE_NUMBER_ID) {
    // Check user's array first
    if (user?.whatsappNumbers?.length > 0) {
      const m = user.whatsappNumbers.find((n: any) => n.whatsappPhoneNumberId === PHONE_NUMBER_ID || n.phoneNumberId === PHONE_NUMBER_ID || n.id === PHONE_NUMBER_ID);
      if (m) { ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || ""; }
    }
    // Check payer's array
    if (!ACCESS_TOKEN && payer?.whatsappNumbers?.length > 0) {
      const m = payer.whatsappNumbers.find((n: any) => n.whatsappPhoneNumberId === PHONE_NUMBER_ID || n.phoneNumberId === PHONE_NUMBER_ID || n.id === PHONE_NUMBER_ID);
      if (m) { ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || ""; }
    }
    // Fall back to top-level
    if (!ACCESS_TOKEN) ACCESS_TOKEN = user?.whatsappAccessToken || payer?.whatsappAccessToken || "";
    if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
    return { PHONE_NUMBER_ID, ACCESS_TOKEN };
  }

  // 2. Try user's top-level
  if (user?.whatsappPhoneNumberId) {
    PHONE_NUMBER_ID = user.whatsappPhoneNumberId;
    ACCESS_TOKEN = user.whatsappAccessToken || "";
  }

  // 3. Try user's array (first active, or first item)
  if (!PHONE_NUMBER_ID && user?.whatsappNumbers?.length > 0) {
    const active = user.whatsappNumbers.find((n: any) => n.isActive) || user.whatsappNumbers[0];
    PHONE_NUMBER_ID = active.whatsappPhoneNumberId || active.phoneNumberId || active.id || "";
    ACCESS_TOKEN = active.whatsappAccessToken || active.accessToken || user.whatsappAccessToken || "";
  }

  // 4. Try payer's top-level
  if (!PHONE_NUMBER_ID && payer?.whatsappPhoneNumberId) {
    PHONE_NUMBER_ID = payer.whatsappPhoneNumberId;
    ACCESS_TOKEN = payer.whatsappAccessToken || "";
  }

  // 5. Try payer's array
  if (!PHONE_NUMBER_ID && payer?.whatsappNumbers?.length > 0) {
    const active = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0];
    PHONE_NUMBER_ID = active.whatsappPhoneNumberId || active.phoneNumberId || active.id || "";
    ACCESS_TOKEN = active.whatsappAccessToken || active.accessToken || payer.whatsappAccessToken || "";
  }

  // 6. Final env fallback
  if (!PHONE_NUMBER_ID) PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  if (!ACCESS_TOKEN) ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";

  return { PHONE_NUMBER_ID, ACCESS_TOKEN };
}

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

    const phone = formData?.get("phone") as string || body.phone || "";
    const templateName = formData?.get("templateName") as string || body.templateName || "";
    const languageCode = formData?.get("languageCode") as string || body.languageCode || "en";
    let variables = JSON.parse(formData?.get("variables") as string || "[]") || body.variables || [];
    const headerMediaType = formData?.get("headerMediaType") as string || body.headerMediaType || body.mediaType || "none";
    const file = formData?.get("file") as File | null || null;
    const mediaUrl = formData?.get("mediaUrl") as string || body.mediaUrl || null;
    const category = formData?.get("category") as string || body.category || "MARKETING";
    const explicitPhoneId = formData?.get("whatsappPhoneNumberId") as string || body.whatsappPhoneNumberId || "";

    if (!phone || !templateName) return NextResponse.json({ success: false, message: "Phone and templateName are required" }, { status: 400 });

    const finalCategory = (category || "MARKETING").toUpperCase().trim();
    let cat = finalCategory;
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(finalCategory)) cat = "MARKETING";

    // ✅ UNIVERSAL CREDENTIAL RESOLUTION
    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject(), explicitPhoneId);

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured. Make sure your WABA number is added in Settings." }, { status: 400 });

    // Pricing
    let messagePrice = 0;
    if (payer.enabledCountries && payer.enabledCountries.length > 0) {
      const matchedCountry = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
      if (!matchedCountry) return NextResponse.json({ success: false, message: `Messaging to this country is not enabled.` }, { status: 403 });
      if (cat === "MARKETING") messagePrice = matchedCountry.priceMarketing || 0;
      else if (cat === "UTILITY") messagePrice = matchedCountry.priceUtility || 0;
      else if (cat === "AUTHENTICATION") messagePrice = matchedCountry.priceAuthentication || 0;
    } else { messagePrice = getPriceForCategory(payer, cat); }

    const currentBalance = payer.balance || 0;
    if (messagePrice > 0 && currentBalance < messagePrice) return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${messagePrice}, Available: ₹${currentBalance}.` }, { status: 402 });

    const sanitizedPhone = phone.replace(/\+/g, "");
    variables = variables.filter((v: any) => v && String(v).trim() !== "");
    if (cat === "AUTHENTICATION" && variables.length === 0) variables = [Math.floor(1000 + Math.random() * 9000).toString()];

    let finalHeaderType = (headerMediaType || "none").toLowerCase().trim();
    if (finalHeaderType === "" || finalHeaderType === "undefined") finalHeaderType = "none";

    let uploadedMediaId: string | null = null;
    if (finalHeaderType !== "none" && file) {
      const mediaFormData = new FormData();
      mediaFormData.append("file", file);
      mediaFormData.append("messaging_product", "whatsapp");
      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, body: mediaFormData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) return NextResponse.json({ success: false, message: uploadData.error?.message || "Failed to upload media" }, { status: 500 });
      uploadedMediaId = uploadData.id;
    }

    const components: any[] = [];
    if (finalHeaderType !== "none") {
      const type = finalHeaderType;
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

    if (!response.ok && data.error?.code === 131008 && cat === "AUTHENTICATION" && variables.length > 0) {
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

    // ✅ SAVE TO DB WITH THE EXACT PHONE_NUMBER_ID USED TO SEND
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
        templateName,
        templateLanguage: languageCode,
        templateHeaderType: displayData.templateHeaderType || "none",
        templateHeaderText: displayData.templateHeaderText || undefined,
        templateBodyText: displayData.templateBodyText || undefined,
        templateFooter: displayData.templateFooter || undefined,
        templateButtons: displayData.templateButtons?.length > 0 ? displayData.templateButtons : undefined,
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      });
    } catch (dbErr) {
      console.error("⚠️ DB save failed (message still sent):", dbErr);
    }

    return NextResponse.json({ success: true, data, balance: payer.balance, chargedAmount: messagePrice, category: cat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Send Error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
