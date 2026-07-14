/* =====================================================================
   GET /api/chats - 100% STRICT ISOLATION + ONLY REPLIED CHATS (LIMIT 20)
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

    if (wabaId && wabaId !== "all") {
      Message.updateMany(
        {
          userId: new mongoose.Types.ObjectId(userId),
          whatsappPhoneNumberId: { $in: [null, undefined, ""] },
          direction: "out",
        },
        { $set: { whatsappPhoneNumberId: wabaId } }
      ).exec(); 
    }

    const phoneMatchStage: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      direction: "in", 
    };

    if (wabaId && wabaId !== "all") {
      phoneMatchStage.whatsappPhoneNumberId = wabaId;
    }

    const matchingPhones = await Message.distinct("phone", phoneMatchStage).lean();

    if (matchingPhones.length === 0) {
      return NextResponse.json({ success: true, chats: [] });
    }

    const chats = await Message.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          phone: { $in: matchingPhones },
          ...(wabaId && wabaId !== "all" ? { whatsappPhoneNumberId: wabaId } : {})
        },
      },
      { $sort: { createdAt: -1 } },
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
      { $sort: { updatedAt: -1 } },
      { $limit: 20 } // ✅ Only load the 20 most recent active chats instantly
    ]);

    return NextResponse.json({ success: true, chats });
  } catch (error) {
    console.error("Error in /api/chats:", error);
    return NextResponse.json({ success: false, chats: [] }, { status: 500 });
  }
}
