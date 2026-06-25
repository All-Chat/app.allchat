// /api/chat/route.ts
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
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    let phone = searchParams.get("phone") || "";
    const wabaId = searchParams.get("whatsappPhoneNumberId") || "";

    if (!phone) return NextResponse.json({ success: false, messages: [] }, { status: 400 });
    phone = phone.replace(/\+/g, "");

    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      phone,
    };

    // ✅ FIX: Same backward-compatible filter
    if (wabaId && wabaId !== "all") {
      filter.$or = [
        { whatsappPhoneNumberId: wabaId },
        { whatsappPhoneNumberId: null },
        { whatsappPhoneNumberId: { $exists: false } }
      ];
    }

    const messages = await Message.find(filter).sort({ createdAt: 1 }).lean();

    const mapped = messages.map((msg) => ({
      _id: msg._id,
      phone: msg.phone,
      text: msg.text,
      direction: msg.direction,
      messageType: msg.messageType,
      mediaUrl: msg.mediaUrl,
      contactName: msg.contactName,
      createdAt: msg.createdAt,
      timestamp: msg.createdAt,
      whatsappMessageId: msg.whatsappMessageId,
      status: msg.status,
      templateName: msg.templateName || undefined,
      templateHeaderType: msg.templateHeaderType || undefined,
      templateHeaderText: msg.templateHeaderText || undefined,
      templateBodyText: msg.templateBodyText || undefined,
      templateFooter: msg.templateFooter || undefined,
      templateButtons: msg.templateButtons || undefined,
      templateLanguage: msg.templateLanguage || undefined,
      whatsappPhoneNumberId: msg.whatsappPhoneNumberId || undefined,
      fromPhone: msg.fromPhone || undefined,
      senderNumber: msg.senderNumber || undefined,
    }));

    return NextResponse.json({ success: true, messages: mapped });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return NextResponse.json({ success: false, messages: [] }, { status: 500 });
  }
}
