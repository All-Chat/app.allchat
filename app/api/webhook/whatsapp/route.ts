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
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// ✅ Strip extra quotes from strings
function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s;
}

// ✅ UNIVERSAL CREDENTIAL RESOLVER
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
          n.id === PHONE_NUMBER_ID
      );
      if (m) ACCESS_TOKEN = m.whatsappAccessToken || m.accessToken || "";
    }
    if (!ACCESS_TOKEN && payer?.whatsappNumbers?.length > 0) {
      const m = payer.whatsappNumbers.find(
        (n: any) =>
          n.whatsappPhoneNumberId === PHONE_NUMBER_ID ||
          n.phoneNumberId === PHONE_NUMBER_ID ||
          n.id === PHONE_NUMBER_ID
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

// ✅ Fetch template from Meta
async function fetchFullTemplate(
  phoneNumberId: string,
  accessToken: string,
  templateName: string,
  languageCode: string
): Promise<any | null> {
  try {
    let res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}&language=${encodeURIComponent(languageCode)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const tpl = data?.data?.[0];
      if (tpl?.components?.length > 0) return tpl;
    }

    res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/message_templates?name=${encodeURIComponent(templateName)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const tpl = data?.data?.[0];
      if (tpl?.components?.length > 0) return tpl;
    }
    return null;
  } catch {
    return null;
  }
}

function getTemplateHeaderFormat(metaTemplate: any): string {
  if (!metaTemplate?.components) return "none";
  for (const comp of metaTemplate.components) {
    if (comp.type === "HEADER") return (comp.format || "none").toUpperCase();
  }
  return "none";
}

function extractTemplateDisplayData(
  metaTemplate: any,
  variables: string[],
  headerMediaId: string | null,
  fallbackHeaderType: string
) {
  const result: any = { templateHeaderType: "none" };
  if (!metaTemplate?.components) {
    if (["image", "video", "document"].includes(fallbackHeaderType)) {
      result.templateHeaderType = fallbackHeaderType;
      if (headerMediaId) result.templateHeaderText = headerMediaId;
    }
    return result;
  }

  for (const comp of metaTemplate.components) {
    if (comp.type === "HEADER") {
      if (comp.format === "TEXT" && comp.text) {
        result.templateHeaderType = "text";
        result.templateHeaderText = comp.text;
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(comp.format)) {
        result.templateHeaderType = comp.format.toLowerCase();
        if (headerMediaId) result.templateHeaderText = headerMediaId;
      }
    } else if (comp.type === "BODY" && comp.text) {
      let bodyText = comp.text;
      variables.forEach((val, idx) => {
        bodyText = bodyText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g"), val || `{{${idx + 1}}}`);
      });
      result.templateBodyText = bodyText;
    } else if (comp.type === "FOOTER" && comp.text) {
      result.templateFooter = comp.text;
    } else if (comp.type === "BUTTONS" && comp.buttons) {
      result.templateButtons = comp.buttons.map((btn: any, idx: number) => {
        const btnObj: any = {
          type: btn.type === "quick_reply" ? "quick_reply" : btn.type === "url" ? "url" : "phone_number",
          text: btn.text || btn.title || "",
          index: idx,
        };
        if (btn.type === "url") btnObj.url = btn.url || "";
        if (btn.type === "phone_number") btnObj.phone_number = btn.phone_number || "";
        return btnObj;
      });
    }
  }
  return result;
}

// ✅ Build components array for templates
function buildComponents(
  headerFormat: string,
  variables: string[],
  uploadedMediaId: string | null,
  mediaUrl: string
): any[] {
  const components: any[] = [];
  const validMediaTypes = ["image", "video", "document"];
  const needsMedia = validMediaTypes.includes(headerFormat.toLowerCase());

  if (needsMedia && (uploadedMediaId || mediaUrl)) {
    const headerType = headerFormat.toLowerCase();
    let mediaObj: any = null;
    if (uploadedMediaId) mediaObj = { id: uploadedMediaId };
    else if (mediaUrl) mediaObj = mediaUrl.startsWith("http") ? { link: mediaUrl } : { id: mediaUrl };

    if (mediaObj) {
      const param: any = { type: headerType };
      if (headerType === "image") param.image = mediaObj;
      else if (headerType === "video") param.video = mediaObj;
      else if (headerType === "document") param.document = { ...mediaObj, filename: "document.pdf" };
      components.push({ type: "header", parameters: [param] });
    }
  }

  if (variables.length > 0) {
    components.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: String(v) })) });
  }

  return components;
}

// ✅ Extract WAMID regardless of HTTP status code
function extractWamid(data: any): string | null {
  if (data?.messages?.[0]?.id) return data.messages[0].id;
  return null;
}

// ✅ Send template to WhatsApp API
async function sendToWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  sanitizedPhone: string,
  templateName: string,
  languageCode: string,
  components: any[]
): Promise<{ ok: boolean; data: any; wamid: string | null }> {
  const payload = {
    messaging_product: "whatsapp",
    to: sanitizedPhone,
    type: "template",
    template: { name: templateName, language: { code: languageCode }, components },
  };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const wamid = extractWamid(data);
  return { ok: res.ok || !!wamid, data, wamid };
}

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: Upload file to Meta's media API
// ═══════════════════════════════════════════════════════════════
async function uploadFileToMeta(
  phoneNumberId: string,
  accessToken: string,
  file: File
): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("messaging_product", "whatsapp");

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const data = await res.json();
    if (data.id) {
      console.log(`✅ Media uploaded to Meta: ${data.id}`);
      return data.id;
    }
    console.error("❌ Media upload failed:", data);
    return null;
  } catch (err) {
    console.error("❌ Media upload error:", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: Resolve Local/Remote URL to Meta Media ID
// ═══════════════════════════════════════════════════════════════
async function uploadMediaToMetaFromUrl(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string
): Promise<string | null> {
  try {
    if (/^\d+$/.test(mediaUrl)) return mediaUrl; // Already a Meta ID

    let blob: Blob | null = null;
    let filename = "media";

    // Check if it's a local file path
    if (mediaUrl.startsWith("/uploads/") || mediaUrl.startsWith("/public/")) {
      const localPath = path.join(process.cwd(), "public", mediaUrl);
      if (fs.existsSync(localPath)) {
        const fileBuffer = fs.readFileSync(localPath);
        blob = new Blob([fileBuffer]);
        const ext = path.extname(localPath).toLowerCase();
        filename = `media${ext}`;
      } else {
        console.error(`❌ [MEDIA] Local file not found: ${localPath}`);
      }
    } else if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
      const downloadRes = await fetch(mediaUrl);
      if (downloadRes.ok) {
        blob = await downloadRes.blob();
        const ext = path.extname(new URL(mediaUrl).pathname).toLowerCase();
        filename = `media${ext || ".bin"}`;
      }
    } else {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      if (baseUrl) {
        const fullUrl = `${baseUrl}${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`;
        const downloadRes = await fetch(fullUrl);
        if (downloadRes.ok) {
          blob = await downloadRes.blob();
          const ext = path.extname(new URL(fullUrl).pathname).toLowerCase();
          filename = `media${ext || ".bin"}`;
        }
      }
    }

    if (!blob) return null;

    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("messaging_product", "whatsapp");

    const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    if (uploadData.id) return uploadData.id;
    
    return null;
  } catch (err) {
    console.error(`❌ [MEDIA] Error uploading to Meta:`, err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: Build payload for direct (non-template) media messages
// ═══════════════════════════════════════════════════════════════
function buildDirectPayload(
  to: string,
  messageType: string,
  mediaRef: string,
  caption: string,
  filename?: string
): any {
  const isUrl = mediaRef.startsWith("http://") || mediaRef.startsWith("https://");
  const mediaObj = isUrl ? { link: mediaRef } : { id: mediaRef };

  switch (messageType) {
    case "text":
      return {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: caption || "", preview_url: true },
      };
    case "image":
      return {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { ...mediaObj, ...(caption ? { caption } : {}) },
      };
    case "video":
      return {
        messaging_product: "whatsapp",
        to,
        type: "video",
        video: { ...mediaObj, ...(caption ? { caption } : {}) },
      };
    case "audio":
      return {
        messaging_product: "whatsapp",
        to,
        type: "audio",
        audio: mediaObj,
      };
    case "document":
      return {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          ...mediaObj,
          filename: filename || "document.pdf",
          ...(caption ? { caption } : {}),
        },
      };
    case "link":
      return {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: caption ? `${caption}\n\n${mediaRef}` : mediaRef,
          preview_url: true,
        },
      };
    default:
      return {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: caption || "", preview_url: true },
      };
  }
}

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: Send direct (non-template) media message
// ═══════════════════════════════════════════════════════════════
async function sendDirectMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  messageType: string,
  mediaRef: string,
  caption: string,
  filename?: string
): Promise<{ ok: boolean; data: any; wamid: string | null }> {
  const payload = buildDirectPayload(to, messageType, mediaRef, caption, filename);

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const wamid = extractWamid(data);

  return { ok: res.ok || !!wamid, data, wamid };
}

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limitCheck = await checkLimit(session.user.id, "testMessages");
    if (!limitCheck.allowed) {
      return NextResponse.json({ success: false, message: "Test message limit reached.", limitExceeded: true }, { status: 429 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

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

    const phone = cleanStr(formData?.get("phone") || body.phone || "");
    const messageType = cleanStr(formData?.get("messageType") || body.messageType || "template");
    const explicitPhoneId = cleanStr(formData?.get("whatsappPhoneNumberId") || body.whatsappPhoneNumberId || "");
    const category = cleanStr(formData?.get("category") || body.category || "MARKETING");

    if (!phone) {
      return NextResponse.json({ success: false, message: "Phone is required" }, { status: 400 });
    }

    const finalCategory = (category || "MARKETING").toUpperCase().trim();
    let cat = finalCategory;
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(finalCategory)) cat = "MARKETING";

    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject(), explicitPhoneId);

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });
    }

    let messagePrice = 0;
    if (payer.enabledCountries && payer.enabledCountries.length > 0) {
      const matchedCountry = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
      if (!matchedCountry) {
        return NextResponse.json({ success: false, message: "Messaging to this country is not enabled." }, { status: 403 });
      }
      if (cat === "MARKETING") messagePrice = matchedCountry.priceMarketing || 0;
      else if (cat === "UTILITY") messagePrice = matchedCountry.priceUtility || 0;
      else if (cat === "AUTHENTICATION") messagePrice = matchedCountry.priceAuthentication || 0;
    } else {
      messagePrice = getPriceForCategory(payer, cat);
    }

    const currentBalance = payer.balance || 0;
    if (messagePrice > 0 && currentBalance < messagePrice) {
      return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${messagePrice}, Available: ₹${currentBalance}.` }, { status: 402 });
    }

    const sanitizedPhone = phone.replace(/\+/g, "");

    // ═══════════════════════════════════════════════════════════════
    // ✅ DIRECT MEDIA/TEXT MESSAGE (non-template)
    // ═══════════════════════════════════════════════════════════════
    if (messageType !== "template") {
      const message = cleanStr(formData?.get("message") || body.message || "");
      const mediaUrl = cleanStr(formData?.get("mediaUrl") || body.mediaUrl || "");
      const file = (formData?.get("file") as File) || null;

      if (messageType === "text" && !message) {
        return NextResponse.json({ success: false, message: "Message text is required for text messages" }, { status: 400 });
      }

      if (["image", "video", "audio", "document"].includes(messageType) && !file && !mediaUrl) {
        return NextResponse.json({ success: false, message: "File or mediaUrl is required for media messages" }, { status: 400 });
      }

      let mediaRef = mediaUrl;
      let filename: string | undefined = undefined;

      if (file) {
        filename = file.name || undefined;
        const uploadedId = await uploadFileToMeta(PHONE_NUMBER_ID, ACCESS_TOKEN, file);
        if (!uploadedId) {
          return NextResponse.json({ success: false, message: "Failed to upload media to Meta" }, { status: 500 });
        }
        mediaRef = uploadedId;
      } else if (mediaUrl) {
        // ✅ FIX: Resolve URL to Meta ID if it's not already one
        if (!/^\d+$/.test(mediaUrl)) {
          const uploadedId = await uploadMediaToMetaFromUrl(PHONE_NUMBER_ID, ACCESS_TOKEN, mediaUrl);
          if (uploadedId) {
            mediaRef = uploadedId;
          }
        }
      }

      const result = await sendDirectMessage(
        PHONE_NUMBER_ID,
        ACCESS_TOKEN,
        sanitizedPhone,
        messageType,
        mediaRef,
        message,
        filename
      );

      if (!result.ok && !result.wamid) {
        console.error("❌ [SEND] Direct message failed:", JSON.stringify(result.data, null, 2));
        return NextResponse.json(
          { success: false, error: result.data.error, message: result.data.error?.message || "Failed to send" },
          { status: 400 }
        );
      }

      try {
        if (messagePrice > 0) {
          payer.balance = Math.max(0, Math.round((currentBalance - messagePrice) * 100) / 100);
          await payer.save();
        }
      } catch (balErr) {
        console.error("⚠️ Balance update failed (message still sent):", balErr);
      }

      try {
        await incrementUsage(session.user.id, "testMessages");
      } catch (usageErr) {
        console.error("⚠️ Usage increment failed (message still sent):", usageErr);
      }

      try {
        await Message.create({
          userId: session.user.id,
          phone: sanitizedPhone,
          text: message || `[${messageType.toUpperCase()}]`,
          direction: "out",
          messageType,
          mediaUrl: mediaRef || mediaUrl || null,
          whatsappMessageId: result.wamid,
          status: "sent",
          whatsappPhoneNumberId: PHONE_NUMBER_ID,
        });
      } catch (dbErr) {
        console.error("⚠️ DB save failed (message still sent):", dbErr);
      }

      return NextResponse.json({
        success: true,
        data: result.data,
        wamid: result.wamid,
        balance: payer.balance,
        chargedAmount: messagePrice,
        category: cat,
        messageType,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // ✅ TEMPLATE MESSAGE
    // ═══════════════════════════════════════════════════════════════
    const templateName = cleanStr(formData?.get("templateName") || body.templateName || "");
    const languageCode = cleanStr(formData?.get("languageCode") || body.languageCode || "en");
    let variables = JSON.parse(cleanStr(formData?.get("variables") || "[]")) || body.variables || [];
    const headerMediaType = cleanStr(formData?.get("headerMediaType") || body.headerMediaType || body.mediaType || "none");
    const file = (formData?.get("file") as File) || null;
    const mediaUrl = cleanStr(formData?.get("mediaUrl") || body.mediaUrl || "");

    if (!templateName) {
      return NextResponse.json({ success: false, message: "templateName is required for template messages" }, { status: 400 });
    }

    variables = (Array.isArray(variables) ? variables : []).filter((v: any) => v && String(v).trim() !== "");
    if (cat === "AUTHENTICATION" && variables.length === 0) {
      variables = [Math.floor(1000 + Math.random() * 9000).toString()];
    }

    const metaTemplate = await fetchFullTemplate(PHONE_NUMBER_ID, ACCESS_TOKEN, templateName, languageCode);
    let detectedHeaderFormat = getTemplateHeaderFormat(metaTemplate);
    const userHeaderType = headerMediaType.toLowerCase().trim();
    const validMediaTypes = ["image", "video", "document"];

    if (detectedHeaderFormat === "none" && validMediaTypes.includes(userHeaderType)) {
      detectedHeaderFormat = userHeaderType.toUpperCase();
    }

    let uploadedMediaId: string | null = null;
    const needsMedia = validMediaTypes.includes(detectedHeaderFormat.toLowerCase());

    if (needsMedia && file) {
      const uploadedId = await uploadFileToMeta(PHONE_NUMBER_ID, ACCESS_TOKEN, file);
      if (!uploadedId) {
        return NextResponse.json({ success: false, message: "Failed to upload media" }, { status: 500 });
      }
      uploadedMediaId = uploadedId;
    } else if (needsMedia && mediaUrl) {
      // ✅ FIX: Convert URLs to Meta IDs before sending templates
      if (!/^\d+$/.test(mediaUrl)) {
        uploadedMediaId = await uploadMediaToMetaFromUrl(PHONE_NUMBER_ID, ACCESS_TOKEN, mediaUrl);
      } else {
        uploadedMediaId = mediaUrl;
      }
    }

    let components = buildComponents(detectedHeaderFormat, variables, uploadedMediaId, mediaUrl);

    let result = await sendToWhatsApp(PHONE_NUMBER_ID, ACCESS_TOKEN, sanitizedPhone, templateName, languageCode, components);
    let sendSuccess = result.ok;
    let data = result.data;
    let wamid = result.wamid;

    if (!sendSuccess && data.error?.code === 131008 && cat === "AUTHENTICATION" && variables.length > 0) {
      const retryComponents: any[] = [];
      if (components.length > 0 && components[0].type === "header") retryComponents.push(components[0]);
      retryComponents.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: String(v) })) });
      retryComponents.push({ type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: String(variables[0]) }] });

      result = await sendToWhatsApp(PHONE_NUMBER_ID, ACCESS_TOKEN, sanitizedPhone, templateName, languageCode, retryComponents);
      sendSuccess = result.ok;
      data = result.data;
      wamid = result.wamid;
    }

    if (!sendSuccess && data.error?.code === 132012) {
      const details = data.error?.error_data?.details || "";
      const match = details.match(/expected\s+(\w+)/i);
      if (match && (uploadedMediaId || mediaUrl)) {
        const expectedFormat = match[1].toUpperCase();
        if (validMediaTypes.includes(expectedFormat.toLowerCase())) {
          components = buildComponents(expectedFormat, variables, uploadedMediaId, mediaUrl);
          result = await sendToWhatsApp(PHONE_NUMBER_ID, ACCESS_TOKEN, sanitizedPhone, templateName, languageCode, components);
          sendSuccess = result.ok;
          data = result.data;
          wamid = result.wamid;
        }
      }
    }

    if (!sendSuccess && data.error?.code === 132012 && components.length > 0 && components[0].type === "header") {
      const noHeaderComponents = components.filter((c: any) => c.type !== "header");
      result = await sendToWhatsApp(PHONE_NUMBER_ID, ACCESS_TOKEN, sanitizedPhone, templateName, languageCode, noHeaderComponents);
      sendSuccess = result.ok;
      data = result.data;
      wamid = result.wamid;
    }

    if (!sendSuccess && !wamid) {
      console.error("❌ WhatsApp Error (all attempts failed):", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { success: false, error: data.error, message: data.error?.message || "Failed to send" },
        { status: 400 }
      );
    }

    try {
      if (messagePrice > 0) {
        payer.balance = Math.max(0, Math.round((currentBalance - messagePrice) * 100) / 100);
        await payer.save();
      }
    } catch (balErr) {
      console.error("⚠️ Balance update failed (message still sent):", balErr);
    }

    try {
      await incrementUsage(session.user.id, "testMessages");
    } catch (usageErr) {
      console.error("⚠️ Usage increment failed (message still sent):", usageErr);
    }

    try {
      const displayData = extractTemplateDisplayData(metaTemplate, variables, uploadedMediaId || null, detectedHeaderFormat.toLowerCase());

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

    return NextResponse.json({
      success: true,
      data,
      balance: payer.balance,
      chargedAmount: messagePrice,
      category: cat,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Send Error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
