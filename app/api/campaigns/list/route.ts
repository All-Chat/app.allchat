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

    // ✅ NEW: Lightning-fast fetch for VIEW MODAL (Only fetches 15 numbers)
    const viewId = searchParams.get("viewId");
    if (viewId) {
      const campaign = await Campaign.findOne(
        { 
          _id: new mongoose.Types.ObjectId(viewId), 
          userId: new mongoose.Types.ObjectId(userId) 
        },
        {
          name: 1,
          templateName: 1,
          templateCategory: 1,
          languageCode: 1,
          scheduledAt: 1,
          variables: 1,
          mappedVariables: 1,
          generateOtp: 1,
          otpLength: 1,
          mediaUrl: 1,
          mediaType: 1,
          totalMessages: 1,
          additionalFields: 1,
          // ✅ FIX: Only fetch 15 elements of these massive arrays!
          phoneNumbers: { $slice: 15 },
          names: { $slice: 15 },
          additionalFieldsData: { $slice: 15 }
        }
      ).lean();
      
      if (!campaign) {
        return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, campaigns: [campaign] });
    }

    // ✅ Fetch for EDIT PAGE (Loads full arrays)
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
    // 1. LIVE CHECK MODE
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
    // 2. SINGLE CAMPAIGN MODE (Report Page)
    // ==========================================
    if (campaignId) {
      const limit = 50;
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;

      const showOnly = searchParams.get("showOnly")?.split(",").filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(",").filter(Boolean) || [];
      const search = searchParams.get("search") || "";

      // Reusable expressions to avoid duplicate code and ensure accurate filtering
      const isRepliedExpr = {
        $or: [
          { $ne: [{ $ifNull: ["$$r.reply", ""] }, ""] },
          { $gt: [ { $size: { $filter: { input: { $ifNull: ["$$r.replies", []] }, as: "rep", cond: { $ne: ["$$rep", ""] } } } }, 0 ] },
          { $in: [normalizePhoneExpr("$$r.phone"), "$repliedPhonesSet"] }
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
        $cond: {
          if: isRepliedExpr,
          then: "replied",
          else: baseStatusExpr
        }
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

      if (showOnly.length > 0) {
        andConditions.push({ $in: [effectiveStatusExpr, showOnly] });
      }
      
      if (filterOut.length > 0) {
        andConditions.push({ $not: [{ $in: [effectiveStatusExpr, filterOut] }] });
      }

      const finalFilterCond = andConditions.length > 0 ? { $and: andConditions } : true;

      const pipeline: any[] = [
        {
          $match: {
            _id: new mongoose.Types.ObjectId(campaignId),
            userId: new mongoose.Types.ObjectId(userId),
          },
        },
        {
          $addFields: {
            campPhonesNormalized: {
              $setUnion: [
                {
                  $map: {
                    input: { $ifNull: ["$reportData", []] },
                    as: "r",
                    in: normalizePhoneExpr("$$r.phone"),
                  },
                },
                [],
              ],
            },
          },
        },
        {
          $lookup: {
            from: "messages",
            let: { camp_createdAt: "$createdAt", user_id: "$userId", camp_phones: "$campPhonesNormalized" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$userId", "$$user_id"] },
                      { $eq: ["$direction", "in"] },
                      { $gte: ["$createdAt", "$$camp_createdAt"] },
                    ],
                  },
                },
              },
              { $addFields: { normalizedPhone: normalizePhoneExpr("$phone") } },
              { $match: { $expr: { $in: ["$normalizedPhone", "$$camp_phones"] } } },
              { $project: { _id: 0, normalizedPhone: 1, text: 1, messageType: 1 } },
            ],
            as: "inboundMsgs",
          },
        },
        {
          $addFields: {
            repliedPhonesSet: { $setUnion: ["$inboundMsgs.normalizedPhone", []] },
          },
        },
        // ==========================================
        // FAST STATS CALCULATION (No mapping overhead)
        // ==========================================
        {
          $addFields: {
            campaignStats: {
              total: { $size: { $ifNull: ["$reportData", []] } },
              replied: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: isRepliedExpr } } },
              read: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, { $not: isRepliedExpr } ] } } } },
              delivered: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }, { $not: isRepliedExpr } ] } } } },
              sent: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, { $not: isRepliedExpr } ] } } } },
              failed: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }, { $not: isRepliedExpr } ] } } } },
              invalid: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }, { $not: isRepliedExpr } ] } } } },
              duplicate: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }, { $not: isRepliedExpr } ] } } } },
              pending: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $or: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "pending"] }, { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "queued"] }, { $eq: [{ $ifNull: ["$$r.status", ""] }, ""] } ] }, { $not: isRepliedExpr } ] } } } },
            }
          }
        },
        // ==========================================
        // APPLY FILTERS
        // ==========================================
        {
          $addFields: {
            filteredData: {
              $filter: {
                input: { $ifNull: ["$reportData", []] },
                as: "r",
                cond: finalFilterCond,
              },
            },
          },
        },
        // ==========================================
        // SLICE DATA EARLY (Pagination limit applied here!)
        // ==========================================
        {
          $addFields: {
            paginatedData: {
              $cond: {
                if: isDownload,
                then: "$filteredData",
                else: { $slice: ["$filteredData", skip, limit] }
              }
            }
          }
        },
        // ==========================================
        // HEAVY MAPPING (Only processes 50 items now!)
        // ==========================================
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
            campaignStats: 1,
            totalFiltered: { $size: "$filteredData" },
            reportData: {
              $map: {
                input: "$paginatedData",
                as: "r",
                in: {
                  $let: {
                    vars: {
                      matchedMsgs: {
                        $filter: {
                          input: { $ifNull: ["$inboundMsgs", []] },
                          as: "msg",
                          cond: { $eq: ["$$msg.normalizedPhone", normalizePhoneExpr("$$r.phone")] }
                        }
                      }
                    },
                    in: {
                      $mergeObjects: [
                        "$$r",
                        {
                          status: effectiveStatusExpr,
                          replies: {
                            $filter: {
                              input: {
                                $concatArrays: [
                                  { $ifNull: ["$$r.replies", []] },
                                  {
                                    $map: {
                                      input: "$$matchedMsgs",
                                      as: "msg",
                                      in: {
                                        $cond: {
                                          if: { $ne: [{ $ifNull: ["$$msg.text", ""] }, ""] },
                                          then: "$$msg.text",
                                          else: {
                                            $cond: {
                                              if: { $ne: [{ $ifNull: ["$$msg.messageType", ""] }, ""] },
                                              then: { $concat: ["[", "$$msg.messageType", "]"] },
                                              else: ""
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                ]
                              },
                              as: "rep",
                              cond: { $ne: ["$$rep", ""] }
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              }
            },
          },
        },
      ];

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
        campaignStats: campaign.campaignStats,
      });
    }

    // ==========================================
    // 3. PAGINATED LIST MODE
    // ==========================================
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [campaigns, totalCampaigns] = await Promise.all([
      Campaign.find({ userId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-reportData")
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
