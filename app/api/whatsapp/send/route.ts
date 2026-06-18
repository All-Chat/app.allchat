/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();

    // 1. Authentication Check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // 2. Multi-Tenant Credentials
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const PHONE_NUMBER_ID = user.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const ACCESS_TOKEN = user.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, message: "WhatsApp credentials not configured" }, { status: 400 });
    }

    // ==========================================
    // 🔴 BALANCE CHECK — BEFORE ANY PROCESSING
    // ==========================================
    const pricePerMessage = user.pricePerMessage || 0;
    const currentBalance = user.balance || 0;

    if (pricePerMessage > 0 && currentBalance < pricePerMessage) {
      return NextResponse.json(
        {
          success: false,
          message: "Insufficient balance. Please recharge your account to send messages.",
        },
        { status: 402 }
      );
    }
    // ==========================================

    // ==========================================
    // 3. SMART PAYLOAD PARSING (FormData OR JSON)
    // ==========================================
    const contentType = req.headers.get("content-type") || "";
    let phone: string;
    let templateName: string;
    let languageCode: string;
    let variables: string[];
    let headerMediaType: string;
    let file: File | null = null;
    let mediaUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      phone = (formData.get("phone") as string) || "";
      templateName = (formData.get("templateName") as string) || "";
      languageCode = (formData.get("languageCode") as string) || "en";
      variables = JSON.parse((formData.get("variables") as string) || "[]");
      headerMediaType = (formData.get("headerMediaType") as string) || "none";
      file = formData.get("file") as File | null;
      mediaUrl = (formData.get("mediaUrl") as string) || null;
    } else {
      const body = await req.json();
      phone = body.phone || "";
      templateName = body.templateName || "";
      languageCode = body.languageCode || "en";
      variables = body.variables || [];
      headerMediaType = body.headerMediaType || body.mediaType || "none";
      mediaUrl = body.mediaUrl || null;
      file = null;
    }

    if (!phone || !templateName) {
      return NextResponse.json(
        { success: false, message: "Phone and templateName are required" },
        { status: 400 }
      );
    }

    const sanitizedPhone = phone.replace(/\+/g, "");

    // ==========================================
    // NORMALIZE headerMediaType
    // ==========================================
    const VALID_MEDIA_TYPES = ["image", "video", "document"];
    headerMediaType = (headerMediaType || "none").toLowerCase().trim();
    if (headerMediaType === "" || headerMediaType === "undefined" || headerMediaType === "null") {
      headerMediaType = "none";
    }
    if (headerMediaType !== "none" && !VALID_MEDIA_TYPES.includes(headerMediaType)) {
      return NextResponse.json(
        { success: false, message: `Invalid headerMediaType: "${headerMediaType}". Must be one of: none, image, video, document` },
        { status: 400 }
      );
    }

    // ==========================================
    // CLEAN mediaUrl
    // ==========================================
    if (mediaUrl === "" || mediaUrl === "null" || mediaUrl === "undefined") {
      mediaUrl = null;
    }

    console.log(`📤 Sending template "${templateName}" to ${sanitizedPhone} with language: "${languageCode}"`);

    // ==========================================
    // 4. Upload Media if a file exists
    // ==========================================
    let uploadedMediaId: string | null = null;
    if (headerMediaType !== "none" && file) {
      const mediaFormData = new FormData();
      mediaFormData.append("file", file);
      mediaFormData.append("messaging_product", "whatsapp");

      const uploadRes = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          body: mediaFormData,
        }
      );

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        console.error("❌ Media upload error:", uploadData.error);
        return NextResponse.json(
          { success: false, message: uploadData.error?.message || "Failed to upload media to WhatsApp" },
          { status: 500 }
        );
      }
      uploadedMediaId = uploadData.id;
      console.log(`✅ Media uploaded to WhatsApp. ID: ${uploadedMediaId}`);
    }

    // ==========================================
    // 5. Construct Components Array
    // ==========================================
    const components: any[] = [];

    if (headerMediaType !== "none") {
      const type = headerMediaType;

      let mediaObj = null;
      if (uploadedMediaId) {
        mediaObj = { id: uploadedMediaId };
      } else if (mediaUrl) {
        const isUrl = mediaUrl.startsWith("http");
        mediaObj = isUrl ? { link: mediaUrl } : { id: mediaUrl };
      }

      if (mediaObj) {
        components.push({
          type: "header",
          parameters: [{ type, [type]: mediaObj }],
        });
      } else {
        console.warn(`⚠️ headerMediaType is "${headerMediaType}" but no file or mediaUrl was provided. Sending template without header media.`);
      }
    }

    if (variables.length > 0) {
      components.push({
        type: "body",
        parameters: variables.map((value: string) => ({
          type: "text",
          text: value,
        })),
      });
    }

    // ==========================================
    // 6. Send Template Message
    // ==========================================
    const templatePayload = {
      name: templateName,
      language: {
        code: languageCode,
      },
      components,
    };

    const messagePayload = {
      messaging_product: "whatsapp",
      to: sanitizedPhone,
      type: "template",
      template: templatePayload,
    };

    console.log(`📋 Full payload:`, JSON.stringify(templatePayload, null, 2));

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp Template Error:", JSON.stringify(data, null, 2));

      if (data.error?.code === 132001) {
        const details = data.error?.error_data?.details || data.error?.message || "";
        return NextResponse.json(
          {
            success: false,
            error: data.error,
            message: `Language mismatch! Template "${templateName}" was sent with language "${languageCode}" but Meta says: ${details}`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, error: data.error, message: data.error?.message || "Failed to send message" },
        { status: 400 }
      );
    }

    console.log(`✅ Message sent successfully to ${sanitizedPhone}`);

    // ==========================================
    // 🔴 DEDUCT BALANCE AFTER SUCCESSFUL SEND
    // ==========================================
    if (pricePerMessage > 0) {
      const newBalance = Math.round((currentBalance - pricePerMessage) * 100) / 100;
      user.balance = Math.max(newBalance, 0);
      await user.save();
      console.log(`💰 Deducted ₹${pricePerMessage} from user ${user.name}. New balance: ₹${user.balance}`);
    }
    // ==========================================

    return NextResponse.json({
      success: true,
      data,
      balance: user.balance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Send Message Error:", message);
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
