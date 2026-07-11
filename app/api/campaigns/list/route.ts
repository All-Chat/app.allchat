/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message"; // ✅ Import Message model to fetch replies
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const checkName = searchParams.get("check");
    const excludeId = searchParams.get("excludeId"); 
    const campaignId = searchParams.get("id"); 

    // ==========================================
    // ✅ 1. LIVE CHECK MODE
    // ==========================================
    if (checkName !== null) {
      const query: any = { userId, name: { $regex: new RegExp(`^${checkName}$`, 'i') } };
      if (excludeId) query._id = { $ne: excludeId };
      
      const existing = await Campaign.findOne(query).lean();
      return NextResponse.json({ success: true, exists: !!existing });
    }

    // ==========================================
    // ✅ 2. SINGLE CAMPAIGN MODE (Reliable JS Filtering + 50 Item Pagination)
    // ==========================================
    if (campaignId) {
      const limit = 50; // ✅ HARD LIMIT TO 50 ITEMS
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;
      
      // Get filter parameters from frontend
      const showOnly = searchParams.get("showOnly")?.split(',').filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(',').filter(Boolean) || [];
      const search = searchParams.get("search") || "";

      const campaign = await Campaign.findOne({ _id: campaignId, userId }).lean();
      
      if (!campaign) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }

      // ✅ FIX: Fetch all inbound replies for this user to build a replies map
      // This is required because replies are stored in the Message collection, not inside the Campaign.
      const inboundMessages = await Message.find({
        userId,
        direction: "in",
        createdAt: { $gte: campaign.createdAt }
      }).lean();

      const repliedPhones = new Set<string>();
      inboundMessages.forEach(msg => {
        const p10 = normalizePhone(msg.phone).slice(-10);
        if (p10.length >= 7) repliedPhones.add(p10);
      });

      // ✅ Helper function to accurately determine status (matches frontend exactly)
      const getStatus = (d: any) => {
        let status = d.status || "pending";
        if (["", "queued", "pending"].includes(status)) status = "pending";
        
        // Check if replied using the fetched messages map
        let hasReplies = false;
        if (d.replies && d.replies.length > 0) hasReplies = true;
        if (d.reply && d.reply.length > 0) hasReplies = true;
        
        if (!hasReplies && d.phone) {
          const p10 = normalizePhone(d.phone).slice(-10);
          if (repliedPhones.has(p10)) hasReplies = true;
        }

        if (hasReplies) status = "replied";
        return status;
      };

      const fullReportData = campaign.reportData || [];

      // ✅ Calculate total stats for the WHOLE campaign (for the Brief Modal)
      const total = fullReportData.length;
      let replied = 0, read = 0, delivered = 0, sent = 0, failed = 0, invalid = 0, pending = 0, duplicate = 0;
      
      fullReportData.forEach((d: any) => {
        const status = getStatus(d);
        if (status === "replied") replied++;
        else if (status === "read") read++;
        else if (status === "delivered") delivered++;
        else if (status === "sent") sent++;
        else if (status === "failed") failed++;
        else if (status === "invalid") invalid++;
        else if (status === "duplicate") duplicate++;
        else pending++;
      });

      const campaignStats = { total, replied, read, delivered, sent, failed, invalid, pending, duplicate };

      // ✅ Apply standard JavaScript filtering
      const filteredData = fullReportData;
      if (showOnly.length > 0 || filterOut.length > 0 || search) {
        const filteredData = fullReportData.filter(function (d: { phone: any; name: any; }) {
            const status = getStatus(d);

            if (showOnly.length > 0 && !showOnly.includes(status)) return false;
            if (filterOut.length > 0 && filterOut.includes(status)) return false;

            if (search) {
              const s = search.toLowerCase();
              const phone = (d.phone || "").toString();
              const name = (d.name || "").toLowerCase();
              if (!phone.includes(s) && !name.includes(s)) return false;
            }
            return true;
          });
      }

      // ✅ Slice the filtered array to exactly 50 items
      const slicedData = filteredData.slice(skip, skip + limit);
      const totalPages = Math.max(1, Math.ceil(filteredData.length / limit));

      return NextResponse.json({ 
        success: true, 
        campaigns: [{ 
          ...campaign, 
          reportData: slicedData, // Only 50 items sent to frontend
          languageCode: campaign.languageCode || "en", 
          totalDeducted: campaign.totalDeducted || 0 
        }],
        currentPage: page,
        totalPages: totalPages,
        campaignStats: campaignStats // ✅ Send true total stats to frontend
      });
    }

    // ==========================================
    // ✅ 3. PAGINATED LIST MODE (Fast & Lightweight)
    // ==========================================
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [campaigns, totalCampaigns] = await Promise.all([
      Campaign.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-reportData") // Excludes massive arrays for list view
        .lean(),
      Campaign.countDocuments({ userId })
    ]);

    const fixedCampaigns = campaigns.map((c: any) => ({
      ...c,
      languageCode: c.languageCode || "en",
      totalDeducted: c.totalDeducted || 0,
    }));

    return NextResponse.json({ 
      success: true, 
      campaigns: fixedCampaigns,
      totalCampaigns,
      hasMore: skip + campaigns.length < totalCampaigns
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
