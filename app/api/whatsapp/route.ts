/* =====================================================================
   FREE-TEXT SEND FROM CHAT - MULTI-ACCOUNT SUPPORT
   ===================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

// ─── ARRAY-FIRST CREDENTIAL RESOLUTION ───────────────────────────────────
function resolveCredentials(user: any, payer: any, explicitPhoneId?: string) {
  if (explicitPhoneId) {
    const uMatch = user?.whatsappNumbers?.find(
      (n: any) => n.whatsappPhoneNumberId === explicitPhoneId
    );
    if (uMatch)
      return {
        PHONE_NUMBER_ID: uMatch.whatsappPhoneNumberId,
        ACCESS_TOKEN:
          uMatch.whatsappAccessToken || user?.whatsappAccessToken,
      };
    const pMatch = payer?.whatsappNumbers?.find(
      (n: any) => n.whatsappPhoneNumberId === explicitPhoneId
    );
    if (pMatch)
      return {
        PHONE_NUMBER_ID: pMatch.whatsappPhoneNumberId,
        ACCESS_TOKEN:
          pMatch.whatsappAccessToken || payer?.whatsappAccessToken,
      };
  }
  const activeNum = user?.whatsappNumbers?.find((n: any) => n.isActive);
  if (activeNum?.whatsappPhoneNumberId) {
    return {
      PHONE_NUMBER_ID: activeNum.whatsappPhoneNumberId,
      ACCESS_TOKEN:
        activeNum.whatsappAccessToken || user?.whatsappAccessToken,
    };
  }
  if (user?.whatsappNumbers?.[0]?.whatsappPhoneNumberId) {
    const f = user.whatsappNumbers[0];
    return {
      PHONE_NUMBER_ID: f.whatsappPhoneNumberId,
      ACCESS_TOKEN: f.whatsappAccessToken || user?.whatsappAccessToken,
    };
  }
  return {
    PHONE_NUMBER_ID:
      user?.whatsappPhoneNumberId ||
      payer?.whatsappPhoneNumberId ||
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      "",
    ACCESS_TOKEN:
      user?.whatsappAccessToken ||
      payer?.whatsappAccessToken ||
      process.env.META_ACCESS_TOKEN ||
      "",
  };
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );

    const user = await User.findById(session.user.id);
    if (!user)
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );

    let payer = user;
    if (user.parentTenantId) {
      const p = await User.findOne({ tenantId: user.parentTenantId });
      if (p) payer = p;
    }

    const ct = req.headers.get("content-type") || "";
    let phone = "",
      text = "",
      file: File | null = null,
      whatsappPhoneNumberId = "";

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

    if (!phone)
      return NextResponse.json(
        { success: false, message: "Phone is required" },
        { status: 400 }
      );

    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(
      user.toObject(),
      payer.toObject(),
      whatsappPhoneNumberId
    );
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json(
        { success: false, message: "WhatsApp credentials not configured." },
        { status: 400 }
      );
    }

    const sPhone = phone.replace(/\+/g, "");

    // ── Upload media if attached ──
    let mediaId: string | null = null;
    let mediaType: string = "document";

    if (file) {
      // Determine media type from MIME
      if (file.type?.startsWith("image/")) mediaType = "image";
      else if (file.type?.startsWith("video/")) mediaType = "video";
      else mediaType = "document";

      const mfd = new FormData();
      mfd.append("file", file);
      mfd.append("messaging_product", "whatsapp");
      const ur = await fetch(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          body: mfd,
        }
      );
      const ud = await ur.json();
      if (!ur.ok || !ud.id) {
        return NextResponse.json(
          { success: false, message: ud.error?.message || "Media upload failed" },
          { status: 500 }
        );
      }
      mediaId = ud.id;
    }

    // ── ✅ FIX: Build message payload CORRECTLY for Meta's schema ──
    // Meta requires: text: { body: "..." }  NOT  text: "..."
    let mp: any;

    if (mediaId) {
      // Media message (image/video/document)
      const mediaObj: any = { id: mediaId };
      // Add caption for image/video (documents don't support caption in API)
      if ((mediaType === "image" || mediaType === "video") && text.trim()) {
        mediaObj.caption = text.trim();
      }
      mp = {
        messaging_product: "whatsapp",
        to: sPhone,
        type: mediaType,
        [mediaType]: mediaObj,
      };
    } else {
      // Text-only message
      mp = {
        messaging_product: "whatsapp",
        to: sPhone,
        type: "text",
        // ✅ THIS IS THE FIX: text must be an object with "body", not a raw string
        text: {
          body: text,
          preview_url: false,
        },
      };
    }

    // ── Send to Meta ──
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mp),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp Send Error:", JSON.stringify(data, null, 2));
      return NextResponse.json(
        { success: false, message: data.error?.message || "Failed to send" },
        { status: 400 }
      );
    }

    // ── Save to DB for chat display ──
    try {
      // For documents, include the filename in the text
      let displayText = text;
      if (mediaType === "document" && file) {
        displayText = text || file.name || "Document";
      }

      await Message.create({
        userId: session.user.id,
        phone: sPhone,
        text: displayText || "",
        direction: "out",
        messageType: mediaId ? mediaType : "text",
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
    console.error("❌ Send Error:", m);
    return NextResponse.json({ success: false, message: m }, { status: 500 });
  }
}
