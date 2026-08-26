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
      try {
        const job = await statsQueue.add('sync-campaign-stats', { campaignId: viewId });
        await Promise.race([
          job.waitUntilFinished(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
        ]);
      } catch (err) {}

      const campaign = await Campaign.findOne(
        { _id: new mongoose.Types.ObjectId(viewId), userId: new mongoose.Types.ObjectId(userId) },
        {
          name: 1, templateName: 1, templateCategory: 1, languageCode: 1, scheduledAt: 1,
          variables: 1, mappedVariables: 1, generateOtp: 1, otpLength: 1, mediaUrl: 1, mediaType: 1,
          totalMessages: 1, additionalFields: 1, sheetUrl: 1, standaloneSheetUrl: 1, liveStats: 1,
          status: 1, totalDeducted: 1, sentCount: 1, failedCount: 1, currentPrice: 1, pricePerMessage: 1,
          phoneNumbers: { $slice: 15 }, names: { $slice: 15 }, additionalFieldsData: { $slice: 15 }
        }
      ).lean();
      
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      return NextResponse.json({ success: true, campaigns: [campaign] });
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
      return NextResponse.json({ success: true, campaigns: [{ ...campaign, reportData: reports }] });
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
      const limit = 10; // 10 contacts per page
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;

      const showOnly = searchParams.get("showOnly")?.split(",").filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(",").filter(Boolean) || [];
      const search = searchParams.get("search") || "";

      // Build the database query
      const query: any = { campaignId: new mongoose.Types.ObjectId(campaignId) };
      
      if (search) {
        query.$or = [
          { phone: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } }
        ];
      }

      // ✅ FIX: Properly combine $in and $nin without overwriting each other
      const statusQuery: any = {};
      if (showOnly.length > 0) statusQuery.$in = showOnly;
      if (filterOut.length > 0) statusQuery.$nin = filterOut;
      if (Object.keys(statusQuery).length > 0) query.status = statusQuery;

      // Fetch paginated reports and total count in parallel
      const [reports, totalFiltered] = await Promise.all([
        CampaignReport.find(query).skip(skip).limit(isDownload ? 100000 : limit).lean(),
        CampaignReport.countDocuments(query)
      ]);

      const campaign = await Campaign.findById(campaignId).select("name templateName additionalFields languageCode totalDeducted totalMessages").lean();
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });

      // ✅ FIX: Calculate exact stats dynamically for this specific campaign
      const statsAgg = await CampaignReport.aggregate([
        { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);

      const liveStats: any = { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, invalid: 0, pending: 0, duplicate: 0 };
      let actualDocsCount = 0;
      statsAgg.forEach(s => {
        const status = (s._id || "pending").toLowerCase();
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
          reportData: reports,
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
