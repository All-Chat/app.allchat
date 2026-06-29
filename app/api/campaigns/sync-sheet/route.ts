/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

// ✅ Same exact media-supported junk filter used in the UI
function isValidReply(msg: any): boolean {
  const text = (msg.text || "").trim();
  if (msg.messageType && ["image", "video", "audio", "document", "sticker", "location", "contacts", "interactive", "button"].includes(msg.messageType)) {
    return true;
  }
  if (!text) return false;
  if (/^\[.*\]$/.test(text)) return false;
  return true;
}

// ✅ Helper to format status EXACTLY like the frontend UI
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

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

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

    const campaign = await Campaign.findById(campaignId)
      .select("userId name reportData createdAt additionalFields")
      .lean();

    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    const additionalFields: string[] = campaign.additionalFields || [];

    // ─── 1. FETCH REPLIES (Exact same logic as UI report-replies route) ───
    const campaignPhonesList = (campaign.reportData || [])
      .map((item: any) => normalizePhone(item.phone).slice(-10))
      .filter((p: string) => p.length >= 7);

    const tempRepliesMap: Record<string, string[]> = {};

    if (campaignPhonesList.length > 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const campaignCreated = new Date(campaign.createdAt);
      const since = campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

      const messages = await Message.find({
        userId: session.user.id,
        direction: "in",
        createdAt: { $gte: since },
      }).sort({ createdAt: 1 }).lean();

      for (const msg of messages) {
        const msgPhoneLast10 = normalizePhone(msg.phone).slice(-10);
        if (msgPhoneLast10 && campaignPhonesList.includes(msgPhoneLast10)) {
          if (!isValidReply(msg)) continue;
          
          if (!tempRepliesMap[msgPhoneLast10]) tempRepliesMap[msgPhoneLast10] = [];
          
          // ✅ Allow up to 5 replies max
          if (tempRepliesMap[msgPhoneLast10].length < 5) {
            let displayText = (msg.text || "").trim();
            if (!displayText && msg.messageType && msg.messageType !== "text") {
              displayText = `[${msg.messageType}]`;
            }
            tempRepliesMap[msgPhoneLast10].push(displayText);
          }
        }
      }
    }

    // Re-map back to the exact phone formats stored in the campaign (just like the UI API does)
    const repliesMap: Record<string, string[]> = {};
    for (const item of campaign.reportData || []) {
      const p10 = normalizePhone(item.phone).slice(-10);
      if (tempRepliesMap[p10] && tempRepliesMap[p10].length > 0) {
        repliesMap[item.phone] = tempRepliesMap[p10];
      }
    }

    // ─── 2. BUILD REPORT ROWS (Exact same logic as UI getRepliesList) ───
    const reportDataForSheet: any[] = (campaign.reportData || []).map((item: any) => {
      let replies: string[] = [];
      
      // 1. Always check the live fetched replies map FIRST
      if (item.phone && repliesMap[item.phone]?.length > 0) {
        replies = repliesMap[item.phone];
      } 
      // 2. Fallback to DB cached replies ONLY if the map didn't find anything
      else if (Array.isArray(item.replies) && item.replies.length > 0) {
        replies = item.replies;
      } else if (item.reply) {
        replies = [item.reply];
      }
      
      const row: any = {
        name: String(item.name || "").trim() || "N/A",
        phone: String(item.phone || "").trim() || "N/A",
        status: getDisplayStatus(String(item.status || ""), replies.length), // ✅ Will say "Replied (5)" if 5 replies exist
        error: String(item.error || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).join(", ") : "",
      };

      additionalFields.forEach((field, idx) => {
        row[field] = item.additionalData?.[idx] || "";
      });

      // ✅ Populate up to 5 Replies
      row["Reply 1"] = replies[0] || "";
      row["Reply 2"] = replies[1] || "";
      row["Reply 3"] = replies[2] || "";
      row["Reply 4"] = replies[3] || "";
      row["Reply 5"] = replies[4] || "";

      return row;
    });

    if (reportDataForSheet.length === 0) {
      return NextResponse.json({ success: false, message: "No report data to sync" }, { status: 400 });
    }

    // ─── 3. Sync to Google Sheet ───────────────────────────────────────────────
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
