/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // ── Pagination (avoid pulling the user's ENTIRE campaign history every load) ──
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    const campaigns = await Campaign.aggregate([
      {
        // 🚀 FIX: match on the real ObjectId, not $toString($userId).
        // $toString inside $match/$expr forces a full collection scan (COLLSCAN)
        // because Mongo can't use the userId index when it has to convert every
        // document's field first. This alone should be the biggest speed win.
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          name: 1,
          templateName: 1,
          templateCategory: 1,
          variables: 1,
          mappedVariables: 1,
          generateOtp: 1,
          otpLength: 1,

          phoneNumbers: { $slice: [{ $ifNull: ["$phoneNumbers", []] }, 15] },
          names: { $slice: [{ $ifNull: ["$names", []] }, 15] },
          additionalFieldsData: { $slice: [{ $ifNull: ["$additionalFieldsData", []] }, 15] },

          mediaUrl: 1,
          mediaType: 1,
          languageCode: 1,
          status: 1,
          totalMessages: 1,
          totalDeducted: 1,
          scheduledAt: 1,
          createdAt: 1,
          additionalFields: 1,

          // 🚀 FIX: single $reduce pass instead of 7x $filter over reportData.
          // Same array, walked once, all counters built together.
          liveStats: {
            $let: {
              vars: {
                counts: {
                  $reduce: {
                    input: { $ifNull: ["$reportData", []] },
                    initialValue: {
                      replied: 0,
                      read: 0,
                      delivered: 0,
                      sent: 0,
                      failed: 0,
                      invalid: 0,
                      duplicate: 0,
                    },
                    in: {
                      $let: {
                        vars: {
                          status: { $toLower: { $ifNull: ["$$this.status", ""] } },
                          hasReply: {
                            $or: [
                              { $ne: [{ $ifNull: ["$$this.reply", ""] }, ""] },
                              {
                                $gt: [
                                  {
                                    $size: {
                                      $filter: {
                                        input: { $ifNull: ["$$this.replies", []] },
                                        as: "rep",
                                        cond: { $ne: ["$$rep", ""] },
                                      },
                                    },
                                  },
                                  0,
                                ],
                              },
                            ],
                          },
                        },
                        in: {
                          replied: {
                            $add: ["$$value.replied", { $cond: ["$$hasReply", 1, 0] }],
                          },
                          read: {
                            $add: ["$$value.read", { $cond: [{ $eq: ["$$status", "read"] }, 1, 0] }],
                          },
                          delivered: {
                            $add: ["$$value.delivered", { $cond: [{ $eq: ["$$status", "delivered"] }, 1, 0] }],
                          },
                          sent: {
                            $add: ["$$value.sent", { $cond: [{ $eq: ["$$status", "sent"] }, 1, 0] }],
                          },
                          failed: {
                            $add: ["$$value.failed", { $cond: [{ $eq: ["$$status", "failed"] }, 1, 0] }],
                          },
                          invalid: {
                            $add: ["$$value.invalid", { $cond: [{ $eq: ["$$status", "invalid"] }, 1, 0] }],
                          },
                          duplicate: {
                            $add: ["$$value.duplicate", { $cond: [{ $eq: ["$$status", "duplicate"] }, 1, 0] }],
                          },
                        },
                      },
                    },
                  },
                },
              },
              in: {
                total: { $ifNull: ["$totalMessages", 0] },
                replied: "$$counts.replied",
                read: "$$counts.read",
                delivered: "$$counts.delivered",
                sent: "$$counts.sent",
                failed: "$$counts.failed",
                invalid: "$$counts.invalid",
                duplicate: "$$counts.duplicate",
              },
            },
          },
        },
      },
    ]);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ success: true, campaigns: [], page, limit });
    }

    const fixedCampaigns = campaigns.map((c: any) => {
      const ls = c.liveStats || {};
      const total = ls.total || 0;
      const replied = ls.replied || 0;
      const read = ls.read || 0;
      const delivered = ls.delivered || 0;
      const sent = ls.sent || 0;
      const failed = ls.failed || 0;
      const invalid = ls.invalid || 0;
      const duplicate = ls.duplicate || 0;

      // 🐛 FIX: "replied" is NOT mutually exclusive with status (a delivered/read
      // message can also have a reply), so it must NOT be added into processed/
      // pending/progress math or you double-count and can exceed 100%.
      // Only status-based buckets are mutually exclusive per report entry.
      const processed = read + delivered + sent + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);
      const progress = total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;

      return {
        ...c,
        liveStats: {
          ...ls,
          pending,
          // "replied" stays as its own overlay stat — informational, can overlap
          // with delivered/read, should be shown separately in the UI (e.g. a badge)
          deliveredRead: delivered + read,
          failedInvalid: failed + invalid,
          progress,
        },
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
