/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");

    if (!campaignId) {
      return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });
    }

    // Only fetch what we need for speed
    const campaign = await Campaign.findById(campaignId)
      .select("userId reportData createdAt")
      .lean();

    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    // 1. Get all phones in this campaign
    const campaignPhones = new Set(
      (campaign.reportData || [])
        .map((d: any) => d.phone)
        .filter(Boolean)
    );

    if (campaignPhones.size === 0) {
      return NextResponse.json({ success: true, replies: {} });
    }

    // ✅ CRITICAL FIX: Look back since the campaign was created, NOT just 2 minutes!
    // This ensures replies NEVER disappear from your screen.
    const since = campaign.createdAt || new Date(Date.now() - 30 * 60 * 1000); 

    const messages = await Message.find({
      userId: session.user.id,
      direction: "in",
      createdAt: { $gte: since },
    })
      .sort({ createdAt: 1 })
      .select("phone text") // Only fetch text and phone to keep it lightning fast
      .lean();

    // 2. Group replies by phone, ONLY for phones in this campaign
    const repliesMap: Record<string, string[]> = {};
    for (const msg of messages) {
      if (campaignPhones.has(msg.phone) && msg.text) {
        if (!repliesMap[msg.phone]) repliesMap[msg.phone] = [];
        repliesMap[msg.phone].push(msg.text);
      }
    }

    return NextResponse.json({ success: true, replies: repliesMap });
  } catch (error: any) {
    console.error("Error fetching replies:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
