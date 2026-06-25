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
   ✅ ARRAY-FIRST CREDENTIAL RESOLUTION FOR SENDING
   Same logic as webhook: search array first, top-level last.
   This fixes TRL sending (was using TataMotors' top-level credentials).
   ============================================================================ */
function resolveCredentials(user: any, payer: any, explicitPhoneId?: string) {
  // 1. If frontend explicitly passed a phone ID, find it in the array
  if (explicitPhoneId) {
    const uMatch = user?.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === explicitPhoneId);
    if (uMatch) return { PHONE_NUMBER_ID: uMatch.whatsappPhoneNumberId, ACCESS_TOKEN: uMatch.whatsappAccessToken || user?.whatsappAccessToken };
    const pMatch = payer?.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === explicitPhoneId);
    if (pMatch) return { PHONE_NUMBER_ID: pMatch.whatsappPhoneNumberId, ACCESS_TOKEN: pMatch.whatsappAccessToken || payer?.whatsappAccessToken };
  }

  // 2. Use first ACTIVE number in user's array
  const activeNum = user?.whatsappNumbers?.find((n: any) => n.isActive);
  if (activeNum?.whatsappPhoneNumberId) {
    return { PHONE_NUMBER_ID: activeNum.whatsappPhoneNumberId, ACCESS_TOKEN: activeNum.whatsappAccessToken || user?.whatsappAccessToken };
  }

  // 3. Use first number in user's array
  if (user?.whatsappNumbers?.[0]?.whatsappPhoneNumberId) {
    const first = user.whatsappNumbers[0];
    return { PHONE_NUMBER_ID: first.whatsappPhoneNumberId, ACCESS_TOKEN: first.whatsappAccessToken || user?.whatsappAccessToken };
  }

  // 4. Last resort: top-level or env
  return {
    PHONE_NUMBER_ID: user?.whatsappPhoneNumberId || payer?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    ACCESS_TOKEN: user?.whatsappAccessToken || payer?.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "",
  };
}

async function fetchFullTemplate(pid: string, tok: string, name: string, lang: string): Promise<any | null> {
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pid}/message_templates?name=${encodeURIComponent(name)}&language=${encodeURIComponent(lang)}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null; const d = await r.json(); return d?.data?.[0] || null;
  } catch { return null; }
}

function extractTemplateDisplay(meta: any, vars: string[], headerMediaId: string | null) {
  const r: any = { templateHeaderType: "none" };
  if (!meta?.components) return r;
  for (const c of meta.components) {
    if (c.type === "HEADER") {
      if (c.format === "TEXT" && c.text) { r.templateHeaderType = "text"; r.templateHeaderText = c.text; }
      else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(c.format)) { r.templateHeaderType = c.format.toLowerCase(); if (headerMediaId) r.templateHeaderText = headerMediaId; }
    } else if (c.type === "BODY" && c.text) {
      let bt = c.text; vars.forEach((v, i) => { bt = bt.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), v || `{{${i + 1}}}`); }); r.templateBodyText = bt;
    } else if (c.type === "FOOTER" && c.text) { r.templateFooter = c.text; }
    else if (c.type === "BUTTONS" && c.buttons) {
      r.templateButtons = c.buttons.map((b: any, i: number) => {
        const o: any = { type: b.type === "quick_reply" ? "quick_reply" : b.type === "url" ? "url" : "phone_number", text: b.text || b.title || "", index: i };
        if (b.type === "url") o.url = b.url || ""; if (b.type === "phone_number") o.phone_number = b.phone_number || ""; return o;
      });
    }
  }
  return r;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const limitCheck = await checkLimit(session.user.id, "testMessages");
    if (!limitCheck.allowed) return NextResponse.json({ success: false, message: "Test message limit reached.", limitExceeded: true }, { status: 429 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    let payer = user;
    if (user.parentTenantId) { const p = await User.findOne({ tenantId: user.parentTenantId }); if (p) payer = p; }

    const ct = req.headers.get("content-type") || "";
    let body: any = {}, formData: FormData | null = null;
    if (ct.includes("multipart/form-data")) { formData = await req.formData(); } else { body = await req.json(); }

    const phone = formData?.get("phone") as string || body.phone || "";
    const templateName = formData?.get("templateName") as string || body.templateName || "";
    const languageCode = formData?.get("languageCode") as string || body.languageCode || "en";
    let variables = JSON.parse(formData?.get("variables") as string || "[]") || body.variables || [];
    const headerMediaType = formData?.get("headerMediaType") as string || body.headerMediaType || "none";
    const file = formData?.get("file") as File | null || null;
    const mediaUrl = formData?.get("mediaUrl") as string || body.mediaUrl || null;
    let category = formData?.get("category") as string || body.category || "MARKETING";
    const explicitPhoneId = formData?.get("whatsappPhoneNumberId") as string || body.whatsappPhoneNumberId || "";

    if (!phone || !templateName) return NextResponse.json({ success: false, message: "Phone and templateName required" }, { status: 400 });
    category = (category || "MARKETING").toUpperCase().trim();
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) category = "MARKETING";

    // ✅ ARRAY-FIRST CREDENTIAL RESOLUTION
    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject(), explicitPhoneId);
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });

    let messagePrice = 0;
    if (payer.enabledCountries?.length > 0) {
      const mc = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
      if (!mc) return NextResponse.json({ success: false, message: "Country not enabled." }, { status: 403 });
      if (category === "MARKETING") messagePrice = mc.priceMarketing || 0;
      else if (category === "UTILITY") messagePrice = mc.priceUtility || 0;
      else messagePrice = mc.priceAuthentication || 0;
    } else { messagePrice = getPriceForCategory(payer, category); }

    const bal = payer.balance || 0;
    if (messagePrice > 0 && bal < messagePrice) return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${messagePrice}, Available: ₹${bal}.` }, { status: 402 });

    const sPhone = phone.replace(/\+/g, "");
    variables = variables.filter((v: any) => v && String(v).trim() !== "");
    if (category === "AUTHENTICATION" && !variables.length) variables = [Math.floor(1000 + Math.random() * 9000).toString()];

    let hmt = (headerMediaType || "none").toLowerCase().trim();
    if (hmt === "" || hmt === "undefined") hmt = "none";

    let uploadedMediaId: string | null = null;
    if (hmt !== "none" && file) {
      const mfd = new FormData(); mfd.append("file", file); mfd.append("messaging_product", "whatsapp");
      const ur = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, { method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, body: mfd });
      const ud = await ur.json();
      if (!ur.ok || ud.error || !ud.id) return NextResponse.json({ success: false, message: ud.error?.message || "Media upload failed" }, { status: 500 });
      uploadedMediaId = ud.id;
    }

    const comps: any[] = [];
    if (hmt !== "none") {
      let mo = null;
      if (uploadedMediaId) mo = { id: uploadedMediaId };
      else if (mediaUrl) mo = mediaUrl.startsWith("http") ? { link: mediaUrl } : { id: mediaUrl };
      if (mo) comps.push({ type: "header", parameters: [{ type: hmt, [hmt]: mo }] });
    }
    if (variables.length) comps.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: v })) });

    const tp = { name: templateName, language: { code: languageCode }, components: comps };
    const mp = { messaging_product: "whatsapp", to: sPhone, type: "template", template: tp };

    let response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(mp) });
    let data = await response.json();

    if (!response.ok && data.error?.code === 131008 && category === "AUTHENTICATION" && variables.length) {
      const rp = { messaging_product: "whatsapp", to: sPhone, type: "template", template: { name: templateName, language: { code: languageCode }, components: [{ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: v })) }, { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: variables[0] }] }] } };
      response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(rp) });
      data = await response.json();
    }

    if (!response.ok) { console.error("❌ WhatsApp Error:", JSON.stringify(data, null, 2)); return NextResponse.json({ success: false, error: data.error, message: data.error?.message || "Failed" }, { status: 400 }); }

    if (messagePrice > 0) { payer.balance = Math.max(0, Math.round((bal - messagePrice) * 100) / 100); await payer.save(); }
    await incrementUsage(session.user.id, "testMessages");

    // ✅ SAVE TO DB WITH THE EXACT PHONE_NUMBER_ID USED
    try {
      const wamid = data?.messages?.[0]?.id || null;
      const mt = await fetchFullTemplate(PHONE_NUMBER_ID, ACCESS_TOKEN, templateName, languageCode);
      const dd = extractTemplateDisplay(mt, variables, uploadedMediaId || null);
      await Message.create({
        userId: session.user.id, phone: sPhone, text: dd.templateBodyText || `[Template: ${templateName}]`,
        direction: "out", messageType: "template", mediaUrl: uploadedMediaId || mediaUrl || null,
        whatsappMessageId: wamid, status: "sent", templateName, templateLanguage: languageCode,
        templateHeaderType: dd.templateHeaderType || "none", templateHeaderText: dd.templateHeaderText || undefined,
        templateBodyText: dd.templateBodyText || undefined, templateFooter: dd.templateFooter || undefined,
        templateButtons: dd.templateButtons?.length ? dd.templateButtons : undefined,
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      });
    } catch (dbErr) { console.error("⚠️ DB save failed:", dbErr); }

    return NextResponse.json({ success: true, data, balance: payer.balance, chargedAmount: messagePrice, category });
  } catch (error) { const m = error instanceof Error ? error.message : "Unknown error"; console.error("❌ Send Error:", m); return NextResponse.json({ success: false, message: m }, { status: 500 }); }
}
