/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
  parentTenantId: String,
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

    // ✅ Check if user is a sub-user to fetch parent's transactions too
    const userDoc = await User.findById(userId).select("parentTenantId").lean();
    const parentTenantId = (userDoc as any)?.parentTenantId;
    
    // Create an array of user IDs to query (own ID + parent ID if exists)
    const userIdsToQuery = [new mongoose.Types.ObjectId(userId)];
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

    // ==========================================
    // 1. CAMPAIGN + TEST MESSAGE USAGE HISTORY
    // ==========================================
    if (type === "usage") {
      const query: any = { 
        userId: { $in: userIdsToQuery }, // ✅ Query both user and parent
        type: { $in: ["campaign", "test_message"] } 
      };

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
      const query: any = { 
        userId: { $in: userIdsToQuery }, // ✅ Query both user and parent
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

    // ==========================================
    // 3. SUMMARY STATS (Total Recharged / Total Spent / Current Balance)
    // ==========================================
    let totalRecharged = 0;
    let totalSpent = 0;
    let currentBalance = 0;

    try {
      const [rechargeAgg, spendAgg, currentUserDoc] = await Promise.all([
        Transaction.aggregate([
          {
            $match: {
              userId: { $in: userIdsToQuery },
              type: "recharge",
              status: { $in: ["success", "completed"] }
            }
          },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),
        Transaction.aggregate([
          {
            $match: {
              userId: { $in: userIdsToQuery },
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

      const liveBalance = (currentUserDoc as any)?.balance;
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
