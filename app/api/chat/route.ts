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

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let phone = searchParams.get("phone") || "";

    if (!phone) {
      return NextResponse.json({ success: false, messages: [] }, { status: 400 });
    }

    // CRITICAL FIX: Strip the "+" sign so it matches the webhook's inbound format
    phone = phone.replace(/\+/g, "");

    const messages = await Message.find({ 
      userId: new mongoose.Types.ObjectId(userId), 
      phone 
    })
      .sort({ createdAt: 1 })
      .lean();

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
    }));

    return NextResponse.json({ success: true, messages: mapped });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return NextResponse.json({ success: false, messages: [] }, { status: 500 });
  }
}