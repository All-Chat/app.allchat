/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * ⚠️ REQUIRED — run this once directly on your MongoDB (shell/Compass/Atlas):
 *
 *   db.campaigns.createIndex({ userId: 1, createdAt: -1 })
 *
 * Without this index, $match + $sort below still falls back to a full
 * collection scan + in-memory sort, and no amount of code-level tuning
 * will fix that. This is usually 80%+ of the 3.5s you're seeing.
 */

// ── Lightweight in-memory cache (works if your Node/Next backend is a ──
// ── persistent process, not a fresh serverless container per request) ──
// Cuts repeat loads (list page refresh, coming back from tag/report page)
// down to near-zero, without touching schema or webhooks.
type CacheEntry = { data: any; expiresAt: number };
const CACHE_TTL_MS = 20_000; // 20s — tweak based on how fresh you need this
const cache = new Map<string, CacheEntry>();

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: any) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    const cacheKey = `${userId}:${page}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    await connectDB();

    const campaigns = await Campaign.aggregate([
      {
        // ObjectId match (not $toString) so the index above can actually be used
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      { $sort: { createdAt: -1 } },
      // 🚀 $skip + $limit BEFORE $project/$reduce — only the N docs for this
      // page ever get their reportData walked, not the user's entire history
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

          // Single $reduce pass over reportData (not 7x $filter)
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
                          replied: { $add: ["$$value.replied", { $cond: ["$$hasReply", 1, 0] }] },
                          read: { $add: ["$$value.read", { $cond: [{ $eq: ["$$status", "read"] }, 1, 0] }] },
                          delivered: {
                            $add: ["$$value.delivered", { $cond: [{ $eq: ["$$status", "delivered"] }, 1, 0] }],
                          },
                          sent: { $add: ["$$value.sent", { $cond: [{ $eq: ["$$status", "sent"] }, 1, 0] }] },
                          failed: { $add: ["$$value.failed", { $cond: [{ $eq: ["$$status", "failed"] }, 1, 0] }] },
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
    ]).allowDiskUse(false);

    if (!campaigns || campaigns.length === 0) {
      const empty = { success: true, campaigns: [], page, limit };
      setCached(cacheKey, empty);
      return NextResponse.json(empty);
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

      const processed = read + delivered + sent + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);
      const progress = total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;

      return {
        ...c,
        liveStats: {
          ...ls,
          pending,
          deliveredRead: delivered + read,
          failedInvalid: failed + invalid,
          progress,
        },
        languageCode: c.languageCode || "en",
        totalDeducted: c.totalDeducted || 0,
      };
    });

    const result = { success: true, campaigns: fixedCampaigns, page, limit };
    setCached(cacheKey, result);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Counts API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
