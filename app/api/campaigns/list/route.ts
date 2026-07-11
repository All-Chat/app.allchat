/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

/**
 * ⚠️ REQUIRED indexes — run these once on your MongoDB:
 *
 *   db.campaigns.createIndex({ userId: 1, createdAt: -1 })
 *   db.campaigns.createIndex({ userId: 1, name: 1 })
 *   db.messages.createIndex({ userId: 1, direction: 1, createdAt: 1 })
 *
 * Without the messages index, the $lookup below still falls back to a
 * collection scan even after the $toString fix.
 */

// Reusable aggregation snippet: extract digits-only, then last 10 digits.
// This is how we match phone numbers regardless of "+91", "0", spaces,
// dashes etc. being present in one source but not the other.
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

    // ==========================================
    // ✅ 1. LIVE CHECK MODE
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
    // ✅ 2. SINGLE CAMPAIGN MODE (report / tag page)
    // ==========================================
    if (campaignId) {
      const limit = 50;
      const page = parseInt(searchParams.get("page") || "1");
      const skip = (page - 1) * limit;

      const showOnly = searchParams.get("showOnly")?.split(",").filter(Boolean) || [];
      const filterOut = searchParams.get("filterOut")?.split(",").filter(Boolean) || [];
      const search = searchParams.get("search") || "";

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
            userId: new mongoose.Types.ObjectId(userId),
          },
        },
        // 🚀 Precompute the normalized (last-10-digit) phone for every
        // recipient in THIS campaign, before doing the messages lookup.
        // This lets us scope the lookup to only relevant phones instead
        // of pulling the user's entire inbound message history.
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
        // 🚀 FIX: direct ObjectId match (no $toString) so the messages
        // index can be used, AND scope to only phones in this campaign
        // instead of the user's entire inbound history.
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
              {
                $addFields: {
                  normalizedPhone: normalizePhoneExpr("$phone"),
                },
              },
              {
                // Only keep messages whose phone is actually a recipient
                // of this campaign — this is what shrinks the lookup from
                // "entire message history" down to "relevant messages only"
                $match: {
                  $expr: { $in: ["$normalizedPhone", "$$camp_phones"] },
                },
              },
              { $project: { _id: 0, normalizedPhone: 1 } },
            ],
            as: "inboundMsgs",
          },
        },
        {
          $addFields: {
            // 🚀 Dedup'd Set of normalized phones that replied — O(1)-ish
            // membership checks from here on, no more regex cross-product.
            repliedPhonesSet: { $setUnion: ["$inboundMsgs.normalizedPhone", []] },
          },
        },
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
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
                                  { $ne: [{ $ifNull: ["$$r.reply", ""] }, ""] },
                                  {
                                    $gt: [
                                      {
                                        $size: {
                                          $filter: {
                                            input: { $ifNull: ["$$r.replies", []] },
                                            as: "rep",
                                            cond: { $ne: ["$$rep", ""] },
                                          },
                                        },
                                      },
                                      0,
                                    ],
                                  },
                                  // 🚀 FIX: cheap set membership instead of
                                  // nested regex loop over every message
                                  { $in: [normalizePhoneExpr("$$r.phone"), "$repliedPhonesSet"] },
                                ],
                              },
                              then: "replied",
                            },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, then: "read" },
                            {
                              case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] },
                              then: "delivered",
                            },
                            { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, then: "sent" },
                            {
                              case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] },
                              then: "failed",
                            },
                            {
                              case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] },
                              then: "invalid",
                            },
                            {
                              case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] },
                              then: "duplicate",
                            },
                          ],
                          default: "pending",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
            campaignStats: {
              total: { $size: { $ifNull: ["$mappedReportData", []] } },
              replied: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "replied"] } } } },
              read: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "read"] } } } },
              delivered: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "delivered"] } } } },
              sent: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "sent"] } } } },
              failed: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "failed"] } } } },
              invalid: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "invalid"] } } } },
              duplicate: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "duplicate"] } } } },
              pending: { $size: { $filter: { input: "$mappedReportData", as: "r", cond: { $eq: ["$$r._effStatus", "pending"] } } } },
            },
            filteredData: {
              $filter: {
                input: "$mappedReportData",
                as: "r",
                cond: finalFilterCond,
              },
            },
          },
        },
        {
          $project: {
            name: 1,
            templateName: 1,
            additionalFields: 1,
            languageCode: 1,
            totalDeducted: 1,
            campaignStats: 1,
            reportData: { $slice: ["$filteredData", skip, limit] },
            totalFiltered: { $size: "$filteredData" },
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
    // ✅ 3. PAGINATED LIST MODE
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
