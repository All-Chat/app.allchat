/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import { Job, campaignQueue } from "@/lib/queue";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });

    const campaign = await Campaign.findById(campaignId).select("status userId").lean();
    if (!campaign || campaign.userId.toString() !== session.user.id) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    // 1. Update status to running
    await Campaign.updateOne(
      { _id: campaignId },
      { $set: { status: "running" } }
    );

    // 2. Reset any "queued" reports back to "pending" so they actually get sent!
    await CampaignReport.updateMany(
      { campaignId, status: "queued" },
      { $set: { status: "pending" } }
    );

    // 3. Create a new master job if one doesn't already exist
    const existingJob = await Job.findOne({ queue: "campaign-processing", "data.campaignId": campaignId, status: { $in: ["pending", "processing"] } }).lean();
    if (!existingJob) {
      await campaignQueue.add('process-campaign', {
        campaignId,
        userId: session.user.id,
        // Note: Credentials are refetched by the worker or passed here if available
      });
    }

    return NextResponse.json({ success: true, message: "Campaign resumed. Worker will continue sending." });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
