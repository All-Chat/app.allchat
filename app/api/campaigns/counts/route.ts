/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    const campaigns = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          name: 1, templateName: 1, templateCategory: 1, languageCode: 1, status: 1,
          totalMessages: 1, totalDeducted: 1, scheduledAt: 1, createdAt: 1,
          sheetUrl: 1, standaloneSheetUrl: 1
        }
      }
    ]);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ success: true, campaigns: [], page, limit });
    }

    const campaignIds = campaigns.map(c => new mongoose.Types.ObjectId(c._id));
    
    // ✅ FIX: Use the EXACT SAME $project logic to guarantee sidebar stats match the table
    const statsAgg = await CampaignReport.aggregate([
      { $match: { campaignId: { $in: campaignIds } } },
      {
        $project: {
          campaignId: "$campaignId",
          effStatus: {
            $cond: {
              if: {
                $or: [
                  { $eq: [{ $toLower: { $ifNull: ["$status", ""] } }, "replied"] },
                  { $gt: [ { $size: { $ifNull: ["$replies", []] } }, 0 ] },
                  { $gt: [ { $strLenCP: { $ifNull: ["$reply", ""] } }, 0 ] }
                ]
              },
              then: "replied",
              else: { $toLower: { $ifNull: ["$status", "pending"] } }
            }
          }
        }
      },
      { $group: { _id: { campaignId: "$campaignId", status: "$effStatus" }, count: { $sum: 1 } } }
    ]);

    const statsMap: Record<string, any> = {};
    statsAgg.forEach((item: any) => {
      const cid = item._id.campaignId.toString();
      const status = (item._id.status || "pending").toLowerCase();
      if (!statsMap[cid]) statsMap[cid] = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, invalid: 0, duplicate: 0, docCount: 0 };
      if (statsMap[cid].hasOwnProperty(status)) statsMap[cid][status] += item.count;
      statsMap[cid].docCount += item.count;
    });

    const fixedCampaigns = campaigns.map((c: any) => {
      const stats = statsMap[c._id.toString()] || {};
      const docCount = stats.docCount || 0;
      const total = c.totalMessages || docCount || 0;

      const sent = stats.sent || 0;
      const delivered = stats.delivered || 0;
      const read = stats.read || 0;
      const replied = stats.replied || 0;
      const failed = stats.failed || 0;
      const invalid = stats.invalid || 0;
      const duplicate = stats.duplicate || 0;

      const processed = sent + delivered + read + replied + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);

      return {
        ...c,
        liveStats: { total, sent, delivered, read, replied, failed, invalid, duplicate, pending },
        languageCode: c.languageCode || "en",
        totalDeducted: c.totalDeducted || 0,
      };
    });

    return NextResponse.json({ success: true, campaigns: fixedCampaigns, page, limit });
  } catch (error: any) {
    console.error("❌ Counts API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
