/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import mongoose from "mongoose";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false }, { status: 401 });

    const user = await User.findById(userId).select("enabledCountries priceMarketing priceUtility priceAuthentication pricePerMessage").lean();
    if (!user) return NextResponse.json({ success: false }, { status: 404 });

    const enabledCountries = (user.enabledCountries || []).map((c: any) => ({ ...c }));
    enabledCountries.sort((a: any, b: any) => String(b.code || "").length - String(a.code || "").length);

    const campaigns = await Campaign.find({ userId }).sort({ createdAt: -1 })
      .select({ _id: 1, name: 1, templateName: 1, templateCategory: 1, status: 1, totalMessages: 1, sentCount: 1, failedCount: 1, totalDeducted: 1, pricePerMessage: 1, scheduledAt: 1, createdAt: 1, updatedAt: 1, startedAt: 1, completedAt: 1, liveStats: 1, phoneNumbers: { $slice: 1 } })
      .lean();

    const campaignIds = campaigns.map((c: any) => new mongoose.Types.ObjectId(c._id));

    // ✅ FIX: Aggregate count AND chargedAmount (which is 0 for refunded messages)
    const statsAgg = await CampaignReport.aggregate([
      { $match: { campaignId: { $in: campaignIds } } },
      { 
        $group: { 
          _id: { campaignId: "$campaignId", status: "$status" }, 
          count: { $sum: 1 },
          totalCharged: { $sum: "$chargedAmount" } // ✅ Sum up the actual charged amount
        } 
      }
    ]);

    const statsMap: Record<string, any> = {};
    statsAgg.forEach((item: any) => {
      const cid = item._id.campaignId.toString();
      const status = (item._id.status || "pending").toLowerCase();
      if (!statsMap[cid]) statsMap[cid] = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, invalid: 0, duplicate: 0, docCount: 0, totalCharged: 0 };
      if (statsMap[cid].hasOwnProperty(status)) statsMap[cid][status] += item.count;
      statsMap[cid].docCount += item.count;
      statsMap[cid].totalCharged += item.totalCharged || 0;
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

      const stats = statsMap[c._id.toString()] || {};
      const docCount = stats.docCount || 0;
      const totalMessages = c.totalMessages || docCount || 0;

      const sent = stats.sent || 0;
      const delivered = stats.delivered || 0;
      const read = stats.read || 0;
      const replied = stats.replied || 0;
      const failed = stats.failed || 0;
      const invalid = stats.invalid || 0;
      const duplicate = stats.duplicate || 0;

      const processed = sent + delivered + read + replied + failed + invalid + duplicate;
      const pending = Math.max(0, totalMessages - processed);

      const finalLiveStats = { total: totalMessages, sent, delivered, read, replied, failed, invalid, pending, duplicate };

      let finalStatus = c.status || "saved";
      if (finalLiveStats.pending === 0 && finalLiveStats.total > 0 && (finalStatus === "running" || finalStatus === "paused")) {
        Campaign.updateOne({ _id: c._id }, { $set: { status: "completed", completedAt: new Date() } }).catch(() => {});
        finalStatus = "completed";
      }

      // ✅ CRITICAL FIX: Use the exact totalCharged amount from the aggregation. This is already Net (Spend - Refunds).
      const finalTotalDeducted = Number(stats.totalCharged || 0);

      return { ...c, status: finalStatus, currentPrice, totalDeducted: finalTotalDeducted, liveStats: finalLiveStats };
    });

    return NextResponse.json({ success: true, campaigns: mappedCampaigns });
  } catch (error) {
    console.error("Error in campaign billing:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
