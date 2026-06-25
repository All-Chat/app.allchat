/* =====================================================================
   GET /api/chats - FETCH CHAT LIST
   =====================================================================
   ✅ FIX: When a specific WABA is selected, include messages that have
   whatsappPhoneNumberId = null/undefined (legacy messages saved before
   the webhook was tagging them). This matches the behavior of /api/chat.
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
    const userId = session.user.id;

    // ── STEP 1: Find all phone IDs that have messages from this user
    // When a WABA is selected, find phones that have at least one message
    // from that WABA OR with no WABA tag (legacy messages)
    const phoneMatchStage: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (wabaId && wabaId !== "all") {
      // ✅ FIX: Use $or to include untagged (null/undefined) messages
      // This ensures legacy messages (saved before webhook fix) still show up
      phoneMatchStage.$or = [
        { whatsappPhoneNumberId: wabaId },
        { whatsappPhoneNumberId: null },
        { whatsappPhoneNumberId: { $exists: false } },
      ];
    }

    const matchingPhones = await Message.distinct("phone", phoneMatchStage).lean();

    if (matchingPhones.length === 0) {
      return NextResponse.json({ success: true, chats: [] });
    }

    // ── STEP 2: Aggregate those phone IDs to build the chat list
    const chats = await Message.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          phone: { $in: matchingPhones },
        },
      },
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
