/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    // ═══════════════════════════════════════════════════════════════
    // 1. DEEP CLONE reportData into a clean plain JS object
    // (This prevents Mongoose document properties from breaking the sheet sync)
    // ═══════════════════════════════════════════════════════════════
    const reportDataForSheet: any[] = JSON.parse(JSON.stringify(campaign.reportData || []));

    // ═══════════════════════════════════════════════════════════════
    // 2. FETCH LIVE REPLIES FROM MESSAGES COLLECTION
    // ═══════════════════════════════════════════════════════════════
    const campaignPhones = new Set(
      reportDataForSheet.map((d: any) => d.phone).filter(Boolean)
    );

    if (campaignPhones.size > 0) {
      const since = campaign.createdAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const messages = await Message.find({
        userId: session.user.id,
        direction: "in",
        createdAt: { $gte: since },
      })
        .sort({ createdAt: 1 })
        .select("phone text")
        .lean();

      // Group replies by phone number (only for phones in this campaign)
      const repliesMap: Record<string, string[]> = {};
      for (const msg of messages) {
        if (campaignPhones.has(msg.phone) && msg.text) {
          if (!repliesMap[msg.phone]) repliesMap[msg.phone] = [];
          repliesMap[msg.phone].push(msg.text);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 3. INJECT LIVE REPLIES INTO THE CLEAN REPORT DATA
      // ═══════════════════════════════════════════════════════════════
      for (const item of reportDataForSheet) {
        if (item.phone && repliesMap[item.phone]) {
          const liveReplies = repliesMap[item.phone];
          item.replies = liveReplies;
          item.reply = liveReplies[liveReplies.length - 1] || null;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 4. SYNC TO GOOGLE SHEET
    // ═══════════════════════════════════════════════════════════════
    await syncCampaignToGoogleSheet(session.user.id, { 
      name: campaign.name, 
      reportData: reportDataForSheet 
    });

    return NextResponse.json({ success: true, message: "Sheet synced successfully" });
  } catch (error: any) {
    console.error("Error syncing sheet:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
