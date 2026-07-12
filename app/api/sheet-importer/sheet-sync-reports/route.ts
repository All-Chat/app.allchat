/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSheetCampaignReportData } from "@/lib/sheet-report-utils";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

    // ✅ Use the shared utility to guarantee UI and Sheet have EXACTLY the same data
    const reportData = await getSheetCampaignReportData(campaignId);

    if (!reportData) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    return NextResponse.json({ success: true, ...reportData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
