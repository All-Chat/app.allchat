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
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });

    await Campaign.updateOne(
      { _id: campaignId, userId: session.user.id },
      { $set: { status: "paused" } }
    );

    return NextResponse.json({ success: true, message: "Campaign paused. Worker will stop picking up jobs." });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
