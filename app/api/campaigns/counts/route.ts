/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const campaigns = await Campaign.aggregate([
      { 
        $match: { 
          $expr: { $eq: [{ $toString: "$userId" }, userId] } 
        } 
      },
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
          
          liveStats: {
            total: { $ifNull: ["$totalMessages", 0] },
            replied: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: {
                    $or: [
                      { $ne: ["$$r.reply", null] },
                      { $gt: [{ $size: { $ifNull: ["$$r.replies", []] } }, 0] }
                    ]
                  }
                }
              }
            },
            read: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }
                }
              }
            },
            // ✅ STRICTLY counts only status === "delivered"
            delivered: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }
                }
              }
            },
            sent: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }
                }
              }
            },
            failed: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }
                }
              }
            },
            invalid: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }
                }
              }
            },
            duplicate: {
              $size: {
                $filter: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  cond: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }
                }
              }
            }
          }
        }
      }
    ]);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ success: true, campaigns: [] });
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
      
      const processed = replied + read + delivered + sent + failed + invalid + duplicate;
      const pending = Math.max(0, total - processed);

      return {
        ...c,
        liveStats: {
          ...ls,
          pending,
          // Keep aggregated fields for UI progress bars
          deliveredRead: delivered + read + replied,
          failedInvalid: failed + invalid,
          progress: total > 0 ? Math.round(((delivered + read + replied + sent) / total) * 100) : 0
        },
        languageCode: c.languageCode || "en",
        totalDeducted: c.totalDeducted || 0,
      };
    });

    return NextResponse.json({ success: true, campaigns: fixedCampaigns });
  } catch (error: any) {
    console.error("❌ Counts API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
