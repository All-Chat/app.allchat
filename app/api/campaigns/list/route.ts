/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

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
      const query: any = { userId: new mongoose.Types.ObjectId(userId), name: { $regex: new RegExp(`^${checkName}$`, 'i') } };
      if (excludeId) query._id = { $ne: excludeId };
      
      const existing = await Campaign.findOne(query).lean();
      return NextResponse.json({ success: true, exists: !!existing });
    }

    // ==========================================
    // ✅ 2. SINGLE CAMPAIGN MODE (Pure DB Filtering & 50 Item Limit)
    // ==========================================
    if (campaignId) {
      const limit = 50;
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;
      
      const showOnly = searchParams.get("showOnly")?.split(',').filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(',').filter(Boolean) || [];
      const search = searchParams.get("search") || "";

      // Build the filter condition dynamically in JS
      const andConditions: any[] = [];

      if (search) {
        andConditions.push({
          $or: [
            { $regexMatch: { input: { $toString: { $ifNull: ["$$r.phone", ""] } }, regex: search, options: "i" } },
            { $regexMatch: { input: { $ifNull: ["$$r.name", ""] }, regex: search, options: "i" } }
          ]
        });
      }
      if (showOnly.length > 0) {
        andConditions.push({ $in: ["$$r._effStatus", showOnly] });
      }
      if (filterOut.length > 0) {
        andConditions.push({ $not: [{ $in: ["$$r._effStatus", filterOut] }] });
      }

      const finalFilterCond = andConditions.length > 0 ? { $and: andConditions } : {};

      const pipeline: any[] = [
        { 
          $match: { 
            _id: new mongoose.Types.ObjectId(campaignId), 
            userId: new mongoose.Types.ObjectId(userId) 
          } 
        },
        // ✅ Fetch inbound messages to accurately determine "replied" status
        {
          $lookup: {
            from: "messages",
            let: { camp_createdAt: "$createdAt", user_id: "$userId" },
            pipeline: [
              { 
                $match: { 
                  $expr: { 
                    $and: [ 
                      { $eq: [{ $toString: "$userId" }, { $toString: "$$user_id" }] }, 
                      { $eq: ["$direction", "in"] }, 
                      { $gte: ["$createdAt", "$$camp_createdAt"] } 
                    ] 
                  } 
                } 
              },
              { $project: { phone: 1, _id: 0 } }
            ],
            as: "inboundMsgs"
          }
        },
        {
          $addFields: {
            // ✅ Clean array of full phone strings that replied
            repliedPhonesArr: {
              $map: {
                input: {
                  $filter: {
                    input: "$inboundMsgs",
                    as: "msg",
                    cond: { $ne: [{ $toString: { $ifNull: ["$$msg.phone", ""] } }, ""] }
                  }
                },
                as: "msg",
                in: { $toString: "$$msg.phone" }
              }
            }
          }
        },
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
            // ✅ Map array to add temporary _effStatus field to each item
            mappedReportData: {
              $map: {
                input: { $ifNull: ["$reportData", []] },
                as: "r",
                in: {
                  $mergeObjects: [
                    "$$r",
                    {
                      _effStatus: {
                        $switch: {
                          branches: [
                            { 
                              case: {
                                $or: [
                                  // Has reply string in reportData
                                  { $ne: [ { $ifNull: ["$$r.reply", ""] }, "" ] },
                                  // Has non-empty strings in replies array
                                  { 
                                    $gt: [
                                      {
                                        $size: {
                                          $filter: {
                                            input: { $ifNull: ["$$r.replies", []] },
                                            as: "rep",
                                            cond: { $ne: ["$$rep", ""] }
                                          }
                                        }
                                      },
                                      0
                                    ]
                                  },
                                  // ✅ FIX: Safely check if phone matches any replied phone using regex
                                  {
                                    $anyElementTrue: {
                                      $map: {
                                        input: "$repliedPhonesArr",
                                        as: "rep",
                                        in: {
                                          $or: [
                                            {
                                              $and: [
                                                { $ne: ["$$rep", ""] },
                                                // ✅ FIX: Use $literal for "$" to prevent FieldPath error
                                                { $regexMatch: { input: { $toString: { $ifNull: ["$$r.phone", ""] } }, regex: { $concat: ["$$rep", { $literal: "$" }] }, options: "i" } }
                                              ]
                                            },
                                            {
                                              $and: [
                                                { $ne: ["$$rep", ""] },
                                                { $regexMatch: { input: "$$rep", regex: { $concat: [{ $toString: { $ifNull: ["$$r.phone", ""] } }, { $literal: "$" }] }, options: "i" } }
                                              ]
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                ]
                              }, 
                              then: "replied" 
                            },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, then: "read" },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }, then: "delivered" },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, then: "sent" },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }, then: "failed" },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }, then: "invalid" },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }, then: "duplicate" }
                          ],
                          default: "pending"
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
            
            // ✅ Calculate true total stats for Brief Modal easily using _effStatus
            campaignStats: {
              total: { $size: { $ifNull: ["$mappedReportData", []] } },
              replied: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "replied"] } } } },
              read: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "read"] } } } },
              delivered: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "delivered"] } } } },
              sent: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "sent"] } } } },
              failed: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "failed"] } } } },
              invalid: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "invalid"] } } } },
              duplicate: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "duplicate"] } } } },
              pending: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "pending"] } } } }
            },
            
            // ✅ Apply filters to the array
            filteredData: {
              $filter: {
                input: "$mappedReportData",
                as: "r",
                cond: finalFilterCond
              }
            }
          }
        },
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
            campaignStats: 1,
            // ✅ Slice the filtered array to exactly 50 items
            reportData: { $slice: ["$filteredData", skip, limit] },
            totalFiltered: { $size: "$filteredData" }
          }
        }
      ];

      const result = await Campaign.aggregate(pipeline);
      
      if (!result || result.length === 0) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }

      const campaign = result[0];
      const totalPages = Math.max(1, Math.ceil(campaign.totalFiltered / limit));

      return NextResponse.json({ 
        success: true, 
        campaigns: [{ 
          ...campaign,
          languageCode: campaign.languageCode || "en", 
          totalDeducted: campaign.totalDeducted || 0 
        }],
        currentPage: page,
        totalPages: totalPages,
        campaignStats: campaign.campaignStats
      });
    }

    // ==========================================
    // ✅ 3. PAGINATED LIST MODE (Fast & Lightweight)
    // ==========================================
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [campaigns, totalCampaigns] = await Promise.all([
      Campaign.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-reportData") // Excludes massive arrays for list view
        .lean(),
      Campaign.countDocuments({ userId: new mongoose.Types.ObjectId(userId) })
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
    console.error("List API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
