/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const DEFAULT_WHATSAPP_TOKEN = process.env.META_ACCESS_TOKEN!;
const DEFAULT_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const WHATSAPP_API = "https://graph.facebook.com/v21.0";

const extractTemplateBody = (components: any[]): string => {
  const bodyComp = components?.find((c: any) => c.type === "body");
  if (!bodyComp?.parameters) return "";
  return bodyComp.parameters.map((p: any) => p.text || p.type || "").join("");
};

const extractHeaderText = (components: any[]): string => {
  const headerComp = components?.find((c: any) => c.type === "header");
  if (!headerComp?.parameters) return "";
  return headerComp.parameters.map((p: any) => p.text || p.type || "").join("");
};

const detectHeaderType = (components: any[]): "text" | "image" | "video" | "document" | "none" => {
  const headerComp = components?.find((c: any) => c.type === "header");
  if (!headerComp?.parameters?.length) return "none";
  const param = headerComp.parameters[0];
  if (param.image) return "image";
  if (param.video) return "video";
  if (param.document) return "document";
  return "text";
};

const extractHeaderMediaUrl = (components: any[]): string | null => {
  const headerComp = components?.find((c: any) => c.type === "header");
  if (!headerComp?.parameters?.length) return null;
  const param = headerComp.parameters[0];
  return param.image?.link || param.video?.link || param.document?.link || null;
};

const extractButtons = (components: any[]): any[] => {
  const buttonComp = components?.find((c: any) => c.type === "button");
  if (!buttonComp?.parameters) return [];
  return buttonComp.parameters.map((p: any, idx: number) => ({
    type: p.type || "quick_reply",
    text: p.text || p.title || `Button ${idx + 1}`,
    url: p.url || undefined,
    phone_number: p.phone_number || undefined,
    index: idx,
  }));
};

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findById(userId);
    const WHATSAPP_TOKEN = user?.whatsappAccessToken || DEFAULT_WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = user?.whatsappPhoneNumberId || DEFAULT_PHONE_NUMBER_ID;

    if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
      return NextResponse.json({
        success: false,
        message: "WhatsApp credentials not configured for this user",
      }, { status: 400 });
    }

    const contentType = req.headers.get("content-type") || "";
    let phone: string;
    let text: string;
    let file: File | null = null;
    let templatePayload: any = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      phone = formData.get("phone") as string;
      text = (formData.get("text") as string) || "";
      file = formData.get("file") as File | null;
    } else {
      const body = await req.json();
      phone = body.phone;
      text = body.text || "";
      templatePayload = body.template || null;
    }

    if (!phone) {
      return NextResponse.json({ success: false, message: "Phone is required" }, { status: 400 });
    }

    // CRITICAL FIX: Strip the "+" sign to match the inbound webhook format
    phone = phone.replace(/\+/g, "");

    let whatsappRes: any;
    let storedMessage: any;
    let messageType: string = "text";
    const mediaUrl: string | null = null;

    // ─────────────────────────────────────
    // CASE 1: Sending a TEMPLATE message
    // ─────────────────────────────────────
    if (templatePayload) {
      messageType = "template";

      const waPayload: any = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templatePayload.name,
          language: { code: templatePayload.language || "en" },
          components: templatePayload.components || [],
        },
      };

      whatsappRes = await fetch(`${WHATSAPP_API}/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(waPayload),
      });

      const waData = await whatsappRes.json();

      if (!whatsappRes.ok || waData.error) {
        console.error("WhatsApp template error:", waData.error);
        return NextResponse.json({
          success: false,
          message: waData.error?.message || "Failed to send template",
        }, { status: 500 });
      }

      const whatsappMessageId = waData.messages?.[0]?.id || null;
      const components = templatePayload.components || [];
      const bodyText = extractTemplateBody(components);
      const headerText = extractHeaderText(components);
      const headerType = detectHeaderType(components);
      const headerMediaUrl = extractHeaderMediaUrl(components);
      const buttons = extractButtons(components);
      const footer = templatePayload.footer || null;
      const templateName = templatePayload.name;
      const displayText = bodyText || headerText || `[Template: ${templateName}]`;

      storedMessage = await Message.create({
        userId,
        phone,
        text: displayText,
        direction: "out",
        messageType: "template",
        mediaUrl: headerMediaUrl,
        whatsappMessageId,
        templateName,
        templateHeaderType: headerType,
        templateHeaderText: headerType === "text" ? headerText : null,
        templateBodyText: bodyText,
        templateFooter: footer,
        templateButtons: buttons.length > 0 ? JSON.stringify(buttons) : null,
        templateLanguage: templatePayload.language || "en",
      });

      return NextResponse.json({ success: true, message: storedMessage });
    }

    // ─────────────────────────────────────
    // CASE 2: Sending a MEDIA message
    // ─────────────────────────────────────
    if (file) {
      const mediaFormData = new FormData();
      mediaFormData.append("file", file);
      mediaFormData.append("messaging_product", "whatsapp");

      const uploadRes = await fetch(`${WHATSAPP_API}/${PHONE_NUMBER_ID}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        body: mediaFormData,
      });

      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        console.error("Media upload error:", uploadData.error);
        return NextResponse.json({
          success: false,
          message: uploadData.error?.message || "Failed to upload media",
        }, { status: 500 });
      }

      const mediaId = uploadData.id;
      const fileMime = file.type || "";
      if (fileMime.startsWith("image/")) messageType = "image";
      else if (fileMime.startsWith("video/")) messageType = "video";
      else if (fileMime.startsWith("audio/")) messageType = "audio";
      else messageType = "document";

      const waPayload: any = {
        messaging_product: "whatsapp",
        to: phone,
        type: messageType,
        [messageType]: {
          id: mediaId,
          ...(text ? { caption: text } : {}),
        },
      };

      whatsappRes = await fetch(`${WHATSAPP_API}/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(waPayload),
      });

      const waData = await whatsappRes.json();

      if (!whatsappRes.ok || waData.error) {
        console.error("WhatsApp media send error:", waData.error);
        return NextResponse.json({
          success: false,
          message: waData.error?.message || "Failed to send media",
        }, { status: 500 });
      }

      const whatsappMessageId = waData.messages?.[0]?.id || null;

      storedMessage = await Message.create({
        userId,
        phone,
        text: text || "",
        direction: "out",
        messageType: messageType as any,
        mediaUrl: mediaId,
        whatsappMessageId,
      });

      return NextResponse.json({ success: true, message: storedMessage });
    }

    // ─────────────────────────────────────
    // CASE 3: Sending a TEXT message
    // ─────────────────────────────────────
    const waPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: text },
    };

    whatsappRes = await fetch(`${WHATSAPP_API}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(waPayload),
    });

    const waData = await whatsappRes.json();

    if (!whatsappRes.ok || waData.error) {
      console.error("WhatsApp text send error:", waData.error);
      return NextResponse.json({
        success: false,
        message: waData.error?.message || "Failed to send message",
      }, { status: 500 });
    }

    const whatsappMessageId = waData.messages?.[0]?.id || null;

    storedMessage = await Message.create({
      userId,
      phone,
      text,
      direction: "out",
      messageType: "text",
      whatsappMessageId,
    });

    return NextResponse.json({ success: true, message: storedMessage });
  } catch (error: any) {
    console.error("Error in /api/whatsapp POST:", error);
    return NextResponse.json({
      success: false,
      message: error.message || "Internal server error",
    }, { status: 500 });
  }
}