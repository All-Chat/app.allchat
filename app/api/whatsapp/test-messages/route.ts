/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status") || "all";

    const skip = (page - 1) * limit;

    // ═══════════════════════════════════════════════════════════════
    // ✅ FIX: Only fetch TEST messages (source: "test")
    // This filters OUT campaign messages and workflow messages
    // ═══════════════════════════════════════════════════════════════
    const query: any = {
      userId: session.user.id,
      source: "test",
    };

    if (search) {
      query.$or = [
        { phone: { $regex: search, $options: "i" } },
        { templateName: { $regex: search, $options: "i" } },
      ];
    }

    if (statusFilter !== "all") {
      query.status = { $regex: new RegExp(statusFilter, "i") };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments(query);

    // ✅ Stats: Only count TEST messages
    const allTestMessages = await Message.find({
      userId: session.user.id,
      source: "test",
    }).lean();

    const statsObj: any = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      total: 0,
    };

    allTestMessages.forEach((msg: any) => {
      const status = (msg.status || "").toLowerCase().trim();
      if (statsObj.hasOwnProperty(status)) {
        statsObj[status]++;
      }
      statsObj.total++;
    });

    console.log(
      "📊 Test Messages — Total:",
      statsObj.total,
      "| Sent:", statsObj.sent,
      "| Delivered:", statsObj.delivered,
      "| Read:", statsObj.read,
      "| Failed:", statsObj.failed
    );

    return NextResponse.json({
      success: true,
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: statsObj,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Test messages fetch error:", message);
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
