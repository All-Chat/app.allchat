/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
require('dotenv').config({ path: '.env.local' });

import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import CampaignReport from '../models/CampaignReport';
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

async function syncCampaignStats(campaignId: string) {
  try {
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

    const campaign: any = await Campaign.findById(campaignId).select("totalMessages").lean();
    liveStats.total = campaign?.totalMessages || actualDocsCount;

    // ✅ FIX: Bulletproof math for pending
    const processed = liveStats.sent + liveStats.delivered + liveStats.read + liveStats.replied + liveStats.failed + liveStats.invalid + liveStats.duplicate;
    liveStats.pending = Math.max(0, liveStats.total - processed);

    await Campaign.updateOne({ _id: campaignId }, { $set: { liveStats } });
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
