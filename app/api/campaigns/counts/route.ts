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

    // 🚀 KEY FIX: We no longer walk `reportData` (huge embedded array) in the
    // aggregation. Instead we read the pre-computed `stats` sub-document that
    // is updated atomically whenever a message status changes (see helper below).
    //
    // This turns an O(campaigns × report_entries) scan into a pure indexed
    // read — effectively instant even with millions of report entries.
    //
    // Only the fields the list view actually needs are projected. No
    // phoneNumbers / names / additionalFieldsData / reportData loaded at all.
    const campaigns = await Campaign.find(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        name: 1,
        templateName: 1,
        templateCategory: 1,
        languageCode: 1,
        status: 1,
        totalMessages: 1,
        totalDeducted: 1,
        scheduledAt: 1,
        createdAt: 1,
        stats: 1, // pre-computed counters
      }
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ success: true, campaigns: [], page, limit });
    }

    const fixedCampaigns = campaigns.map((c: any) => {
      const s = c.stats || {};
      const total = c.totalMessages || 0;
      const replied = s.replied || 0;
      const read = s.read || 0;
      const delivered = s.delivered || 0;
      const sent = s.sent || 0;
      const failed = s.failed || 0;
      const invalid = s.invalid || 0;
      const duplicate = s.duplicate || 0;

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
