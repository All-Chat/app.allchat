/* =====================================================================
   GET /api/chats - FETCH CHAT LIST
   =====================================================================
   Returns a list of unique phone numbers with their last message.
   
   ✅ FILTER BY whatsappPhoneNumberId:
   When a specific WABA number is selected, we show:
   - Messages that match that number's ID (new messages)
   - Messages with null/missing field (old messages before fix)
   
   This ensures old chats don't disappear when you switch numbers.
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
    const wabaId = searchParams.get("whatsappPhoneNumberId") || "";

    // Base filter: always filter by the logged-in user's ID
    const matchStage: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(session.user.id),
    };

    // When a specific WABA number is selected, include old messages too
    if (wabaId && wabaId !== "all") {
      matchStage.$or = [
        { whatsappPhoneNumberId: wabaId },
        { whatsappPhoneNumberId: null },
        { whatsappPhoneNumberId: { $exists: false } },
      ];
    }

    const chats = await Message.aggregate([
      { $match: matchStage },
      { $sort: { phone: 1, createdAt: -1 } },
      {
        $group: {
          _id: "$phone",
          phone: { $first: "$phone" },
          name: { $first: "$contactName" },
          lastMessage: { $first: "$text" },
          lastDirection: { $first: "$direction" },
          lastMessageType: { $first: "$messageType" },
          updatedAt: { $first: "$createdAt" },
          whatsappPhoneNumberId: { $first: "$whatsappPhoneNumberId" },
        },
      },
      { $sort: { updatedAt: -1, _id: 1 } },
    ]);

    return NextResponse.json({ success: true, chats });
  } catch (error) {
    console.error("Error in /api/chats:", error);
    return NextResponse.json({ success: false, chats: [] }, { status: 500 });
  }
}
