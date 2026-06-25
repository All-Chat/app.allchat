/* =====================================================================
   FREE-TEXT SEND FROM CHAT - MULTI-ACCOUNT SUPPORT
   =====================================================================
   This is the route the chat UI calls when you type a message
   and press Send. It also needs to use the correct WABA number's
   credentials and save the message with whatsappPhoneNumberId.
   ===================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

// Same credential resolution as the send route
function resolveCredentials(user: any, payer: any, explicitPhoneId?: string) {
  if (explicitPhoneId) {
    const uMatch = user?.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === explicitPhoneId);
    if (uMatch) return { PHONE_NUMBER_ID: uMatch.whatsappPhoneNumberId, ACCESS_TOKEN: uMatch.whatsappAccessToken || user?.whatsappAccessToken };
    const pMatch = payer?.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === explicitPhoneId);
    if (pMatch) return { PHONE_NUMBER_ID: pMatch.whatsappPhoneNumberId, ACCESS_TOKEN: pMatch.whatsappAccessToken || payer?.whatsappAccessToken };
  }
  const activeNum = user?.whatsappNumbers?.find((n: any) => n.isActive);
  if (activeNum?.whatsappPhoneNumberId) return { PHONE_NUMBER_ID: activeNum.whatsappPhoneNumberId, ACCESS_TOKEN: activeNum.whatsappAccessToken || user?.whatsappAccessToken };
  if (user?.whatsappNumbers?.[0]?.whatsappPhoneNumberId) { const f = user.whatsappNumbers[0]; return { PHONE_NUMBER_ID: f.whatsappPhoneNumberId, ACCESS_TOKEN: f.whatsappAccessToken || user?.whatsappAccessToken }; }
  return { PHONE_NUMBER_ID: user?.whatsappPhoneNumberId || payer?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "", ACCESS_TOKEN: user?.whatsappAccessToken || payer?.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "" };
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    let payer = user;
    if (user.parentTenantId) {
      const p = await User.findOne({ tenantId: user.parentTenantId });
      if (p) payer = p;
    }

    const ct = req.headers.get("content-type") || "";
    let phone = "", text = "", file: File | null = null, whatsappPhoneNumberId = "";

    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      phone = (fd.get("phone") as string) || "";
      text = (fd.get("text") as string) || "";
      file = fd.get("file") as File | null;
      whatsappPhoneNumberId = (fd.get("whatsappPhoneNumberId") as string) || "";
    } else {
      const body = await req.json();
      phone = body.phone || "";
      text = body.text || "";
      whatsappPhoneNumberId = body.whatsappPhoneNumberId || "";
    }

    if (!phone) return NextResponse.json({ success: false, message: "Phone is required" }, { status: 400 });

    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject(), whatsappPhoneNumberId);
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });
    }

    const sPhone = phone.replace(/\+/g, "");

    // Upload media if attached
    let mediaId: string | null = null;
    if (file) {
      const mfd = new FormData();
      mfd.append("file", file);
      mfd.append("messaging_product", "whatsapp");
      const ur = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        body: mfd,
      });
      const ud = await ur.json();
      if (!ur.ok || !ud.id) {
        return NextResponse.json({ success: false, message: "Media upload failed" }, { status: 500 });
      }
      mediaId = ud.id;
    }

    // Build the message payload
    const mp: any = { messaging_product: "whatsapp", to: sPhone, type: "text", text };

    if (mediaId) {
      mp.type = file?.type?.startsWith("image") ? "image" : file?.type?.startsWith("video") ? "video" : "document";
      mp[mp.type] = { id: mediaId };
    } else if (text) {
      mp.text = text;
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(mp),
    });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ success: false, message: data.error?.message || "Failed to send" }, { status: 400 });
    }

    // ✅ SAVE TO DB FOR CHAT DISPLAY
    try {
      await Message.create({
        userId: session.user.id,
        phone: sPhone,
        text: text || (file ? `[${file.type}]` : ""),
        direction: "out",
        messageType: mediaId ? (file?.type?.startsWith("image") ? "image" : file?.type?.startsWith("video") ? "video" : "document") : "text",
        mediaUrl: mediaId,
        whatsappMessageId: data?.messages?.[0]?.id || null,
        status: "sent",
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      });
    } catch (dbErr) {
      console.error("⚠️ DB save failed:", dbErr);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const m = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: m }, { status: 500 });
  }
}
