/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

// Same junk filter used in the replies route
function isValidReply(text: string): boolean {
  if (!text || !text.trim()) return false;
  if (/^\[.*\]$/.test(text.trim())) return false;
  return true;
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

    // ✅ FIX: Added additionalFields to .select()
    const campaign = await Campaign.findById(campaignId)
      .select("userId name reportData createdAt additionalFields")
      .lean();

    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    const additionalFields: string[] = campaign.additionalFields || [];

    // ─── Build base report rows ─────────────────────────────────────────────
    const reportDataForSheet: any[] = (campaign.reportData || []).map((item: any) => {
      const row: any = {
        name: String(item.name || "").trim() || "N/A",
        phone: String(item.phone || "").trim() || "N/A",
        status: String(item.status || "Unknown").trim(),
        error: String(item.error || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).join(", ") : "",
      };

      // ✅ NEW: Dynamically add additional fields columns
      additionalFields.forEach((field, idx) => {
        row[field] = item.additionalData?.[idx] || "";
      });

      // ✅ These keys match exactly what syncCampaignToGoogleSheet now reads
      row["Reply 1"] = "";
      row["Reply 2"] = "";
      row["Reply 3"] = "";
      row["Reply 4"] = "";
      row["Reply 5"] = "";

      return row;
    });

    if (reportDataForSheet.length === 0) {
      return NextResponse.json({ success: false, message: "No report data to sync" }, { status: 400 });
    }

    // ─── Fetch replies and merge ────────────────────────────────────────────
    const campaignPhones = new Set(
      reportDataForSheet.map((d) => d.phone).filter((p) => p && p !== "N/A")
    );

    if (campaignPhones.size > 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const campaignCreated = new Date(campaign.createdAt);
      const since = campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

      const messages = await Message.find({
        userId: session.user.id,
        direction: "in",
        createdAt: { $gte: since },
      }).sort({ createdAt: 1 }).lean();

      // Build replies map: phone → up to 5 valid reply strings
      const repliesMap: Record<string, string[]> = {};
      for (const msg of messages) {
        if (!campaignPhones.has(msg.phone)) continue;
        // ✅ Filter out old [button] / [interactive] junk saved before webhook fix
        const cleanText = (msg.text || "").trim();
        if (!isValidReply(cleanText)) continue;
        if (!repliesMap[msg.phone]) repliesMap[msg.phone] = [];
        if (repliesMap[msg.phone].length < 5) {
          repliesMap[msg.phone].push(cleanText);
        }
      }

      // Merge into report rows
      for (const item of reportDataForSheet) {
        const replies = repliesMap[item.phone];
        if (replies && replies.length > 0) {
          item["Reply 1"] = replies[0] || "";
          item["Reply 2"] = replies[1] || "";
          item["Reply 3"] = replies[2] || "";
          item["Reply 4"] = replies[3] || "";
          item["Reply 5"] = replies[4] || "";
        }
      }
    }

    // ─── Sync to Google Sheet ───────────────────────────────────────────────
    // ✅ FIX: Pass additionalFields to the sync function
    await syncCampaignToGoogleSheet(session.user.id, {
      name: campaign.name || `Campaign ${campaign._id}`,
      reportData: reportDataForSheet,
      additionalFields: additionalFields, // Pass the array of column names here
    });

    return NextResponse.json({ success: true, message: "Sheet synced successfully" });
  } catch (error: any) {
    console.error("Error syncing sheet:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
