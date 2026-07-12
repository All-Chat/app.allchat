/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { countsQueue } from "@/lib/queue";

/**
 * 🚀 Cache-first counts route, with a GUARANTEED fallback.
 *
 * - Cache hit -> serve instantly from Redis (no DB hit at all).
 * - Cache stale (>15s old) -> serve the cached data immediately, AND
 *   fire off a background refresh job (fire-and-forget, not awaited) so
 *   the cache gets fresh again for next time. The person never waits on it.
 * - Cache miss (first load ever / expired after 1hr) -> compute the
 *   aggregation right here, inline, exactly once. Save it to cache before
 *   returning. Every load after this one hits the fast cache path above.
 *
 * This avoids relying on the worker process being the ONLY thing that can
 * ever populate the cache, and avoids BullMQ's waitUntilFinished (which
 * has known race-condition edge cases when a job finishes very fast or
 * gets stuck) — so this route can never get permanently stuck waiting.
 */

const CACHE_KEY_PREFIX = "counts";
const LOCK_KEY_PREFIX = "counts-lock";
const STALE_AFTER_MS = 15_000;

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

    const cacheKey = `${CACHE_KEY_PREFIX}:${userId}`;
    const lockKey = `${LOCK_KEY_PREFIX}:${userId}`;

    let cachedRaw: string | null = null;
    try {
      const redisClient = await countsQueue.client;
      cachedRaw = await redisClient.get(cacheKey);
    } catch (redisErr) {
      console.error("[Counts Route] Redis read failed, falling back to DB:", redisErr);
      cachedRaw = null;
    }

    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      const age = Date.now() - (parsed._cachedAt || 0);

      if (age > STALE_AFTER_MS) {
        triggerBackgroundRefresh(userId, cacheKey, lockKey).catch((e) =>
          console.error("[Counts Route] Background refresh trigger failed:", e)
        );
      }

      return NextResponse.json(paginate(parsed.campaigns || [], page, limit));
    }

    // 🚀 GUARANTEED FALLBACK: compute it right here, right now. No queue,
    // no waiting on another process — this always returns real data.
    const campaigns = await computeCampaignCounts(userId);

    try {
      const redisClient = await countsQueue.client;
      await redisClient.set(cacheKey, JSON.stringify({ campaigns, _cachedAt: Date.now() }), {
        EX: 3600,
      });
    } catch (redisErr) {
      console.error("[Counts Route] Failed to write cache (non-fatal):", redisErr);
    }

    return NextResponse.json(paginate(campaigns, page, limit));
  } catch (error: any) {
    console.error("❌ Counts API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

function paginate(campaigns: any[], page: number, limit: number) {
  const skip = (page - 1) * limit;
  const pageItems = campaigns.slice(skip, skip + limit);
  return {
    success: true,
    campaigns: pageItems,
    page,
    limit,
    totalCampaigns: campaigns.length,
    hasMore: skip + pageItems.length < campaigns.length,
  };
}

async function triggerBackgroundRefresh(userId: string, cacheKey: string, lockKey: string) {
  const redisClient = await countsQueue.client;
  
  // Fix: Use set with PX and NX options
  const acquired = await (redisClient as any).set(lockKey, "1", "PX", 30000, "NX");
  
  if (!acquired) return; // Someone else is already refreshing

  await countsQueue.add(
    "generate-counts",
    { userId, cacheKey, lockKey },
    { removeOnComplete: true, removeOnFail: true }
  );
}

// Same aggregation logic as before — only runs on a true cache miss.
async function computeCampaignCounts(userId: string) {
  await connectDB();

  const campaigns = await Campaign.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $sort: { createdAt: -1 } },
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
        sentCount: 1,
        failedCount: 1,
        skippedCount: 1,
        liveStats: {
          $let: {
            vars: {
              counts: {
                $reduce: {
                  input: { $ifNull: ["$reportData", []] },
                  initialValue: { replied: 0, read: 0, delivered: 0, sent: 0, failed: 0, invalid: 0, duplicate: 0 },
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
                        delivered: { $add: ["$$value.delivered", { $cond: [{ $eq: ["$$status", "delivered"] }, 1, 0] }] },
                        sent: { $add: ["$$value.sent", { $cond: [{ $eq: ["$$status", "sent"] }, 1, 0] }] },
                        failed: { $add: ["$$value.failed", { $cond: [{ $eq: ["$$status", "failed"] }, 1, 0] }] },
                        invalid: { $add: ["$$value.invalid", { $cond: [{ $eq: ["$$status", "invalid"] }, 1, 0] }] },
                        duplicate: { $add: ["$$value.duplicate", { $cond: [{ $eq: ["$$status", "duplicate"] }, 1, 0] }] },
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

  return campaigns.map((c: any) => {
    const ls = c.liveStats || {};
    const total = ls.total || 0;
    const read = ls.read || 0;
    const delivered = ls.delivered || 0;
    const sent = c.sentCount || ls.sent || 0;
    const failed = c.failedCount || ls.failed || 0;
    const invalid = ls.invalid || 0;
    const duplicate = ls.duplicate || 0;

    const processed = read + delivered + sent + failed + invalid + duplicate;
    const pending = Math.max(0, total - processed);
    const progress = total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;

    return {
      ...c,
      liveStats: {
        ...ls,
        sent,
        failed,
        pending,
        deliveredRead: delivered + read,
        failedInvalid: failed + invalid,
        progress,
      },
      languageCode: c.languageCode || "en",
      totalDeducted: c.totalDeducted || 0,
    };
  });
}
