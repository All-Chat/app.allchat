/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
require('dotenv').config({ path: '.env.local' });

import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import { Job } from '../lib/queue';
import mongoose from 'mongoose';

connectDB().then(async () => {
  console.log('✅ Stats Worker connected to MongoDB');
  startStatsWorker();
});

async function startStatsWorker() {
  console.log('🚀 Worker started for queue: stats-processing');

  while (true) {
    try {
      const job = await Job.findOneAndUpdate(
        { queue: 'stats-processing', $or: [{ status: "pending" }, { status: "processing", lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();

      if (job) {
        console.log(`▶️ Processing stats job ${job.name} (${job._id})`);
        try {
          let result;
          if (job.name === 'sync-campaign-stats') {
            result = await syncCampaignStats(job.data.campaignId);
          }
          await Job.updateOne({ _id: job._id }, { $set: { status: "completed", result } });
          console.log(`✅ Completed stats job ${job.name}`);
        } catch (err: any) {
          console.error(`❌ Failed stats job:`, err.message);
          await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error('Polling error for stats-processing:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ============================================================================
// STATS WORKER LOGIC
// ============================================================================

async function syncCampaignStats(campaignId: string) {
  try {
    await Campaign.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(campaignId) } },
      {
        $project: {
          liveStats: {
            $let: {
              vars: {
                counts: {
                  $reduce: {
                    input: { $ifNull: ["$reportData", []] },
                    initialValue: { replied: 0, read: 0, delivered: 0, sent: 0, failed: 0, invalid: 0, duplicate: 0 },
                    in: {
                      replied: { $add: ["$$value.replied", { $cond: [{ $or: [{ $ne: [{ $ifNull: ["$$this.reply", ""] }, ""] }, { $gt: [{ $size: { $filter: { input: { $ifNull: ["$$this.replies", []] }, as: "rep", cond: { $ne: ["$$rep", ""] } } } }, 0] }] }, 1, 0] }] },
                      read: { $add: ["$$value.read", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "read"] }, 1, 0] }] },
                      delivered: { $add: ["$$value.delivered", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "delivered"] }, 1, 0] }] },
                      sent: { $add: ["$$value.sent", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "sent"] }, 1, 0] }] },
                      failed: { $add: ["$$value.failed", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "failed"] }, 1, 0] }] },
                      invalid: { $add: ["$$value.invalid", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "invalid"] }, 1, 0] }] },
                      duplicate: { $add: ["$$value.duplicate", { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$$this.status", ""] } }, "duplicate"] }, 1, 0] }] }
                    }
                  }
                }
              },
              in: { total: { $ifNull: ["$totalMessages", 0] }, replied: "$$counts.replied", read: "$$counts.read", delivered: "$$counts.delivered", sent: "$$counts.sent", failed: "$$counts.failed", invalid: "$$counts.invalid", duplicate: "$$counts.duplicate" }
            }
          }
        }
      },
      { $merge: { into: "campaigns", on: "_id", whenMatched: "merge", whenNotMatched: "discard" } }
    ]);
    return { success: true };
  } catch (error) {
    console.error(`❌ Stats sync error for campaign ${campaignId}:`, error);
    return { success: false };
  }
}

process.on('SIGTERM', async () => {
  console.log('Stats Worker process shutting down...');
  process.exit(0);
});
