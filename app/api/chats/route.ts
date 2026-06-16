import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export async function GET() {
  try {
    await connectDB();
    
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const chats = await Message.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } }, 
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