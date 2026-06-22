/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// ✅ Import the sync helper we created earlier
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    // Call the sync helper to push latest data to Google Sheets
    await syncCampaignToGoogleSheet(session.user.id, {
      name: campaign.name,
      reportData: campaign.reportData
    });

    return NextResponse.json({ success: true, message: "Sheet synced successfully" });
  } catch (error: any) {
    console.error("Error syncing sheet:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
