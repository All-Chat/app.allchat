/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isValidReply(msg: any): boolean {
  const text = (msg.text || "").trim();
  if (msg.messageType && ["image", "video", "audio", "document", "sticker", "location", "contacts", "interactive", "button"].includes(msg.messageType)) {
    return true;
  }
  if (!text) return false;
  if (/^\[.*\]$/.test(text)) return false;
  return true;
}

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });

    const campaign = await Campaign.findById(campaignId).select("userId reportData createdAt").lean();
    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    const campaignPhonesList = (campaign.reportData || [])
      .map((d: any) => normalizePhone(d.phone).slice(-10))
      .filter((p: string | any[]) => p.length >= 7);

    if (campaignPhonesList.length === 0) return NextResponse.json({ success: true, replies: {} });

    // 🚀 PERFORMANCE FIX: Use a Set for O(1) lookups instead of Array.includes
    const campaignPhonesSet = new Set(campaignPhonesList);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const campaignCreated = new Date(campaign.createdAt);
    const since = campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

    const messages = await Message.find({
      userId: session.user.id,
      direction: "in",
      createdAt: { $gte: since },
    }).sort({ createdAt: 1 }).lean();

    const tempRepliesMap: Record<string, string[]> = {};

    for (const msg of messages) {
      const msgPhoneLast10 = normalizePhone(msg.phone).slice(-10);
      if (msgPhoneLast10 && campaignPhonesSet.has(msgPhoneLast10)) { // Instant check
        if (!isValidReply(msg)) continue;

        if (!tempRepliesMap[msgPhoneLast10]) tempRepliesMap[msgPhoneLast10] = [];
        
        if (tempRepliesMap[msgPhoneLast10].length < 5) {
          let displayText = (msg.text || "").trim();
          if (!displayText && msg.messageType && msg.messageType !== "text") {
            displayText = `[${msg.messageType}]`;
          }
          tempRepliesMap[msgPhoneLast10].push(displayText);
        }
      }
    }

    const repliesMap: Record<string, string[]> = {};
    for (const item of campaign.reportData || []) {
      const p10 = normalizePhone(item.phone).slice(-10);
      if (tempRepliesMap[p10] && tempRepliesMap[p10].length > 0) {
        repliesMap[item.phone] = tempRepliesMap[p10];
      }
    }

    return NextResponse.json({ success: true, replies: repliesMap });
  } catch (error: any) {
    console.error("Error fetching replies:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
