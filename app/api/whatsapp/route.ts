/* =====================================================================
   FREE-TEXT SEND FROM CHAT - BULLETPROOF OWNER FINDER
   ===================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const runtime = "nodejs";

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

    // ─── ✅ BULLETPROOF OWNER FINDER ───────────────────────────────────
    let PHONE_NUMBER_ID = "";
    let ACCESS_TOKEN = "";
    let messageOwnerId = session.user.id; // Default to logged in user

    if (whatsappPhoneNumberId) {
      // 1. Check if the current user owns this number
      const ownNumber = user.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === whatsappPhoneNumberId);
      
      if (ownNumber) {
        // User owns it
        PHONE_NUMBER_ID = ownNumber.whatsappPhoneNumberId || "";
        ACCESS_TOKEN = ownNumber.whatsappAccessToken || user.whatsappAccessToken || "";
        messageOwnerId = session.user.id;
      } else {
        // 2. User doesn't own it. Search the ENTIRE database for the exact owner of this number.
        const owner = await User.findOne({ 
          "whatsappNumbers.whatsappPhoneNumberId": whatsappPhoneNumberId 
        }).select("_id whatsappNumbers whatsappAccessToken");

        if (owner) {
          const subNum = owner.whatsappNumbers.find((n: any) => n.whatsappPhoneNumberId === whatsappPhoneNumberId);
          if (subNum) {
            PHONE_NUMBER_ID = subNum.whatsappPhoneNumberId || "";
            ACCESS_TOKEN = subNum.whatsappAccessToken || owner.whatsappAccessToken || "";
            
            // ✅ CRITICAL: Save the message under the EXACT owner's ID
            messageOwnerId = owner._id.toString(); 
          }
        }
      }
    } else {
      // Fallback to active number if no specific ID was passed
      const activeNum = user.whatsappNumbers?.find((n: any) => n.isActive);
      if (activeNum) {
        PHONE_NUMBER_ID = activeNum.whatsappPhoneNumberId || "";
        ACCESS_TOKEN = activeNum.whatsappAccessToken || user.whatsappAccessToken || "";
      } else {
        PHONE_NUMBER_ID = user.whatsappPhoneNumberId || payer.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
        ACCESS_TOKEN = user.whatsappAccessToken || payer.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";
      }
    }

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
      return NextResponse.json(
        { success: false, message: "WhatsApp credentials not configured for this number." },
        { status: 400 }
      );
    }
    // ─────────────────────────────────────────────────────────────────

    const sPhone = phone.replace(/\+/g, "");

    // ── Upload media if attached ──
    let mediaId: string | null = null;
    let mediaType: string = "document";

    if (file) {
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

    // ── Build message payload for Meta's schema ──
    let mp: any;

    if (mediaId) {
      const mediaObj: any = { id: mediaId };
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
      mp = {
        messaging_product: "whatsapp",
        to: sPhone,
        type: "text",
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
      let displayText = text;
      if (mediaType === "document" && file) {
        displayText = text || file.name || "Document";
      }

      await Message.create({
        userId: new mongoose.Types.ObjectId(messageOwnerId), // ✅ Saves under the exact owner
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
