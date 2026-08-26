/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { statsQueue } from "@/lib/queue";
import mongoose from "mongoose";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("id");
    const isDownload = searchParams.get("download") === "true";

    // ==========================================
    // 1. VIEW MODAL & LOAD STATUS BUTTON
    // ==========================================
    const viewId = searchParams.get("viewId");
    if (viewId) {
      statsQueue.add('sync-campaign-stats', { campaignId: viewId }).catch(()=>{});

      const campaign = await Campaign.findOne(
        { _id: new mongoose.Types.ObjectId(viewId), userId: new mongoose.Types.ObjectId(userId) },
        {
          name: 1, templateName: 1, templateCategory: 1, languageCode: 1, scheduledAt: 1,
          variables: 1, mappedVariables: 1, generateOtp: 1, otpLength: 1, mediaUrl: 1, mediaType: 1,
          totalMessages: 1, additionalFields: 1, sheetUrl: 1, standaloneSheetUrl: 1, liveStats: 1,
          status: 1, sentCount: 1, failedCount: 1, currentPrice: 1, pricePerMessage: 1
        }
      ).lean();
      
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });

      // ✅ FIX: Calculate exact stats AND exact net amount (Spend - Refunds) instantly
      const statsAgg = await CampaignReport.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(viewId) } },
        {
          $project: {
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
            },
            chargedAmount: 1
          }
        },
        { 
          $group: { 
            _id: "$effStatus", 
            count: { $sum: 1 },
            totalCharged: { $sum: "$chargedAmount" } 
          } 
        }
      ]);

      const liveStats: any = { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, invalid: 0, pending: 0, duplicate: 0 };
      let actualDocsCount = 0;
      let netDeducted = 0;
      
      statsAgg.forEach(s => {
        const status = s._id || "pending";
        if (liveStats.hasOwnProperty(status)) liveStats[status] = s.count;
        actualDocsCount += s.count;
        netDeducted += s.totalCharged || 0;
      });

      liveStats.total = campaign.totalMessages || actualDocsCount;
      const processed = liveStats.sent + liveStats.delivered + liveStats.read + liveStats.replied + liveStats.failed + liveStats.invalid + liveStats.duplicate;
      liveStats.pending = Math.max(0, liveStats.total - processed);

      return NextResponse.json({ 
        success: true, 
        campaigns: [{ ...campaign, liveStats, totalDeducted: netDeducted }] // ✅ Return exact net amount
      });
    }

    // ==========================================
    // 2. EXCEL EXPORT
    // ==========================================
    const exportId = searchParams.get("exportId");
    if (exportId) {
      const campaign = await Campaign.findOne(
        { _id: new mongoose.Types.ObjectId(exportId), userId: new mongoose.Types.ObjectId(userId) },
        { name: 1, templateName: 1, additionalFields: 1, languageCode: 1 }
      ).lean();
      
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      
      const reports = await CampaignReport.find({ campaignId: campaign._id }).lean();
      const formattedReports = reports.map((r: any) => {
        const isReplied = r.status === "replied" || (r.replies && r.replies.length > 0) || (r.reply && r.reply.trim().length > 0);
        return { ...r, status: isReplied ? "replied" : r.status };
      });

      return NextResponse.json({ success: true, campaigns: [{ ...campaign, reportData: formattedReports }] });
    }

    // ==========================================
    // 3. EDIT PAGE
    // ==========================================
    const editId = searchParams.get("editId");
    if (editId) {
      const campaign = await Campaign.findOne({ _id: new mongoose.Types.ObjectId(editId), userId: new mongoose.Types.ObjectId(userId) }).lean();
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      return NextResponse.json({ success: true, campaigns: [campaign] });
    }

    // ==========================================
    // 4. LIVE CHECK MODE
    // ==========================================
    const checkName = searchParams.get("check");
    if (checkName !== null) {
      const query: any = { userId: new mongoose.Types.ObjectId(userId), name: { $regex: new RegExp(`^${checkName}$`, "i") } };
      if (searchParams.get("excludeId")) query._id = { $ne: searchParams.get("excludeId") };
      return NextResponse.json({ success: true, exists: !!(await Campaign.findOne(query).lean()) });
    }

    // ==========================================
    // 5. REPORT MODE (ULTRA-FAST PAGINATION & FILTERING)
    // ==========================================
    if (campaignId) {
      const limit = 10;
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;

      const showOnly = searchParams.get("showOnly")?.split(",").filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(",").filter(Boolean) || [];
      const search = searchParams.get("search") || "";

      const query: any = { campaignId: new mongoose.Types.ObjectId(campaignId) };
      
      if (search) {
        query.$or = [
          { phone: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } }
        ];
      }

      const repliedCondition = {
        $or: [
          { status: "replied" },
          { "replies.0": { $exists: true } },
          { reply: { $exists: true, $ne: "" } }
        ]
      };

      const notRepliedCondition = {
        $and: [
          { "replies.0": { $exists: false } },
          { $or: [{ reply: { $exists: false } }, { reply: "" }] }
        ]
      };

      const statusQuery: any = {};
      const cleanShowOnly = showOnly.filter(s => s !== "replied");
      const cleanFilterOut = filterOut.filter(s => s !== "replied");

      if (cleanShowOnly.length > 0) statusQuery.$in = cleanShowOnly;
      if (cleanFilterOut.length > 0) statusQuery.$nin = cleanFilterOut;

      const andConditions: any[] = [];

      if (Object.keys(statusQuery).length > 0) {
        if (showOnly.includes("replied")) {
          andConditions.push({ $or: [ { status: statusQuery }, repliedCondition ] });
        } else if (!filterOut.includes("replied")) {
          andConditions.push({ $and: [ { status: statusQuery }, notRepliedCondition ] });
        } else {
          andConditions.push({ status: statusQuery });
        }
      } else if (filterOut.includes("replied")) {
        andConditions.push(notRepliedCondition);
      } else if (showOnly.includes("replied")) {
        andConditions.push(repliedCondition);
      }

      if (andConditions.length > 0) {
        query.$and = andConditions;
      }

      const [reports, totalFiltered] = await Promise.all([
        CampaignReport.find(query).skip(skip).limit(isDownload ? 100000 : limit).lean(),
        CampaignReport.countDocuments(query)
      ]);

      const campaign = await Campaign.findById(campaignId).select("name templateName additionalFields languageCode totalDeducted totalMessages").lean();
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });

      const formattedReports = reports.map((r: any) => {
        const isReplied = r.status === "replied" || (r.replies && r.replies.length > 0) || (r.reply && r.reply.trim().length > 0);
        return { ...r, status: isReplied ? "replied" : r.status };
      });

      const statsAgg = await CampaignReport.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
        {
          $project: {
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
        { $group: { _id: "$effStatus", count: { $sum: 1 } } }
      ]);

      const liveStats: any = { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, invalid: 0, pending: 0, duplicate: 0 };
      let actualDocsCount = 0;
      statsAgg.forEach(s => {
        const status = s._id || "pending";
        if (liveStats.hasOwnProperty(status)) liveStats[status] = s.count;
        actualDocsCount += s.count;
      });

      liveStats.total = campaign.totalMessages || actualDocsCount;
      const processed = liveStats.sent + liveStats.delivered + liveStats.read + liveStats.replied + liveStats.failed + liveStats.invalid + liveStats.duplicate;
      liveStats.pending = Math.max(0, liveStats.total - processed);

      return NextResponse.json({
        success: true,
        campaigns: [{
          ...campaign,
          reportData: formattedReports,
          campaignStats: liveStats
        }],
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalFiltered / limit)),
        campaignStats: liveStats
      });
    }

    // ==========================================
    // 6. PAGINATED LIST MODE
    // ==========================================
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [campaigns, totalCampaigns] = await Promise.all([
      Campaign.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Campaign.countDocuments({ userId: new mongoose.Types.ObjectId(userId) }),
    ]);

    return NextResponse.json({
      success: true,
      campaigns: campaigns.map((c: any) => ({ ...c, languageCode: c.languageCode || "en", totalDeducted: c.totalDeducted || 0 })),
      totalCampaigns,
      hasMore: skip + campaigns.length < totalCampaigns,
    });
  } catch (error: any) {
    console.error("List API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
