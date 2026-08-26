/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
require('dotenv').config({ path: '.env.local' });

import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import CampaignReport from '../models/CampaignReport'; // ✅ NEW
import User from '../models/User';
import Message from '../models/Message';
import Workflow from '../models/Workflow';
import { Job, Cache } from '../lib/queue';
import mongoose from 'mongoose';
import { getMinPrice } from '../lib/billing';

connectDB().then(async () => {
  console.log('✅ Utility Worker connected to MongoDB');
  startUtilityWorker();
  startScheduledCampaignsChecker();
});

async function startUtilityWorker() {
  console.log('🚀 Worker started for queue: utility-processing');
  while (true) {
    try {
      const job = await Job.findOneAndUpdate(
        { queue: 'utility-processing', $or: [{ status: "pending" }, { status: "processing", lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();

      if (job) {
        console.log(`▶️ Processing utility job ${job.name} (${job._id})`);
        try {
          let result;
          if (job.name === 'sync-dashboard-stats') result = await syncDashboardStats(job.data.userId);
          else if (job.name === 'sync-billing-data') result = await syncBillingData(job.data.userId);

          await Job.updateOne({ _id: job._id }, { $set: { status: "completed", result } });
          console.log(`✅ Completed utility job ${job.name}`);
        } catch (err: any) {
          console.error(`❌ Failed utility job:`, err.message);
          await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error('Polling error for utility-processing:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function startScheduledCampaignsChecker() {
  console.log("🚀 Worker started for: Scheduled Campaigns Checker (Interval: 60s)");
  while (true) {
    try {
      const now = new Date();
      const campaignsToStart = await Campaign.find({ status: "scheduled", scheduledAt: { $lte: now } }).lean();
      if (campaignsToStart.length > 0) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const internalSecret = process.env.INTERNAL_API_SECRET;
        for (const campaign of campaignsToStart) {
          try {
            console.log(`[Worker] Auto-starting scheduled campaign: ${campaign.name}`);
            await fetch(`${baseUrl}/api/campaigns/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret || "" },
              body: JSON.stringify({ campaignId: campaign._id.toString() }),
            });
          } catch (err) {}
        }
      }
    } catch (error) {}
    await new Promise(r => setTimeout(r, 60000));
  }
}

// ==========================================
// DASHBOARD STATS LOGIC
// ==========================================
async function syncDashboardStats(userId: string) {
  try {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjId).select("balance totalRecharged pricePerMessage whatsappAccessToken whatsappPhoneNumberId parentTenantId isTenant tenantId");
    if (!user) return { success: false, statusCode: 404 };

    const userIdsArray: mongoose.Types.ObjectId[] = [userObjId];
    let tenantIdToSearch = null;
    if (user.isTenant) tenantIdToSearch = user.tenantId || user._id.toString();
    else if (user.parentTenantId) tenantIdToSearch = user.parentTenantId;

    if (tenantIdToSearch) {
      const tenantUser = await User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("_id").lean();
      if (tenantUser && !userIdsArray.some((id) => id.equals(tenantUser._id))) userIdsArray.push(tenantUser._id);
      const subUsers = await User.find({ parentTenantId: tenantIdToSearch }).select("_id").lean();
      subUsers.forEach((u) => { if (!userIdsArray.some((id) => id.equals(u._id))) userIdsArray.push(u._id); });
    }

    const totalChatsAgg = await Message.aggregate([
      { $match: { userId: { $in: userIdsArray }, direction: "in" } },
      { $group: { _id: "$phone" } },
      { $count: "totalChats" },
    ]);

    const totalWorkflows = await Workflow.countDocuments({ userId: userObjId });
    const totalCampaigns = await Campaign.countDocuments({ userId: userObjId });

    const activeCampaigns = await Campaign.aggregate([
      { $match: { userId: userObjId, status: { $in: ["running", "scheduled", "completed"] } } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $project: {
          name: 1, status: 1,
          total: { $ifNull: ["$totalMessages", 0] },
          sentCount: { $ifNull: ["$sentCount", 0] },
          readCount: { $ifNull: ["$liveStats.read", 0] }, // ✅ Read from liveStats
          totalDeducted: { $ifNull: ["$totalDeducted", 0] },
        },
      },
    ]);

    const campaignData = activeCampaigns.map((camp: any) => ({
      _id: camp._id, name: camp.name, status: camp.status, total: camp.total,
      sentCount: camp.sentCount, readCount: camp.readCount,
      readPercent: camp.total > 0 ? Math.round((camp.readCount / camp.total) * 100) : 0,
      progress: camp.total > 0 ? Math.round((camp.sentCount / camp.total) * 100) : 0,
      totalDeducted: camp.totalDeducted || 0,
    }));

    let billingUser: any = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId }).select("balance totalRecharged priceMarketing priceUtility priceAuthentication");
      if (parent) billingUser = parent;
    }

    const balance = billingUser?.balance || 0;
    const totalRecharged = billingUser?.totalRecharged || 0;
    const totalSpent = Math.round((totalRecharged - balance) * 100) / 100;
    const minPrice = getMinPrice(billingUser);
    const canSendMessage = minPrice === 0 || balance >= minPrice;

    let phoneDetails: any = {
      displayPhoneNumber: "Not Configured", verifiedName: "Add Credentials in Settings",
      qualityRating: "N/A", status: "DISCONNECTED", messagingLimitTier: "N/A", twoFactorEnabled: "N/A",
    };

    if (user.whatsappAccessToken && user.whatsappPhoneNumberId) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${user.whatsappPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating,status,whatsapp_business_manager_messaging_limit,is_pin_enabled`, { headers: { Authorization: `Bearer ${user.whatsappAccessToken}` }, cache: "no-store", signal: controller.signal });
        clearTimeout(timeoutId);
        const metaJson = await metaRes.json();
        if (metaRes.ok) {
          phoneDetails = {
            displayPhoneNumber: metaJson.display_phone_number || "Not Available", verifiedName: metaJson.verified_name || "Not Available",
            qualityRating: metaJson.quality_rating || "N/A", status: metaJson.status || "N/A",
            messagingLimitTier: metaJson.whatsapp_business_manager_messaging_limit || "N/A",
            twoFactorEnabled: metaJson.is_pin_enabled === true ? true : metaJson.is_pin_enabled === false ? false : "N/A",
          };
        }
      } catch (err: any) {}
    }

    const payload = {
      success: true,
      totalChats: totalChatsAgg[0]?.totalChats || 0,
      totalWorkflows, totalCampaigns,
      campaigns: campaignData,
      phoneDetails,
      billing: { balance, totalRecharged, totalSpent: Math.max(totalSpent, 0), canSendMessage },
    };

    const cacheKey = `dashboard:${userId}`;
    await Cache.updateOne({ key: cacheKey }, { $set: { value: JSON.stringify(payload), expireAt: new Date(Date.now() + 120 * 1000) } }, { upsert: true });
    return payload;
  } catch (error) {
    console.error("❌ Dashboard Sync Error:", error);
    return { success: false, statusCode: 500, error: "Internal server error" };
  }
}

// ==========================================
// BILLING & CAMPAIGN LIST STATS LOGIC
// ==========================================
async function syncBillingData(userId: string) {
  try {
    const user = await User.findById(userId).select("enabledCountries priceMarketing priceUtility priceAuthentication pricePerMessage").lean();
    if (!user) return { success: false, statusCode: 404 };

    const enabledCountries = (user.enabledCountries || []).map((c: any) => ({ ...c }));
    enabledCountries.sort((a: any, b: any) => String(b.code || "").length - String(a.code || "").length);

    const campaigns = await Campaign.find({ userId }).sort({ createdAt: -1 })
      .select({ _id: 1, name: 1, templateName: 1, templateCategory: 1, status: 1, totalMessages: 1, sentCount: 1, failedCount: 1, totalDeducted: 1, pricePerMessage: 1, scheduledAt: 1, createdAt: 1, updatedAt: 1, startedAt: 1, completedAt: 1, liveStats: 1, phoneNumbers: { $slice: 1 } })
      .lean();

    const campaignIds = campaigns.map((c: any) => c._id);

    // ✅ FIX: Use simple countDocuments instead of $reduce array aggregation
    const statsAgg = await CampaignReport.aggregate([
      { $match: { campaignId: { $in: campaignIds } } },
      { $group: { _id: { campaignId: "$campaignId", status: "$status" }, count: { $sum: 1 } } }
    ]);

    const statsMap: Record<string, any> = {};
    statsAgg.forEach((item: any) => {
      const cid = item._id.campaignId.toString();
      const status = item._id.status || "pending";
      if (!statsMap[cid]) statsMap[cid] = { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, invalid: 0, pending: 0, duplicate: 0 };
      if (statsMap[cid].hasOwnProperty(status)) statsMap[cid][status] += item.count;
      statsMap[cid].total += item.count;
    });

    const mappedCampaigns = campaigns.map((c: any) => {
      let currentPrice = 0;
      let matchedCountry: any = null;
      const firstPhone = c.phoneNumbers?.[0] ? String(c.phoneNumbers[0]).replace(/\D/g, "") : "";
      if (firstPhone) matchedCountry = enabledCountries.find((country: any) => firstPhone.startsWith(String(country.code || "")));
      if (!matchedCountry && enabledCountries.length > 0) matchedCountry = enabledCountries[0];

      const rawCategory = String(c.templateCategory || "").trim().toUpperCase();
      const category = rawCategory === "UTILITY" || rawCategory === "AUTHENTICATION" ? rawCategory : "MARKETING";

      if (matchedCountry) {
        if (category === "MARKETING") currentPrice = Number(matchedCountry.priceMarketing) || Number(user.priceMarketing) || 0;
        else if (category === "UTILITY") currentPrice = Number(matchedCountry.priceUtility) || Number(user.priceUtility) || 0;
        else if (category === "AUTHENTICATION") currentPrice = Number(matchedCountry.priceAuthentication) || Number(user.priceAuthentication) || 0;
      } else { currentPrice = Number(user.pricePerMessage) || 0; }

      const calculatedStats = statsMap[c._id.toString()];
      const rawStats = calculatedStats || c.liveStats || {};
      const totalFromCalc = calculatedStats?.total || 0;
      const totalFromDB = Number(c.totalMessages || 0);
      const finalTotal = Math.max(totalFromCalc, totalFromDB);
      const finalPending = Math.max(0, finalTotal - (Number(rawStats.sent || 0) + Number(rawStats.delivered || 0) + Number(rawStats.read || 0) + Number(rawStats.replied || 0) + Number(rawStats.failed || 0) + Number(rawStats.invalid || 0) + Number(rawStats.duplicate || 0)));

      const finalLiveStats = {
        total: finalTotal, sent: Number(rawStats.sent || 0), delivered: Number(rawStats.delivered || 0), read: Number(rawStats.read || 0),
        replied: Number(rawStats.replied || 0), failed: Number(rawStats.failed || 0), invalid: Number(rawStats.invalid || 0),
        pending: Number(rawStats.pending || finalPending), duplicate: Number(rawStats.duplicate || 0),
      };

      let finalStatus = c.status || "saved";
      if (finalLiveStats.pending === 0 && finalLiveStats.total > 0 && (finalStatus === "running" || finalStatus === "paused")) {
        Campaign.updateOne({ _id: c._id }, { $set: { status: "completed", completedAt: new Date() } }).catch(() => {});
        finalStatus = "completed";
      }

      const deliveredCombined = Number(finalLiveStats.sent || 0) + Number(finalLiveStats.delivered || 0) + Number(finalLiveStats.read || 0) + Number(finalLiveStats.replied || 0);
      const priceForCalc = Number(c.pricePerMessage) > 0 ? Number(c.pricePerMessage) : currentPrice;
      let finalTotalDeducted = Number(c.totalDeducted || 0);
      if (finalTotalDeducted === 0 && deliveredCombined > 0 && priceForCalc > 0) finalTotalDeducted = deliveredCombined * priceForCalc;

      return { ...c, status: finalStatus, currentPrice, totalDeducted: finalTotalDeducted, liveStats: finalLiveStats };
    });

    const payload = { success: true, campaigns: mappedCampaigns };
    const cacheKey = `billing:${userId}`;
    await Cache.updateOne({ key: cacheKey }, { $set: { value: JSON.stringify(payload), expireAt: new Date(Date.now() + 120 * 1000) } }, { upsert: true });
    return payload;
  } catch (error) {
    console.error("❌ Billing Sync Error:", error);
    return { success: false, statusCode: 500, error: "Internal server error" };
  }
}

process.on('SIGTERM', async () => { console.log('Utility Worker process shutting down...'); process.exit(0); });
