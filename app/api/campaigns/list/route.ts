/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const campaigns = await Campaign.find({ userId })
      .select(
        "name templateName templateCategory variables phoneNumbers names " +
        "mediaUrl mediaType languageCode " +
        "status totalMessages sentCount failedCount totalDeducted scheduledAt createdAt reportData"
      )
      .sort({ createdAt: -1 })
      .lean();

    const fixedCampaigns = campaigns.map((c: any) => ({
      ...c,
      languageCode: c.languageCode || "en",
      totalDeducted: c.totalDeducted || 0,
    }));

    return NextResponse.json({ success: true, campaigns: fixedCampaigns });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}