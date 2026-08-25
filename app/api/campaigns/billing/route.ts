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
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);

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

    const enabledCountries = (user.enabledCountries || []).map((c: any) => ({ ...c }));
    enabledCountries.sort((a: any, b: any) => String(b.code || "").length - String(a.code || "").length);

    /* =====================================================
       2. FETCH CAMPAIGNS & CALCULATE STATS NATIVELY IN MONGODB
    ===================================================== */
    const campaigns = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(session.user.id) } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          name: 1, templateName: 1, templateCategory: 1, status: 1,
          totalMessages: 1, sentCount: 1, failedCount: 1, totalDeducted: 1,
          pricePerMessage: 1, scheduledAt: 1, createdAt: 1, updatedAt: 1,
          startedAt: 1, completedAt: 1,
          // ✅ FIX: $slice in aggregation requires the array expression as the first argument
          phoneNumbers: { $slice: [{ $ifNull: ["$phoneNumbers", []] }, 1] },
          liveStats: {
            $let: {
              vars: {
                counts: {
                  $reduce: {
                    input: { $ifNull: ["$reportData", []] },
                    initialValue: { replied: 0, read: 0, delivered: 0, sent: 0, failed: 0, invalid: 0, duplicate: 0, pending: 0 },
                    in: {
                      $let: {
                        vars: {
                          isReplied: {
                            $or: [
                              { $ne: [{ $ifNull: ["$$this.reply", ""] }, ""] },
                              { $gt: [{ $size: { $ifNull: ["$$this.replies", []] } }, 0] }
                            ]
                          },
                          stat: { $toLower: { $ifNull: ["$$this.status", ""] } }
                        },
                        in: {
                          replied: { $add: ["$$value.replied", { $cond: { if: "$$isReplied", then: 1, else: 0 } }] },
                          read: { $add: ["$$value.read", { $cond: { if: { $and: [{ $eq: ["$$stat", "read"] }, { $not: "$$isReplied" }] }, then: 1, else: 0 } }] },
                          delivered: { $add: ["$$value.delivered", { $cond: { if: { $and: [{ $eq: ["$$stat", "delivered"] }, { $not: "$$isReplied" }] }, then: 1, else: 0 } }] },
                          sent: { $add: ["$$value.sent", { $cond: { if: { $and: [{ $eq: ["$$stat", "sent"] }, { $not: "$$isReplied" }] }, then: 1, else: 0 } }] },
                          failed: { $add: ["$$value.failed", { $cond: { if: { $and: [{ $eq: ["$$stat", "failed"] }, { $not: "$$isReplied" }] }, then: 1, else: 0 } }] },
                          invalid: { $add: ["$$value.invalid", { $cond: { if: { $and: [{ $eq: ["$$stat", "invalid"] }, { $not: "$$isReplied" }] }, then: 1, else: 0 } }] },
                          duplicate: { $add: ["$$value.duplicate", { $cond: { if: { $and: [{ $eq: ["$$stat", "duplicate"] }, { $not: "$$isReplied" }] }, then: 1, else: 0 } }] },
                          pending: { $add: ["$$value.pending", { $cond: { if: { $and: [{ $not: "$$isReplied" }, { $or: [{ $eq: ["$$stat", "pending"] }, { $eq: ["$$stat", "queued"] }, { $eq: ["$$stat", ""] }] }] }, then: 1, else: 0 } }] }
                        }
                      }
                    }
                  }
                }
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
                pending: "$$counts.pending"
              }
            }
          }
        }
      }
    ]);

    /* =====================================================
       3. MAP CAMPAIGNS & PREPARE BULK UPDATE
    ===================================================== */
    const bulkUpdateOps: any[] = [];

    const mappedCampaigns = campaigns.map((c: any) => {
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

      if (matchedCountry) {
        if (category === "MARKETING") currentPrice = Number(matchedCountry.priceMarketing) || Number(user.priceMarketing) || 0;
        else if (category === "UTILITY") currentPrice = Number(matchedCountry.priceUtility) || Number(user.priceUtility) || 0;
        else if (category === "AUTHENTICATION") currentPrice = Number(matchedCountry.priceAuthentication) || Number(user.priceAuthentication) || 0;
      } else {
        if (category === "MARKETING") currentPrice = Number(user.priceMarketing) || 0;
        else if (category === "UTILITY") currentPrice = Number(user.priceUtility) || 0;
        else if (category === "AUTHENTICATION") currentPrice = Number(user.priceAuthentication) || 0;
        else currentPrice = Number(user.pricePerMessage) || 0;
      }

      const rawStats = c.liveStats || {};
      const finalTotal = Number(rawStats.total || c.totalMessages || 0);

      // Recalculate pending to be absolutely sure
      const totalProcessed = 
        Number(rawStats.sent || 0) +
        Number(rawStats.delivered || 0) +
        Number(rawStats.read || 0) +
        Number(rawStats.replied || 0) +
        Number(rawStats.failed || 0) +
        Number(rawStats.invalid || 0) +
        Number(rawStats.duplicate || 0);
        
      const finalPending = Math.max(0, finalTotal - totalProcessed);

      const finalLiveStats = {
        ...rawStats,
        total: finalTotal,
        pending: finalPending
      };

      let finalStatus = c.status || "saved";

      if (
        finalLiveStats.pending === 0 &&
        finalLiveStats.total > 0 &&
        (finalStatus === "running" || finalStatus === "paused")
      ) {
        finalStatus = "completed";
        // ✅ FIX: Queue update for bulk operation instead of blocking the loop
        bulkUpdateOps.push({
          updateOne: {
            filter: { _id: c._id },
            update: { $set: { status: "completed", completedAt: new Date() } }
          }
        });
      }

      const deliveredCombined =
        Number(finalLiveStats.sent || 0) +
        Number(finalLiveStats.delivered || 0) +
        Number(finalLiveStats.read || 0) +
        Number(finalLiveStats.replied || 0);

      const priceForCalc = Number(c.pricePerMessage) > 0 ? Number(c.pricePerMessage) : currentPrice;

      let finalTotalDeducted = Number(c.totalDeducted || 0);
      if (finalTotalDeducted === 0 && deliveredCombined > 0 && priceForCalc > 0) {
        finalTotalDeducted = deliveredCombined * priceForCalc;
      }

      return {
        ...c,
        status: finalStatus,
        currentPrice,
        totalDeducted: finalTotalDeducted,
        liveStats: finalLiveStats,
      };
    });

    // ✅ FIX: Execute all status updates in one single DB trip
    if (bulkUpdateOps.length > 0) {
      await Campaign.bulkWrite(bulkUpdateOps);
    }

    return NextResponse.json({ success: true, campaigns: mappedCampaigns });
  } catch (error) {
    console.error("Error in campaign billing:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
