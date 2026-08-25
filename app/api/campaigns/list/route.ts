/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

function normalizePhoneExpr(phoneFieldExpr: any) {
  return {
    $let: {
      vars: {
        digitsArr: {
          $map: {
            input: { $regexFindAll: { input: { $toString: { $ifNull: [phoneFieldExpr, ""] } }, regex: "\\d" } },
            as: "m",
            in: "$$m.match",
          },
        },
      },
      in: {
        $let: {
          vars: {
            digitsStr: {
              $reduce: {
                input: "$$digitsArr",
                initialValue: "",
                in: { $concat: ["$$value", "$$this"] },
              },
            },
          },
          in: {
            $substrCP: [
              "$$digitsStr",
              { $max: [0, { $subtract: [{ $strLenCP: "$$digitsStr" }, 10] }] },
              10,
            ],
          },
        },
      },
    },
  };
}

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
    const isDownload = searchParams.get("download") === "true"; 

    // ==========================================
    // ✅ 1. FAST VIEW MODAL & STATS REFRESH
    // ==========================================
    const viewId = searchParams.get("viewId");
    if (viewId) {
      const fetchStats = searchParams.get("stats") === "true";
      
      const projection: any = {
        name: 1,
        templateName: 1,
        templateCategory: 1,
        languageCode: 1,
        scheduledAt: 1,
        variables: 1,
        mappedVariables: { $slice: 1 }, 
        generateOtp: 1,
        otpLength: 1,
        mediaUrl: 1,
        mediaType: 1,
        totalMessages: 1,
        additionalFields: 1,
        sheetUrl: 1, 
        standaloneSheetUrl: 1,
        status: 1,
      };

      if (fetchStats) {
        projection.liveStats = 1;
        projection.totalDeducted = 1;
        projection.currentPrice = 1;
        projection.pricePerMessage = 1;
      }

      const campaign = await Campaign.findOne(
        { 
          _id: new mongoose.Types.ObjectId(viewId), 
          userId: new mongoose.Types.ObjectId(userId) 
        },
        projection
      ).lean();
      
      if (!campaign) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, campaigns: [campaign] });
    }

    // ==========================================
    // ✅ 2. EXCEL EXPORT (Loads ALL numbers)
    // ==========================================
    const exportId = searchParams.get("exportId");
    if (exportId) {
      const campaign = await Campaign.findOne(
        { 
          _id: new mongoose.Types.ObjectId(exportId), 
          userId: new mongoose.Types.ObjectId(userId) 
        },
        {
          name: 1,
          templateName: 1,
          phoneNumbers: 1, 
          names: 1, 
          additionalFields: 1,
          additionalFieldsData: 1, 
          reportData: 1, 
          sheetUrl: 1, 
          standaloneSheetUrl: 1, 
        }
      ).lean();
      
      if (!campaign) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, campaigns: [campaign] });
    }

    // ==========================================
    // 3. EDIT PAGE (Loads ALL data)
    // ==========================================
    const editId = searchParams.get("editId");
    if (editId) {
      const campaign = await Campaign.findOne({ 
        _id: new mongoose.Types.ObjectId(editId), 
        userId: new mongoose.Types.ObjectId(userId) 
      }).lean();
      
      if (!campaign) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, campaigns: [campaign] });
    }

    // ==========================================
    // 4. LIVE CHECK MODE
    // ==========================================
    if (checkName !== null) {
      const query: any = {
        userId: new mongoose.Types.ObjectId(userId),
        name: { $regex: new RegExp(`^${checkName}$`, "i") },
      };
      if (excludeId) query._id = { $ne: excludeId };
      const existing = await Campaign.findOne(query).lean();
      return NextResponse.json({ success: true, exists: !!existing });
    }

    // ==========================================
    // 5. SINGLE CAMPAIGN REPORT MODE
    // ==========================================
    if (campaignId) {
      const limit = 25;
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;

      const showOnly = searchParams.get("showOnly")?.split(",").filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(",").filter(Boolean) || [];
      const search = searchParams.get("search") || "";
      
      // ✅ FIX: Check if filters are applied
      const hasFilters = showOnly.length > 0 || filterOut.length > 0 || search.length > 0;

      let pipeline: any[];

      if (hasFilters) {
        // ✅ SLOW PATH: Filters applied, must use $filter
        const isRepliedExpr = {
          $or: [
            { $ne: [{ $ifNull: ["$$r.reply", ""] }, ""] },
            { $gt: [ { $size: { $ifNull: ["$$r.replies", []] } }, 0 ] }
          ]
        };
        const baseStatusExpr = {
          $switch: {
            branches: [
              { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, then: "read" },
              { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }, then: "delivered" },
              { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, then: "sent" },
              { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }, then: "failed" },
              { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }, then: "invalid" },
              { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }, then: "duplicate" },
            ],
            default: "pending"
          }
        };
        const effectiveStatusExpr = {
          $cond: { if: isRepliedExpr, then: "replied", else: baseStatusExpr }
        };

        const andConditions: any[] = [];
        if (search) {
          andConditions.push({
            $or: [
              { $regexMatch: { input: { $toString: { $ifNull: ["$$r.phone", ""] } }, regex: search, options: "i" } },
              { $regexMatch: { input: { $ifNull: ["$$r.name", ""] }, regex: search, options: "i" } },
            ],
          });
        }
        if (showOnly.length > 0) andConditions.push({ $in: [effectiveStatusExpr, showOnly] });
        if (filterOut.length > 0) andConditions.push({ $not: [{ $in: [effectiveStatusExpr, filterOut] }] });
        const finalFilterCond = andConditions.length > 0 ? { $and: andConditions } : true;

        pipeline = [
          { $match: { _id: new mongoose.Types.ObjectId(campaignId), userId: new mongoose.Types.ObjectId(userId) } },
          {
            $addFields: {
              filteredData: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: finalFilterCond } },
            }
          },
          {
            $project: {
              name: 1, templateName: 1, additionalFields: 1, languageCode: 1, totalDeducted: 1,
              totalFiltered: { $size: "$filteredData" },
              reportData: { $slice: ["$filteredData", skip, limit] },
            }
          }
        ];
      } else {
        // ✅ FAST PATH: No filters, use $slice directly. 100x faster!
        pipeline = [
          { $match: { _id: new mongoose.Types.ObjectId(campaignId), userId: new mongoose.Types.ObjectId(userId) } },
          {
            $project: {
              name: 1, templateName: 1, additionalFields: 1, languageCode: 1, totalDeducted: 1,
              totalFiltered: { $size: { $ifNull: ["$reportData", []] } },
              reportData: { $slice: [ { $ifNull: ["$reportData", []] }, skip, limit ] }
            }
          }
        ];
      }

      const result = await Campaign.aggregate(pipeline);

      if (!result || result.length === 0) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }

      const campaign = result[0];
      const totalPages = Math.max(1, Math.ceil(campaign.totalFiltered / limit));

      return NextResponse.json({
        success: true,
        campaigns: [
          {
            ...campaign,
            languageCode: campaign.languageCode || "en",
            totalDeducted: campaign.totalDeducted || 0,
          },
        ],
        currentPage: page,
        totalPages: totalPages,
        // ✅ FIX: Return empty object for campaignStats. The frontend will automatically fallback to liveStats which are already loaded in the sidebar!
        campaignStats: {}, 
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
        .select("-reportData -phoneNumbers -names -additionalFieldsData") 
        .lean(),
      Campaign.countDocuments({ userId: new mongoose.Types.ObjectId(userId) }),
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
      hasMore: skip + campaigns.length < totalCampaigns,
    });
  } catch (error: any) {
    console.error("List API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
