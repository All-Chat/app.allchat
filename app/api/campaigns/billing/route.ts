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
      return NextResponse.json(
        { success: false },
        { status: 401 }
      );
    }

    /* =====================================================
       1. FETCH PRICING FIELDS
    ===================================================== */

    const user = await User.findById(session.user.id)
      .select(
        "enabledCountries priceMarketing priceUtility priceAuthentication pricePerMessage"
      )
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false },
        { status: 404 }
      );
    }

    /* =====================================================
       2. PRE-PROCESS COUNTRIES
    ===================================================== */

    const enabledCountries = (
      user.enabledCountries || []
    ).map((c: any) => ({ ...c }));

    enabledCountries.sort(
      (a: any, b: any) =>
        String(b.code || "").length -
        String(a.code || "").length
    );

    /* =====================================================
       3. FETCH CAMPAIGNS
    ===================================================== */

    const campaigns = await Campaign.find({
      userId: session.user.id,
    })
      .sort({ createdAt: -1 })
      .select({
        _id: 1,
        name: 1,
        templateName: 1,
        templateCategory: 1,
        status: 1,
        totalMessages: 1,
        sentCount: 1,
        failedCount: 1,
        totalDeducted: 1,
        pricePerMessage: 1,
        scheduledAt: 1,
        createdAt: 1,
        updatedAt: 1,
        startedAt: 1,
        completedAt: 1,
        liveStats: 1,
        stats: 1,          // ✅ ADDED: Also fetch stats field
        phoneNumbers: { $slice: 1 },
      })
      .lean();

    /* =====================================================
       4. ✅ CALCULATE REAL STATS FROM reportData

       This is the FIX — instead of trusting liveStats
       (which may be wrong/stale in the DB), we count the
       ACTUAL statuses from reportData array using
       MongoDB aggregation.

       This matches what the Reports page does.
    ===================================================== */

    const campaignIds = campaigns.map((c: any) =>
      new mongoose.Types.ObjectId(c._id)
    );

    // Aggregate: count each status from reportData for all campaigns
    const statsAggregation = await Campaign.aggregate([
      { $match: { _id: { $in: campaignIds } } },
      { $unwind: "$reportData" },
      {
        $group: {
          _id: {
            campaignId: "$_id",
            status: "$reportData.status",
          },
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
          total: 0,
          sent: 0,
          delivered: 0,
          read: 0,
          replied: 0,
          failed: 0,
          invalid: 0,
          pending: 0,
          duplicate: 0,
        };
      }

      if (statsMap[cid].hasOwnProperty(status)) {
        statsMap[cid][status] += item.count;
      }
      statsMap[cid].total += item.count;
    });

    /* =====================================================
       5. MAP CAMPAIGNS — use calculated stats
    ===================================================== */

    const mappedCampaigns = campaigns.map((c: any) => {
      let currentPrice = 0;
      let matchedCountry: any = null;

      /* --- Get first phone number --- */
      const firstPhone = c.phoneNumbers?.[0]
        ? String(c.phoneNumbers[0]).replace(/\D/g, "")
        : "";

      /* --- Match country --- */
      if (firstPhone) {
        matchedCountry = enabledCountries.find(
          (country: any) =>
            firstPhone.startsWith(String(country.code || ""))
        );
      }

      if (!matchedCountry && enabledCountries.length > 0) {
        matchedCountry = enabledCountries[0];
      }

      /* --- Determine category --- */
      const rawCategory = String(
        c.templateCategory || ""
      ).trim().toUpperCase();

      const category =
        rawCategory === "UTILITY" || rawCategory === "AUTHENTICATION"
          ? rawCategory
          : "MARKETING";

      /* --- Determine price --- */
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

      /* --- Use locked-in price if available --- */
      const finalPrice = Number(c.pricePerMessage) > 0
        ? Number(c.pricePerMessage)
        : currentPrice;

      /* ═══════════════════════════════════════════════════
         ✅ FIX: Use CALCULATED stats from reportData
         Priority:
         1. Calculated from reportData (most accurate)
         2. stats field from DB
         3. liveStats field from DB
         4. Fallback to sentCount/failedCount
      ═══════════════════════════════════════════════════ */

      const calculatedStats = statsMap[c._id.toString()];

      // Use calculated stats if available, otherwise fall back
      const rawStats =
        calculatedStats ||
        c.stats ||
        c.liveStats ||
        {};

      const totalFromCalc = calculatedStats?.total || 0;
      const totalFromDB = Number(c.totalMessages || 0);

      // Use the larger of calculated total vs totalMessages
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

      return {
        ...c,
        currentPrice: finalPrice,
        totalDeducted: Number(c.totalDeducted || 0),
        // ✅ Override liveStats with CALCULATED stats
        liveStats: finalLiveStats,
      };
    });

    /* =====================================================
       6. RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,
      campaigns: mappedCampaigns,
    });
  } catch (error) {
    console.error("Error in campaign billing:", error);
    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}
