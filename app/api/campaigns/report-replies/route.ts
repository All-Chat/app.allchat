/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ✅ Strips junk values that got saved before the webhook fix.
//    "[button]", "[interactive]", "[sticker]" etc. are NOT real replies.
function isValidReply(text: string): boolean {
  if (!text || !text.trim()) return false;
  // Reject anything that looks like our old "[type]" fallback strings
  if (/^\[.*\]$/.test(text.trim())) return false;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) {
      return NextResponse.json(
        { success: false, message: "Campaign ID required" },
        { status: 400 }
      );
    }

    const campaign = await Campaign.findById(campaignId)
      .select("userId reportData createdAt")
      .lean();

    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json(
        { success: false, message: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaignPhones = new Set(
      (campaign.reportData || []).map((d: any) => d.phone).filter(Boolean)
    );
    if (campaignPhones.size === 0) {
      return NextResponse.json({ success: true, replies: {} });
    }

    // Look back max 24 hours from when campaign started
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const campaignCreated = new Date(campaign.createdAt);
    const since =
      campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

    const messages = await Message.find({
      userId: session.user.id,
      direction: "in",
      createdAt: { $gte: since },
    })
      .sort({ createdAt: 1 })
      .lean();

    const repliesMap: Record<string, string[]> = {};

    for (const msg of messages) {
      if (!campaignPhones.has(msg.phone)) continue;

      // ✅ FIX: Use isValidReply to skip "[button]" and other junk saved before
      //    the webhook was fixed. After the webhook fix, button replies are saved
      //    correctly as plain text (e.g. "Interested") so they pass this check.
      const cleanText = (msg.text || "").trim();
      if (!isValidReply(cleanText)) continue;

      if (!repliesMap[msg.phone]) repliesMap[msg.phone] = [];
      if (repliesMap[msg.phone].length < 5) {
        repliesMap[msg.phone].push(cleanText);
      }
    }

    return NextResponse.json({ success: true, replies: repliesMap });
  } catch (error: any) {
    console.error("Error fetching replies:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
