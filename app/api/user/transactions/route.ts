/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  amount: Number,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  metadata: Object
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

const UserSchema = new mongoose.Schema({
  balance: Number,
  totalRecharged: Number,
  parentTenantId: String,
  priceMarketing: Number,
  priceUtility: Number,
  priceAuthentication: Number,
  pricePerMessage: Number
}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const CampaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  templateName: String,
  templateCategory: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  pricePerMessage: { type: Number, default: 0 },
  totalDeducted: { type: Number, default: 0 },
  stats: {
    replied: Number,
    read: Number,
    delivered: Number,
    sent: Number,
    failed: Number,
    invalid: Number,
    duplicate: Number,
  }
});
const Campaign = mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema);

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const userDoc = await User.findById(userObjId).select("parentTenantId").lean();
    const parentTenantId = (userDoc as any)?.parentTenantId;

    const userIdsToQuery = [userObjId];
    if (parentTenantId) {
      userIdsToQuery.push(new mongoose.Types.ObjectId(parentTenantId));
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "recharge";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    let transactions: any[] = [];
    let totalRecords = 0;

    let billingUser: any = await User.findById(userObjId).select("balance totalRecharged parentTenantId").lean();
    if (billingUser?.parentTenantId) {
      const parent = await User.findOne({ tenantId: billingUser.parentTenantId }).select("balance totalRecharged").lean();
      if (parent) billingUser = parent;
    }

    if (type === "usage") {
      // 1. Fetch test message transactions normally from DB
      const testMsgQuery: any = { 
        userId: { $in: userIdsToQuery }, 
        type: "test_message",
        status: "success"
      };
      const testMsgs = await Transaction.find(testMsgQuery).sort({ createdAt: -1 }).lean();

      const testUsages = testMsgs.map((t: any) => ({
        _id: t._id,
        type: "usage",
        amount: t.amount,
        description: "Test Message Sent",
        status: "success",
        createdAt: t.createdAt,
        metadata: {
          campaignName: "-",
          templateName: t.metadata?.templateName,
          phone: t.metadata?.phone,
        }
      }));

      // 2. Fetch Campaigns
      const campaigns = await Campaign.find({
        userId: { $in: userIdsToQuery },
        status: { $in: ["running", "paused", "completed", "failed", "stopped"] }
      }).sort({ createdAt: -1 }).lean();

      // ═══════════════════════════════════════════════════════════════
      // ✅ FIX: Calculate REAL stats from reportData using aggregation
      // This counts the ACTUAL status of each message in reportData
      // — same approach as the billing API
      // ═══════════════════════════════════════════════════════════════
      const campaignIds = campaigns.map((c: any) =>
        new mongoose.Types.ObjectId(c._id)
      );

      const statsAgg = await Campaign.aggregate([
        { $match: { _id: { $in: campaignIds } } },
        { $unwind: "$reportData" },
        {
          $group: {
            _id: { campaignId: "$_id", status: "$reportData.status" },
            count: { $sum: 1 },
          },
        },
      ]);

      // Build stats map: campaignId -> { sent, delivered, read, replied, failed, ... }
      const statsMap: Record<string, any> = {};
      statsAgg.forEach((item: any) => {
        const cid = item._id.campaignId.toString();
        const status = (item._id.status || "pending").toLowerCase();
        if (!statsMap[cid]) {
          statsMap[cid] = {
            total: 0, sent: 0, delivered: 0, read: 0, replied: 0,
            failed: 0, invalid: 0, pending: 0, duplicate: 0
          };
        }
        if (statsMap[cid].hasOwnProperty(status)) {
          statsMap[cid][status] += item.count;
        }
        statsMap[cid].total += item.count;
      });

      // ═══════════════════════════════════════════════════════════════
      // ✅ FIX: Amount = DELIVERED (combined) × price
      // deliveredCombined = sent + delivered + read + replied
      // ═══════════════════════════════════════════════════════════════
      const campaignUsages = campaigns.map((camp: any) => {
        // ✅ Use calculated stats from reportData (accurate)
        const calcStats = statsMap[camp._id.toString()] || camp.stats || {};

        // ✅ Delivered = sent + delivered + read + replied (ALL successful statuses)
        const deliveredCombined = 
          Number(calcStats.sent || 0) +
          Number(calcStats.delivered || 0) +
          Number(calcStats.read || 0) +
          Number(calcStats.replied || 0);

        const price = camp.pricePerMessage || 0;

        // ✅ Amount = delivered (combined) × price — NOT totalDeducted
        const amount = deliveredCombined * price;

        return {
          _id: camp._id,
          type: "usage",
          amount: amount,
          description: `Campaign Usage`,
          status: camp.status === "failed" ? "failed" : "success",
          createdAt: camp.createdAt,
          metadata: {
            campaignName: camp.name,
            templateName: camp.templateName,
            phone: `${deliveredCombined} delivered`,
          }
        };
      });

      let combined = [...testUsages, ...campaignUsages];

      if (search) {
        const searchNum = parseFloat(search);
        const isNum = !isNaN(searchNum);
        combined = combined.filter(t => {
          const matchesText = 
            t.description?.toLowerCase().includes(search.toLowerCase()) ||
            t.metadata?.campaignName?.toLowerCase().includes(search.toLowerCase()) ||
            t.metadata?.templateName?.toLowerCase().includes(search.toLowerCase());
          const matchesNum = isNum && t.amount === searchNum;
          return matchesText || matchesNum;
        });
      }

      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      totalRecords = combined.length;
      transactions = combined.slice(skip, skip + limit);

    } else {
      const query: any = { 
        userId: { $in: userIdsToQuery }, 
        type: "recharge" 
      };

      if (search) {
        const searchNum = parseFloat(search);
        const isNum = !isNaN(searchNum);
        query.$or = [
          { description: { $regex: search, $options: "i" } }
        ];
        if (isNum) {
          query.$or.push({ amount: searchNum });
        }
      }

      totalRecords = await Transaction.countDocuments(query);
      transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    }

    let balance = 0;
    let totalRecharged = 0;
    let totalSpent = 0;

    try {
      balance = billingUser?.balance || 0;
      totalRecharged = billingUser?.totalRecharged || 0;
      totalSpent = Math.round((totalRecharged - balance) * 100) / 100;
    } catch (summaryErr) {
      console.error("Error computing transaction summary:", summaryErr);
    }

    return NextResponse.json({
      success: true,
      transactions,
      summary: {
        totalRecharged,
        totalSpent: Math.max(totalSpent, 0),
        currentBalance: balance,
      },
      pagination: {
        totalPages: Math.ceil(totalRecords / limit),
        currentPage: page,
        totalRecords,
      },
    });
  } catch (error: any) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server Error" },
      { status: 500 }
    );
  }
}
