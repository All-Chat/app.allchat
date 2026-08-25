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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    // 🚀 LIVE STATS FIX: Use aggregation to calculate stats directly from reportData 
    // for ONLY the current page items. This bypasses the need for a background worker 
    // and guarantees real-time Delivered/Read counts.
    const campaigns = await Campaign.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          name: 1,
          templateName: 1,
          templateCategory: 1,
          languageCode: 1,
          status: 1,
          totalMessages: 1,
          totalDeducted: 1,
          scheduledAt: 1,
          createdAt: 1,
          // ✅ NEW: Include the sheet URLs so frontend buttons stay disabled on refresh
          sheetUrl: 1,
          standaloneSheetUrl: 1,
          // Calculate live stats directly in the DB
          liveStats: {
            $let: {
              vars: {
                counts: {
                  $reduce: {
                    input: { $ifNull: ["$reportData", []] },
                    initialValue: { replied: 0, read: 0, delivered: 0, sent: 0, failed: 0, invalid: 0, duplicate: 0 },
                    in: {
                      replied: { 
                        $add: [
                          "$$value.replied", 
                          { 
                            $cond: [
                              { $gt: [{ $size: { $ifNull: ["$$this.replies", []] } }, 0] }, 
                              1, 
                              0
                            ]
                          }
                        ]
                      },
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
              in: {
                total: { $ifNull: ["$totalMessages", 0] },
                replied: "$$counts.replied",
                read: "$$counts.read",
                delivered: "$$counts.delivered",
                sent: "$$counts.sent",
                failed: "$$counts.failed",
                invalid: "$$counts.invalid",
                duplicate: "$$counts.duplicate"
              }
            }
          }
        }
      }
    ]);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ success: true, campaigns: [], page, limit });
    }

    // Format the calculated stats to match exactly what the frontend expects
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
      const progress =
        total > 0 ? Math.min(100, Math.round(((delivered + read + sent) / total) * 100)) : 0;

      return {
        ...c,
        liveStats: {
          total,
          replied,
          read,
          delivered,
          sent,
          failed,
          invalid,
          duplicate,
          pending,
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
