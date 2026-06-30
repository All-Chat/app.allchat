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

    // ✅ If already running, return success (prevents 400 race condition error)
    if (campaign.status === "running") {
      return NextResponse.json({ success: true, message: "Already running." });
    }

    // If it's not paused, we can't resume it
    if (campaign.status !== "paused") {
      return NextResponse.json({ success: false, message: `Cannot resume a campaign that is ${campaign.status}.` }, { status: 400 });
    }

    // Update to running
    await Campaign.updateOne({ _id: campaignId }, { status: "running" });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
