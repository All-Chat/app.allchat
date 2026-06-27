/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

function isValidReply(text: string): boolean {
  if (!text || !text.trim()) return false;
  if (/^\[.*\]$/.test(text.trim())) return false;
  return true;
}

function getDisplayStatus(rawStatus: string, repliesCount: number): string {
  if (repliesCount > 0) return `Replied (${repliesCount})`;
  
  const status = (rawStatus || "").trim().toLowerCase();
  switch (status) {
    case "read": return "Read";
    case "delivered": return "Delivered";
    case "sent": return "Sent";
    case "failed": return "Failed";
    case "invalid": return "Invalid Number";
    case "duplicate": return "Duplicate";
    case "pending":
    case "queued":
    case "": return "Pending";
    default: 
      return rawStatus ? (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)) : "Unknown";
  }
}

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

    // ✅ Do NOT use .lean() here so we can save the replies permanently to the DB
    const campaign: any = await Campaign.findById(campaignId)
      .select("userId name reportData createdAt additionalFields");

    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    const additionalFields: string[] = campaign.additionalFields || [];

    // ─── FETCH REPLIES (Exact same logic as your UI report-replies route) ───
    const campaignPhones = new Set(
      (campaign.reportData || []).map((d: any) => d.phone).filter(Boolean)
    );

    const repliesMap: Record<string, string[]> = {};

    if (campaignPhones.size > 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const campaignCreated = new Date(campaign.createdAt);
      const since = campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

      const messages = await Message.find({
        userId: session.user.id,
        direction: "in",
        createdAt: { $gte: since },
      }).sort({ createdAt: 1 }).lean();

      for (const msg of messages) {
        if (!campaignPhones.has(msg.phone)) continue;

        const cleanText = (msg.text || "").trim();
        if (!isValidReply(cleanText)) continue;

        if (!repliesMap[msg.phone]) repliesMap[msg.phone] = [];
        if (repliesMap[msg.phone].length < 5) {
          repliesMap[msg.phone].push(cleanText);
        }
      }
    }

    let isDbModified = false;

    // ─── Build report rows ─────────────────────────────────────────────
    const reportDataForSheet: any[] = (campaign.reportData || []).map((item: any) => {
      // 1. Check if DB already has native replies
      let replies: string[] = [];
      if (Array.isArray(item.replies) && item.replies.length > 0) {
        replies = item.replies;
      } else if (item.reply) {
        replies = [item.reply];
      } else if (item.phone && repliesMap[item.phone]?.length > 0) {
        replies = repliesMap[item.phone];
        
        // ✅ PERMANENT FIX: Save the fetched replies to the DB so it stops oscillating!
        item.replies = replies;
        isDbModified = true;
      }
      
      const row: any = {
        name: String(item.name || "").trim() || "N/A",
        phone: String(item.phone || "").trim() || "N/A",
        status: getDisplayStatus(String(item.status || ""), replies.length),
        error: String(item.error || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).join(", ") : "",
      };

      additionalFields.forEach((field, idx) => {
        row[field] = item.additionalData?.[idx] || "";
      });

      row["Reply 1"] = replies[0] || "";
      row["Reply 2"] = replies[1] || "";
      row["Reply 3"] = replies[2] || "";
      row["Reply 4"] = replies[3] || "";
      row["Reply 5"] = replies[4] || "";

      return row;
    });

    // ✅ Save to DB if we added replies, so the webhook's "read" status can't override it anymore
    if (isDbModified) {
      campaign.markModified("reportData");
      await campaign.save();
      console.log("[SHEET SYNC] Permanently saved replies to DB to prevent oscillation.");
    }

    if (reportDataForSheet.length === 0) {
      return NextResponse.json({ success: false, message: "No report data to sync" }, { status: 400 });
    }

    await syncCampaignToGoogleSheet(session.user.id, {
      name: campaign.name || `Campaign ${campaign._id}`,
      reportData: reportDataForSheet,
      additionalFields: additionalFields,
    });

    return NextResponse.json({ success: true, message: "Sheet synced successfully" });
  } catch (error: any) {
    console.error("Error syncing sheet:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
