/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import Transaction from "@/models/Transaction";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

// ✅ NEW: Outgoing message charge description patterns
// These match what the webhook writes in chargeOutgoingMessage() descriptions
const MESSAGE_CHARGE_DESCRIPTIONS = [
  "outgoing message charge",
  "workflow/automated message charge",
  "workflow",
  "form message charge",
  "form inactivity message charge",
  "form abandonment message charge",
  "form completion message charge",
  "form restart message charge",
  "form validation message charge",
  "form initiation message charge",
  "ai agent message charge",
];

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "recharge";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    // Check if the request is coming from an admin managing a specific user
    const adminKey = req.headers.get("x-admin-key");
    const requestedUserId = searchParams.get("userId");

    let targetUserId: string | undefined = session?.user?.id;

    // If admin key and userId are provided, verify admin and override targetUserId
    if (adminKey && requestedUserId) {
      if (adminKey !== ADMIN_SECRET) {
        return NextResponse.json({ success: false, message: "Invalid Admin Key" }, { status: 403 });
      }
      targetUserId = requestedUserId;
    }

    if (!targetUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const userObjId = new mongoose.Types.ObjectId(targetUserId);

    const userDoc = await User.findById(userObjId).select("parentTenantId").lean();
    const parentTenantId = (userDoc as any)?.parentTenantId;

    const userIdsToQuery = [userObjId];
    if (parentTenantId) {
      userIdsToQuery.push(new mongoose.Types.ObjectId(parentTenantId));
    }

    let transactions: any[] = [];
    let totalRecords = 0;

    let billingUser: any = await User.findById(userObjId).select("balance totalRecharged parentTenantId").lean();
    if (billingUser?.parentTenantId) {
      const parent = await User.findOne({ tenantId: billingUser.parentTenantId }).select("balance totalRecharged").lean();
      if (parent) billingUser = parent;
    }

    // =========================================================================
    // USAGE TAB — Test messages + Campaign usage (UNCHANGED)
    // =========================================================================
    if (type === "usage") {
      const [testMsgs, campaigns] = await Promise.all([
        Transaction.find({
          userId: { $in: userIdsToQuery },
          type: "test_message",
          status: "success"
        })
        .select("amount createdAt metadata.templateName metadata.phone")
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),

        Campaign.find({
          userId: { $in: userIdsToQuery },
          status: { $in: ["running", "paused", "completed", "failed", "stopped"] }
        })
        .select("name templateName status createdAt pricePerMessage liveStats totalDeducted")
        .sort({ createdAt: -1 })
        .lean()
      ]);

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

      const campaignUsages = campaigns.map((camp: any) => {
        const ls = camp.liveStats || {};
        const deliveredCombined =
          Number(ls.sent || 0) +
          Number(ls.delivered || 0) +
          Number(ls.read || 0) +
          Number(ls.replied || 0);

        const amount = Number(camp.totalDeducted || 0);

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
    }

    // =========================================================================
    // ✅ NEW: MESSAGES TAB — Outgoing non-template message charges
    // =========================================================================
    else if (type === "messages") {
      const query: any = {
        userId: { $in: userIdsToQuery },
        type: { $in: ["debit", "charge", "usage"] },
        description: { $regex: MESSAGE_CHARGE_DESCRIPTIONS.join("|"), $options: "i" }
      };

      if (search) {
        const searchNum = parseFloat(search);
        const isNum = !isNaN(searchNum);
        query.$or = [
          { description: { $regex: search, $options: "i" } },
          { "metadata.phone": { $regex: search, $options: "i" } }
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

    // =========================================================================
    // RECHARGE TAB (UNCHANGED)
    // =========================================================================
    else {
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

    // =========================================================================
    // SUMMARY — includes message charges in totalSpent
    // =========================================================================
    let balance = 0;
    let totalRecharged = 0;
    let totalSpent = 0;

    try {
      balance = billingUser?.balance || 0;
      totalRecharged = billingUser?.totalRecharged || 0;

      // ✅ Compute totalSpent as actual sum of all debits (more accurate than recharged-balance)
      const spentAgg = await Transaction.aggregate([
        { $match: { userId: { $in: userIdsToQuery }, type: { $in: ["debit", "charge", "usage", "test_message", "campaign"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]);
      const spentFromAgg = spentAgg[0]?.total || 0;
      const spentFromBalance = Math.round((totalRecharged - balance) * 100) / 100;

      // Use whichever is larger to avoid negative or zero when refunds happened
      totalSpent = Math.max(spentFromAgg, spentFromBalance, 0);
    } catch (summaryErr) {
      console.error("Error computing transaction summary:", summaryErr);
      // Fallback to old method
      balance = billingUser?.balance || 0;
      totalRecharged = billingUser?.totalRecharged || 0;
      totalSpent = Math.round((totalRecharged - balance) * 100) / 100;
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
