/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    /* =====================================================
       1. FETCH PRICING FIELDS
    ===================================================== */

    const user = await User.findById(session.user.id)
      .select("enabledCountries priceMarketing priceUtility priceAuthentication pricePerMessage")
      .lean();

    if (!user) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    /* =====================================================
       2. PRE-PROCESS COUNTRIES
    ===================================================== */

    const enabledCountries = (user.enabledCountries || []).map((c: any) => ({ ...c }));
    enabledCountries.sort((a: any, b: any) => String(b.code || "").length - String(a.code || "").length);

    /* =====================================================
       3. FETCH CAMPAIGNS
    ===================================================== */

    const campaigns = await Campaign.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .select({
        _id: 1, name: 1, templateName: 1, templateCategory: 1, status: 1,
        totalMessages: 1, sentCount: 1, failedCount: 1, totalDeducted: 1,
        pricePerMessage: 1, scheduledAt: 1, createdAt: 1, updatedAt: 1,
        startedAt: 1, completedAt: 1, liveStats: 1, stats: 1,
        phoneNumbers: { $slice: 1 },
      })
      .lean();

    /* =====================================================
       3.5 CALCULATE REAL STATS FROM reportData

       ✅ FIX: Now uses EFFECTIVE STATUS (same as Reports page)
       - If message has reply content → "replied"
       - Else uses the status field
       This makes the stats match the Reports page exactly.

       Also auto-completes campaigns when pending is 0.
    ===================================================== */

    const campaignIds = campaigns.map((c: any) => new mongoose.Types.ObjectId(c._id));

    // ✅ FIX: Use $project with effStatus (same logic as Reports page)
    // This checks for reply content, not just status field
    const statsAggregation = await Campaign.aggregate([
      { $match: { _id: { $in: campaignIds } } },
      { $unwind: "$reportData" },
      {
        $project: {
          campaignId: "$_id",
          effStatus: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [
                      { $ne: [{ $ifNull: ["$reportData.reply", ""] }, ""] },
                      { $gt: [{ $size: { $filter: { input: { $ifNull: ["$reportData.replies", []] }, as: "rep", cond: { $ne: ["$$rep", ""] } } } }, 0] }
                    ]
                  },
                  then: "replied"
                },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "replied"] }, then: "replied" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "read"] }, then: "read" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "delivered"] }, then: "delivered" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "sent"] }, then: "sent" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "failed"] }, then: "failed" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "invalid"] }, then: "invalid" },
                { case: { $eq: [{ $toLower: { $ifNull: ["$reportData.status", ""] } }, "duplicate"] }, then: "duplicate" },
              ],
              default: "pending"
            }
          }
        }
      },
      {
        $group: {
          _id: { campaignId: "$campaignId", status: "$effStatus" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build a map: campaignId -> { sent, delivered, read, replied, failed, ... }
    const statsMap: Record<string, any> = {};

    statsAggregation.forEach((item: any) => {
      const cid = item._id.campaignId.toString();
      const status = (item._id.status || "pending").toLowerCase();

      if (!statsMap[cid]) {
        statsMap[cid] = {
          total: 0, sent: 0, delivered: 0, read: 0, replied: 0,
          failed: 0, invalid: 0, pending: 0, duplicate: 0,
        };
      }

      if (statsMap[cid].hasOwnProperty(status)) {
        statsMap[cid][status] += item.count;
      }
      statsMap[cid].total += item.count;
    });

    /* =====================================================
       4. MAP CAMPAIGNS
    ===================================================== */

    const mappedCampaigns = await Promise.all(campaigns.map(async (c: any) => {
      let currentPrice = 0;
      let matchedCountry: any = null;

      const firstPhone = c.phoneNumbers?.[0] ? String(c.phoneNumbers[0]).replace(/\D/g, "") : "";

      if (firstPhone) {
        matchedCountry = enabledCountries.find((country: any) => firstPhone.startsWith(String(country.code || "")));
      }

      if (!matchedCountry && enabledCountries.length > 0) {
        matchedCountry = enabledCountries[0];
      }

      const rawCategory = String(c.templateCategory || "").trim().toUpperCase();
      const category = rawCategory === "UTILITY" || rawCategory === "AUTHENTICATION" ? rawCategory : "MARKETING";

      /* =================================================
         6. DETERMINE PRICE (UNCHANGED)
      ================================================= */

      if (matchedCountry) {
        if (category === "MARKETING") {
          currentPrice = Number(matchedCountry.priceMarketing) || Number(user.priceMarketing) || 0;
        } else if (category === "UTILITY") {
          currentPrice = Number(matchedCountry.priceUtility) || Number(user.priceUtility) || 0;
        } else if (category === "AUTHENTICATION") {
          currentPrice = Number(matchedCountry.priceAuthentication) || Number(user.priceAuthentication) || 0;
        }
      } else {
        if (category === "MARKETING") {
          currentPrice = Number(user.priceMarketing) || 0;
        } else if (category === "UTILITY") {
          currentPrice = Number(user.priceUtility) || 0;
        } else if (category === "AUTHENTICATION") {
          currentPrice = Number(user.priceAuthentication) || 0;
        } else {
          currentPrice = Number(user.pricePerMessage) || 0;
        }
      }

      /* =================================================
         6.5 CALCULATE REAL STATS + AUTO-COMPLETE
      ================================================= */

      const calculatedStats = statsMap[c._id.toString()];
      const rawStats = calculatedStats || c.stats || c.liveStats || {};

      const totalFromCalc = calculatedStats?.total || 0;
      const totalFromDB = Number(c.totalMessages || 0);
      const finalTotal = Math.max(totalFromCalc, totalFromDB);

      const finalPending = Math.max(
        0,
        finalTotal -
          (Number(rawStats.sent || 0) +
            Number(rawStats.delivered || 0) +
            Number(rawStats.read || 0) +
            Number(rawStats.replied || 0) +
            Number(rawStats.failed || 0) +
            Number(rawStats.invalid || 0) +
            Number(rawStats.duplicate || 0))
      );

      const finalLiveStats = {
        total: finalTotal,
        sent: Number(rawStats.sent || 0),
        delivered: Number(rawStats.delivered || 0),
        read: Number(rawStats.read || 0),
        replied: Number(rawStats.replied || 0),
        failed: Number(rawStats.failed || 0),
        invalid: Number(rawStats.invalid || 0),
        pending: Number(rawStats.pending || finalPending),
        duplicate: Number(rawStats.duplicate || 0),
      };

      // ✅ FIX: Default to "saved" if status is undefined/null
      let finalStatus = c.status || "saved";

      if (
        finalLiveStats.pending === 0 &&
        finalLiveStats.total > 0 &&
        (finalStatus === "running" || finalStatus === "paused")
      ) {
        try {
          await Campaign.updateOne(
            { _id: c._id },
            { $set: { status: "completed", completedAt: new Date() } }
          );
          finalStatus = "completed";
          console.log(`✅ Auto-completed campaign: ${c.name} (pending was 0)`);
        } catch (e) {
          console.error("Auto-complete failed:", e);
        }
      }

      /* =================================================
         6.6 CALCULATE totalDeducted

         ✅ FIX: If totalDeducted is 0 in DB (old campaigns
         or worker hasn't updated), calculate it from:
         delivered (combined) × pricePerMessage

         Priority:
         1. DB totalDeducted (if > 0 — includes refunds)
         2. Calculated: deliveredCombined × price
      ================================================= */

      // Delivered combined = sent + delivered + read + replied
      const deliveredCombined =
        Number(finalLiveStats.sent || 0) +
        Number(finalLiveStats.delivered || 0) +
        Number(finalLiveStats.read || 0) +
        Number(finalLiveStats.replied || 0);

      // Use locked-in price if available, otherwise use calculated price
      const priceForCalc = Number(c.pricePerMessage) > 0
        ? Number(c.pricePerMessage)
        : currentPrice;

      // ✅ FIX: If DB totalDeducted is 0, calculate from delivered × price
      let finalTotalDeducted = Number(c.totalDeducted || 0);

      if (finalTotalDeducted === 0 && deliveredCombined > 0 && priceForCalc > 0) {
        // Calculate: delivered messages × price per message
        finalTotalDeducted = deliveredCombined * priceForCalc;
        console.log(`💰 Calculated totalDeducted for ${c.name}: ${deliveredCombined} × ${priceForCalc} = ${finalTotalDeducted}`);
      }

      /* =================================================
         7. RETURN CAMPAIGN (price calculation UNCHANGED)
      ================================================= */

      return {
        ...c,
        status: finalStatus,
        currentPrice,
        totalDeducted: finalTotalDeducted,
        liveStats: finalLiveStats,
      };
    }));

    /* =====================================================
       8. RESPONSE
    ===================================================== */

    return NextResponse.json({ success: true, campaigns: mappedCampaigns });
  } catch (error) {
    console.error("Error in campaign billing:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
