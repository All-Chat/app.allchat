/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const limitCheck = await checkLimit(session.user.id, "testMessages");
    if (!limitCheck.allowed) {
      return NextResponse.json({
        success: false,
        message: `Test message limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} test messages per ${limitCheck.period}.`,
        limitExceeded: true,
      }, { status: 429 });
    }

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    let payer = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) {
        payer = parent;
      }
    }

    const PHONE_NUMBER_ID = user.whatsappPhoneNumberId || payer.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ACCESS_TOKEN = user.whatsappAccessToken || payer.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
    
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured" }, { status: 400 });

    const contentType = req.headers.get("content-type") || "";
    let phone: string, templateName: string, languageCode: string, variables: string[], headerMediaType: string, file: File | null = null, mediaUrl: string | null = null, category: string = "MARKETING";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      phone = (formData.get("phone") as string) || "";
      templateName = (formData.get("templateName") as string) || "";
      languageCode = (formData.get("languageCode") as string) || "en";
      variables = JSON.parse((formData.get("variables") as string) || "[]");
      headerMediaType = (formData.get("headerMediaType") as string) || "none";
      file = formData.get("file") as File | null;
      mediaUrl = (formData.get("mediaUrl") as string) || null;
      category = (formData.get("category") as string) || "MARKETING";
    } else {
      const body = await req.json();
      phone = body.phone || "";
      templateName = body.templateName || "";
      languageCode = body.languageCode || "en";
      variables = body.variables || [];
      headerMediaType = body.headerMediaType || body.mediaType || "none";
      mediaUrl = body.mediaUrl || null;
      category = body.category || "MARKETING";
      file = null;
    }

    if (!phone || !templateName) return NextResponse.json({ success: false, message: "Phone and templateName are required" }, { status: 400 });

    category = (category || "MARKETING").toUpperCase().trim();
    if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) category = "MARKETING";

    // ✅ NEW: COUNTRY-BASED PRICING LOGIC
    let messagePrice = 0;
    if (payer.enabledCountries && payer.enabledCountries.length > 0) {
      const matchedCountry = payer.enabledCountries.find((c: any) => phone.startsWith(c.code));
      if (!matchedCountry) {
        return NextResponse.json({ success: false, message: `Messaging to this country is not enabled. Please contact admin.` }, { status: 403 });
      }
      
      if (category === "MARKETING") messagePrice = matchedCountry.priceMarketing || 0;
      else if (category === "UTILITY") messagePrice = matchedCountry.priceUtility || 0;
      else if (category === "AUTHENTICATION") messagePrice = matchedCountry.priceAuthentication || 0;
    } else {
      // Fallback to base pricing if no countries are configured
      messagePrice = getPriceForCategory(payer, category);
    }

    const currentBalance = payer.balance || 0;
    if (messagePrice > 0 && currentBalance < messagePrice) {
      return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${messagePrice}, Available: ₹${currentBalance}.` }, { status: 402 });
    }

    const sanitizedPhone = phone.replace(/\+/g, "");
    variables = variables.filter((v: any) => v && String(v).trim() !== "");

    if (category === "AUTHENTICATION" && variables.length === 0) {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      variables = [otp];
    }

    headerMediaType = (headerMediaType || "none").toLowerCase().trim();
    if (headerMediaType === "" || headerMediaType === "undefined") headerMediaType = "none";

    let uploadedMediaId: string | null = null;
    if (headerMediaType !== "none" && file) {
      const mediaFormData = new FormData();
      mediaFormData.append("file", file);
      mediaFormData.append("messaging_product", "whatsapp");

      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        body: mediaFormData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        return NextResponse.json({ success: false, message: uploadData.error?.message || "Failed to upload media" }, { status: 500 });
      }
      uploadedMediaId = uploadData.id;
    }

    const components: any[] = [];

    if (headerMediaType !== "none") {
      const type = headerMediaType;
      let mediaObj = null;
      if (uploadedMediaId) mediaObj = { id: uploadedMediaId };
      else if (mediaUrl) mediaObj = mediaUrl.startsWith("http") ? { link: mediaUrl } : { id: mediaUrl };

      if (mediaObj) {
        components.push({ type: "header", parameters: [{ type, [type]: mediaObj }] });
      }
    }

    if (variables.length > 0) {
      components.push({
        type: "body",
        parameters: variables.map((value: string) => ({ type: "text", text: value })),
      });
    }

    const templatePayload = { name: templateName, language: { code: languageCode }, components };
    const messagePayload = { messaging_product: "whatsapp", to: sanitizedPhone, type: "template", template: templatePayload };

    let response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(messagePayload),
    });

    let data = await response.json();

    if (!response.ok && data.error?.code === 131008 && category === "AUTHENTICATION" && variables.length > 0) {
      const retryPayload = {
        messaging_product: "whatsapp",
        to: sanitizedPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            { type: "body", parameters: variables.map((value: string) => ({ type: "text", text: value })) },
            { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: variables[0] }] },
          ],
        },
      };

      response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(retryPayload),
      });
      data = await response.json();
    }

    if (!response.ok) {
      console.error("❌ WhatsApp Template Error:", JSON.stringify(data, null, 2));
      return NextResponse.json({ success: false, error: data.error, message: data.error?.message || "Failed to send message" }, { status: 400 });
    }

    if (messagePrice > 0) {
      payer.balance = Math.round((currentBalance - messagePrice) * 100) / 100;
      payer.balance = Math.max(payer.balance, 0);
      await payer.save();
    }

    await incrementUsage(session.user.id, "testMessages");

    return NextResponse.json({
      success: true,
      data,
      balance: payer.balance,
      chargedAmount: messagePrice,
      category: category,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Send Message Error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
