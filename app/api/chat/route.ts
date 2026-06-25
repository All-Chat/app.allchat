/* =====================================================================
   GET /api/chat - SMART ISOLATION (Includes Legacy Untagged Messages)
   ===================================================================== */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let phone = searchParams.get("phone") || "";
    const wabaId = searchParams.get("whatsappPhoneNumberId") || "";

    if (!phone) {
      return NextResponse.json({ success: false, messages: [] }, { status: 400 });
    }
    
    phone = phone.replace(/\+/g, "");

    // ── BUILD SMART FILTER ──
    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(session.user.id),
      phone: phone,
    };

    if (wabaId && wabaId !== "all") {
      // Fetch messages explicitly for THIS WABA + legacy untagged messages
      filter.$or = [
        { whatsappPhoneNumberId: wabaId },
        { whatsappPhoneNumberId: null },
        { whatsappPhoneNumberId: { $exists: false } },
      ];
    }

    const messages = await Message.find(filter).sort({ createdAt: 1 }).lean();

    const mapped = messages.map((m) => ({
      _id: m._id,
      phone: m.phone,
      text: m.text,
      direction: m.direction,
      messageType: m.messageType,
      mediaUrl: m.mediaUrl,
      contactName: m.contactName,
      createdAt: m.createdAt,
      timestamp: m.createdAt,
      whatsappMessageId: m.whatsappMessageId,
      status: m.status,
      templateName: m.templateName || undefined,
      templateHeaderType: m.templateHeaderType || undefined,
      templateHeaderText: m.templateHeaderText || undefined,
      templateBodyText: m.templateBodyText || undefined,
      templateFooter: m.templateFooter || undefined,
      templateButtons: m.templateButtons || undefined,
      templateLanguage: m.templateLanguage || undefined,
      whatsappPhoneNumberId: m.whatsappPhoneNumberId || undefined,
      fromPhone: m.fromPhone || undefined,
      senderNumber: m.senderNumber || undefined,
    }));

    return NextResponse.json({ success: true, messages: mapped });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return NextResponse.json({ success: false, messages: [] }, { status: 500 });
  }
}
