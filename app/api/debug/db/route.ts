import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";

export async function GET() {
  try {
    await connectDB();
    
    // 1. Get the 5 most recent messages in the ENTIRE database
    const recentMessages = await Message.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 2. Get the 5 most recent unique phone numbers
    const recentChats = await Message.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$phone", lastMessage: { $first: "$text" }, updatedAt: { $first: "$createdAt" } } },
      { $sort: { updatedAt: -1 } },
      { $limit: 5 }
    ]);

    return NextResponse.json({ 
      success: true, 
      recentMessages,
      recentChats
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}