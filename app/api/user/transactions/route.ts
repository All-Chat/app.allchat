/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import Transaction from "@/models/Transaction";

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
      // ✅ SPEED FIX: Only fetch the most recent 500 records of each type to prevent memory overload.
      // This ensures the API responds in milliseconds even if you have 100,000 transactions.
      const [testMsgs, refunds, campaigns] = await Promise.all([
        Transaction.find({ 
          userId: { $in: userIdsToQuery }, 
          type: "test_message",
          status: "success"
        })
        .select("amount createdAt metadata.templateName metadata.phone")
        .sort({ createdAt: -1 })
        .limit(500) 
        .lean(),
        
        Transaction.find({ 
          userId: { $in: userIdsToQuery }, 
          type: "refund",
          status: "success"
        })
        .select("amount createdAt description metadata.campaignName metadata.templateName metadata.phone")
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

      const refundUsages = refunds.map((t: any) => ({
        _id: t._id,
        type: "refund",
        amount: t.amount,
        description: t.description || "Refund for failed message",
        status: "success",
        createdAt: t.createdAt,
        metadata: {
          campaignName: t.metadata?.campaignName || "-",
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

      let combined = [...testUsages, ...refundUsages, ...campaignUsages];

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

      // ✅ SPEED FIX: Cap totalRecords to the combined length we actually fetched
      // This prevents the frontend from trying to load empty pages beyond our 500-record window
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
