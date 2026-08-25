/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
require('dotenv').config({ path: '.env.local' });

import { connectDB } from '../lib/mongodb';
import Campaign from '../models/Campaign';
import { Job, Cache } from '../lib/queue';
import mongoose from 'mongoose';
import { pipeline } from 'stream/promises';

connectDB().then(async () => {
  console.log('✅ Report Worker connected to MongoDB');
  startReportWorker();
});

async function startReportWorker() {
  console.log('🚀 Worker started for queue: report-processing');
  while (true) {
    try {
      const job = await Job.findOneAndUpdate(
        { queue: 'report-processing', $or: [{ status: "pending" }, { status: "processing", lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }] },
        { $set: { status: "processing", lockedAt: new Date() } },
        { sort: { createdAt: 1 }, returnDocument: "after" }
      ).lean();

      if (job) {
        console.log(`▶️ Processing report job ${job.name} (${job._id})`);
        try {
          let result;
          if (job.name === 'refresh-report-cache') {
            result = await refreshReportCache(job.data);
          }
          await Job.updateOne({ _id: job._id }, { $set: { status: "completed", result } });
          console.log(`✅ Completed report job ${job.name}`);
        } catch (err: any) {
          console.error(`❌ Failed report job:`, err.message);
          await Job.updateOne({ _id: job._id }, { $set: { status: "failed", error: err.message } });
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error('Polling error for report-processing:', err);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function normalizePhoneExpr(phoneFieldExpr: any) {
  return {
    $let: {
      vars: {
        digitsArr: {
          $map: {
            input: { $regexFindAll: { input: { $toString: { $ifNull: [phoneFieldExpr, ""] } }, regex: "\\d" } },
            as: "m",
            in: "$$m.match",
          },
        },
      },
      in: {
        $let: {
          vars: {
            digitsStr: {
              $reduce: {
                input: "$$digitsArr",
                initialValue: "",
                in: { $concat: ["$$value", "$$this"] },
              },
            },
          },
          in: {
            $substrCP: [
              "$$digitsStr",
              { $max: [0, { $subtract: [{ $strLenCP: "$$digitsStr" }, 10] }] },
              10,
            ],
          },
        },
      },
    },
  };
}

async function refreshReportCache(data: any) {
  const { campaignId, userId, cacheKey, lockKey } = data;
  try {
    const isRepliedExpr = {
      $or: [
        { $ne: [{ $ifNull: ["$$r.reply", ""] }, ""] },
        { $gt: [ { $size: { $filter: { input: { $ifNull: ["$$r.replies", []] }, as: "rep", cond: { $ne: ["$$rep", ""] } } } }, 0 ] },
        { $in: [normalizePhoneExpr("$$r.phone"), "$repliedPhonesSet"] }
      ]
    };

    const baseStatusExpr = {
      $switch: {
        branches: [
          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, then: "read" },
          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }, then: "delivered" },
          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, then: "sent" },
          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }, then: "failed" },
          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }, then: "invalid" },
          { case: { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }, then: "duplicate" },
        ],
        default: "pending"
      }
    };

    const effectiveStatusExpr = {
      $cond: {
        if: isRepliedExpr,
        then: "replied",
        else: baseStatusExpr
      }
    };

    const pipeline: any[] = [
      { $match: { _id: new mongoose.Types.ObjectId(campaignId), userId: new mongoose.Types.ObjectId(userId) } },
      {
        $addFields: {
          campPhonesNormalized: {
            $setUnion: [
              {
                $map: {
                  input: { $ifNull: ["$reportData", []] },
                  as: "r",
                  in: normalizePhoneExpr("$$r.phone"),
                },
              },
              [],
            ],
          },
        },
      },
      {
        $lookup: {
          from: "messages",
          let: { camp_createdAt: "$createdAt", user_id: "$userId", camp_phones: "$campPhonesNormalized" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$user_id"] },
                    { $eq: ["$direction", "in"] },
                    { $gte: ["$createdAt", "$$camp_createdAt"] },
                  ],
                },
              },
            },
            { $addFields: { normalizedPhone: normalizePhoneExpr("$phone") } },
            { $match: { $expr: { $in: ["$normalizedPhone", "$$camp_phones"] } } },
            { $project: { _id: 0, normalizedPhone: 1, text: 1, messageType: 1 } },
          ],
          as: "inboundMsgs",
        },
      },
      {
        $addFields: {
          repliedPhonesSet: { $setUnion: ["$inboundMsgs.normalizedPhone", []] },
        },
      },
      {
        $addFields: {
          campaignStats: {
            total: { $size: { $ifNull: ["$reportData", []] } },
            replied: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: isRepliedExpr } } },
            read: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "read"] }, { $not: isRepliedExpr } ] } } } },
            delivered: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "delivered"] }, { $not: isRepliedExpr } ] } } } },
            sent: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "sent"] }, { $not: isRepliedExpr } ] } } } },
            failed: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "failed"] }, { $not: isRepliedExpr } ] } } } },
            invalid: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "invalid"] }, { $not: isRepliedExpr } ] } } } },
            duplicate: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "duplicate"] }, { $not: isRepliedExpr } ] } } } },
            pending: { $size: { $filter: { input: { $ifNull: ["$reportData", []] }, as: "r", cond: { $and: [ { $or: [ { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "pending"] }, { $eq: [{ $toLower: { $ifNull: ["$$r.status", ""] } }, "queued"] }, { $eq: [{ $ifNull: ["$$r.status", ""] }, ""] } ] }, { $not: isRepliedExpr } ] } } } },
          }
        }
      },
      {
        $project: {
          name: 1,
          templateName: 1,
          additionalFields: 1,
          languageCode: 1,
          totalDeducted: 1,
          campaignStats: 1,
          mappedReportData: {
            $map: {
              input: { $ifNull: ["$reportData", []] },
              as: "r",
              in: {
                $let: {
                  vars: {
                    matchedMsgs: {
                      $filter: {
                        input: { $ifNull: ["$inboundMsgs", []] },
                        as: "msg",
                        cond: { $eq: ["$$msg.normalizedPhone", normalizePhoneExpr("$$r.phone")] }
                      }
                    }
                  },
                  in: {
                    $mergeObjects: [
                      "$$r",
                      {
                        status: effectiveStatusExpr,
                        replies: {
                          $filter: {
                            input: {
                              $concatArrays: [
                                { $ifNull: ["$$r.replies", []] },
                                {
                                  $map: {
                                    input: "$$matchedMsgs",
                                    as: "msg",
                                    in: {
                                      $cond: {
                                        if: { $ne: [{ $ifNull: ["$$msg.text", ""] }, ""] },
                                        then: "$$msg.text",
                                        else: {
                                          $cond: {
                                            if: { $ne: [{ $ifNull: ["$$msg.messageType", ""] }, ""] },
                                            then: { $concat: ["[", "$$msg.messageType", "]"] },
                                            else: ""
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              ]
                            },
                            as: "rep",
                            cond: { $ne: ["$$rep", ""] }
                          }
                        }
                    }
                  ]
                }
              }
            }
          },
        },
      },
  }];

    const result = await Campaign.aggregate(pipeline);
    if (!result || result.length === 0) return { success: false, message: "Campaign not found" };

    const campaign = result[0];
    await Cache.updateOne(
      { key: cacheKey },
      { $set: { value: JSON.stringify({ stats: campaign.campaignStats, data: campaign.mappedReportData, meta: { name: campaign.name, templateName: campaign.templateName, additionalFields: campaign.additionalFields, languageCode: campaign.languageCode, totalDeducted: campaign.totalDeducted } }), expireAt: new Date(Date.now() + 3600 * 1000) } },
      { upsert: true }
    );
    await Cache.deleteOne({ key: lockKey }).catch(() => {});
    return { success: true };

  } catch (error: any) {
    console.error("❌ Report Worker Error:", error);
    await Cache.deleteOne({ key: lockKey }).catch(() => {});
    return { success: false, message: error.message };
  }
}

process.on('SIGTERM', async () => {
  console.log('Report Worker process shutting down...');
  process.exit(0);
});
