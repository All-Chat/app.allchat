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

    // ✅ If already paused, return success
    if (campaign.status === "paused") {
      return NextResponse.json({ success: true, message: "Already paused." });
    }

    // ✅ FIX: If already finished, return success gracefully
    if (["completed", "stopped", "failed"].includes(campaign.status)) {
      return NextResponse.json({ success: true, message: "Campaign is already finished." });
    }

    // ✅ FIX: If it's "saved" or "running", allow pausing.
    // If it's "saved", this will force the start loop to cancel itself as soon as it begins.
    if (["running", "saved", "scheduled"].includes(campaign.status)) {
      await Campaign.updateOne({ _id: campaignId }, { status: "paused" });
      return NextResponse.json({ success: true });
    }

    // Fallback error
    return NextResponse.json({ success: false, message: `Cannot pause a campaign that is ${campaign.status}.` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
