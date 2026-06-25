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

    // ✅ READ whatsappPhoneNumberId FROM QUERY PARAMS
    const { searchParams } = new URL(req.url);
    const whatsappPhoneNumberId = searchParams.get("whatsappPhoneNumberId") || "";

    // ✅ BUILD THE $match STAGE
    const matchStage: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // If a specific WhatsApp number is selected, filter by it
    if (whatsappPhoneNumberId && whatsappPhoneNumberId !== "all") {
      matchStage.whatsappPhoneNumberId = whatsappPhoneNumberId;
    }

    const chats = await Message.aggregate([
      // ✅ DYNAMIC MATCH — filters by userId AND optionally by whatsappPhoneNumberId
      { $match: matchStage },

      { $sort: { phone: 1, createdAt: -1 } },

      {
        $group: {
          _id: "$phone",
          phone: { $first: "$phone" },
          name: { $first: "$contactName" },
          profilePicUrl: { $first: "$profilePicUrl" },
          lastMessage: { $first: "$text" },
          lastDirection: { $first: "$direction" },
          lastMessageType: { $first: "$messageType" },
          lastMediaUrl: { $first: "$mediaUrl" },
          updatedAt: { $first: "$createdAt" },
          // ✅ ALSO CARRY FORWARD the whatsappPhoneNumberId so the UI knows
          // which WABA number this chat belongs to
          whatsappPhoneNumberId: { $first: "$whatsappPhoneNumberId" },
          senderNumber: { $first: "$senderNumber" },
          fromPhone: { $first: "$fromPhone" },
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
