/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    
    const campaign = await Campaign.findOne({ _id: campaignId, userId: session.user.id });
    if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });

    // ✅ If already completed/stopped, return success (prevents 400 race condition error)
    if (["completed", "stopped", "failed"].includes(campaign.status)) {
      return NextResponse.json({ success: true, message: "Already stopped." });
    }

    // If it's not running or paused, we can't stop it
    if (!["running", "paused"].includes(campaign.status)) {
      return NextResponse.json({ success: false, message: `Cannot stop a campaign that is ${campaign.status}.` }, { status: 400 });
    }

    // Mark as completed so the background loop breaks
    await Campaign.updateOne({ _id: campaignId }, { status: "completed" });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
