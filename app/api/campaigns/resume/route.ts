/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import { Job } from "@/lib/queue";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });

    // 1. Update status to running
    await Campaign.updateOne(
      { _id: campaignId, userId: session.user.id },
      { $set: { status: "running" } }
    );

    // 2. Reset any failed jobs back to pending so the worker resumes them
    await Job.updateMany(
      { queue: "campaign-processing", "data.campaignId": campaignId, status: "failed" },
      { $set: { status: "pending", lockedAt: null } }
    );

    // ✅ CRITICAL FIX: Reset any "queued" reports back to "pending" so they actually get sent!
    await CampaignReport.updateMany(
      { campaignId, status: "queued" },
      { $set: { status: "pending" } }
    );

    return NextResponse.json({ success: true, message: "Campaign resumed. Worker will continue sending." });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
