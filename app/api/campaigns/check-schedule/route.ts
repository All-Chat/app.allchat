/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";

export async function GET() {
  try {
    await connectDB();
    const now = new Date();

    const campaignsToStart = await Campaign.find({
      status: "scheduled",
      scheduledAt: { $lte: now },
    });

    if (campaignsToStart.length === 0) {
      return NextResponse.json({ success: true, message: "No campaigns to run" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const internalSecret = process.env.INTERNAL_API_SECRET;

    for (const campaign of campaignsToStart) {
      try {
        await fetch(`${baseUrl}/api/campaigns/start`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-internal-secret": internalSecret || "", // Passes the secret so start route allows it
          },
          body: JSON.stringify({ campaignId: campaign._id.toString() }),
        });
      } catch (err) {
        console.error(`Failed to auto-start campaign ${campaign._id}`, err);
      }
    }

    return NextResponse.json({ success: true, triggered: campaignsToStart.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}