/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ✅ Same inline Transaction model used by billing, send-test-message, and
// campaign-start routes. This route now reads ONLY from here for usage data
// (no live Campaign lookups), so deleting a campaign never changes history.
const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, // 'recharge' | 'test_message' | 'campaign'
  amount: Number,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  metadata: Object
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

const UserSchema = new mongoose.Schema({
  balance: Number,
}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "recharge";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    let transactions: any[] = [];
    let totalRecords = 0;

    // ==========================================
    // 1. CAMPAIGN + TEST MESSAGE USAGE HISTORY
    //    (Both read from Transaction now — permanent snapshots that
    //    survive campaign deletion, since they don't reference live
    //    Campaign documents at all.)
    // ==========================================
    if (type === "usage") {
      const query: any = { userId, type: { $in: ["campaign", "test_message"] } };

      if (search) {
        const searchNum = parseFloat(search);
        const isNum = !isNaN(searchNum);
        query.$or = [
          { description: { $regex: search, $options: "i" } },
          { "metadata.campaignName": { $regex: search, $options: "i" } },
          { "metadata.templateName": { $regex: search, $options: "i" } },
        ];
        if (isNum) {
          query.$or.push({ amount: searchNum });
        }
      }

      totalRecords = await Transaction.countDocuments(query);
      const docs = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      transactions = docs.map((t: any) => ({
        _id: t._id,
        type: t.type === "campaign" ? "usage" : "test_message",
        amount: t.amount,
        description: t.description,
        status: t.status === "completed" ? "success" : t.status,
        createdAt: t.createdAt,
        metadata: {
          campaignName: t.metadata?.campaignName,
          templateName: t.metadata?.templateName,
          phone: t.metadata?.phone,
        }
      }));

    }
    // ==========================================
    // 2. RECHARGE HISTORY (From Transaction Model)
    // ==========================================
    else {
      const query: any = { userId, type: "recharge" };

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

    // ==========================================
    // 3. SUMMARY STATS (Total Recharged / Total Spent / Current Balance)
    //    All computed from Transaction only — fully delete-proof.
    // ==========================================
    let totalRecharged = 0;
    let totalSpent = 0;
    let currentBalance = 0;

    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);

      const [rechargeAgg, spendAgg, userDoc] = await Promise.all([
        Transaction.aggregate([
          {
            $match: {
              userId: userObjectId,
              type: "recharge",
              status: { $in: ["success", "completed"] }
            }
          },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),
        Transaction.aggregate([
          {
            $match: {
              userId: userObjectId,
              type: { $in: ["campaign", "test_message"] },
              status: { $in: ["success", "completed"] }
            }
          },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),
        User.findById(userId).select("balance").lean()
      ]);

      totalRecharged = rechargeAgg[0]?.total || 0;
      totalSpent = spendAgg[0]?.total || 0;

      const liveBalance = (userDoc as any)?.balance;
      currentBalance = typeof liveBalance === "number" ? liveBalance : (totalRecharged - totalSpent);
    } catch (summaryErr) {
      console.error("Error computing transaction summary:", summaryErr);
    }

    return NextResponse.json({
      success: true,
      transactions,
      summary: {
        totalRecharged,
        totalSpent,
        currentBalance,
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
