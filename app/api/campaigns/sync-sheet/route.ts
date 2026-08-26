/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

function formatSheetDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
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
    case "pending": case "queued": case "": return "Pending";
    default: return rawStatus ? (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)) : "Unknown";
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== session.user.id) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });

    const additionalFields: string[] = campaign.additionalFields || [];

    // ✅ FIX: Fetch directly from CampaignReport collection
    const reports = await CampaignReport.find({ campaignId }).lean();

    const reportDataForSheet: any[] = reports.map((item: any) => {
      const replies: string[] = item.replies || (item.reply ? [item.reply] : []);
      
      const row: any = {
        name: String(item.name || "").trim() || "N/A",
        phone: String(item.phone || "").trim() || "N/A",
        status: getDisplayStatus(String(item.status || ""), replies.length),
        error: String(item.error || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).join(", ") : "",
        deliveredTime: formatSheetDate(item.deliveredAt),
        readTime: formatSheetDate(item.readAt),
        repliedTime: formatSheetDate(item.repliedAt),
      };

      additionalFields.forEach((field, idx) => row[field] = item.additionalData?.[idx] || "");

      for (let i = 1; i <= 5; i++) {
        const replyText = replies[i - 1] || "";
        row[`Reply ${i}`] = replyText;
        if (replyText) row[`Reply ${i} Time`] = formatSheetDate(item.replyTimes?.[i - 1] || item.repliedAt);
        else row[`Reply ${i} Time`] = "";
      }
      return row;
    });

    if (reportDataForSheet.length === 0) return NextResponse.json({ success: false, message: "No report data to sync" }, { status: 400 });

    try {
      const sheetUrl = await syncCampaignToGoogleSheet(session.user.id, {
        name: campaign.name || `Campaign ${campaign._id}`,
        reportData: reportDataForSheet,
        additionalFields: additionalFields,
      });

      campaign.sheetUrl = sheetUrl;
      campaign.markModified('sheetUrl');
      await campaign.save();

      return NextResponse.json({ success: true, message: "Sheet synced successfully", url: sheetUrl });
    } catch (sheetErr: any) {
      console.error("❌ Google Sheet API Error Details:", sheetErr);
      return NextResponse.json({ success: false, message: `Google Sync Failed: ${sheetErr.message}` }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error syncing sheet:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
