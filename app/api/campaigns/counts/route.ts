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


    // ✅ 1. Check Authentication
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" }, 
        { status: 401 }
      );
    }

    await connectDB();


    // ✅ 2. Fetch Campaigns (Extremely Fast)
    // We only select the summary fields, completely ignoring the 10,000 number arrays.
    // This reduces payload size by 99%, making it load instantly.
    const campaigns = await Campaign.find({ userId })
      .select(
        "name templateName templateCategory variables mediaUrl mediaType " +
        "languageCode status totalMessages sentCount failedCount totalDeducted " +
        "scheduledAt createdAt additionalFields generateOtp otpLength"
      )
      .sort({ createdAt: -1 })
      .lean();


    // ✅ 3. Format Stats to Match Frontend Expectations
    // We calculate "Pending" and "Progress" here so the frontend doesn't have to.
    const fixedCampaigns = campaigns.map((c: any) => {
      const total = c.totalMessages || 0;
      const sent = c.sentCount || 0;
      const failed = c.failedCount || 0;
      const pending = Math.max(0, total - (sent + failed));
      
      return {
        ...c,
        liveStats: {
          deliveredRead: sent, // Delivered uses the same DB count as Sent for the UI
          sent: sent,
          failedInvalid: failed, // This ensures the "Failed" count shows up perfectly
          pending: pending,
          total: total,
          progress: total > 0 ? Math.round(((sent + failed) / total) * 100) : 0
        },
        languageCode: c.languageCode || "en",
        totalDeducted: c.totalDeducted || 0,
      };
    });

    return NextResponse.json({ success: true, campaigns: fixedCampaigns });

  } catch (error: any) {
    console.error("❌ Counts API Error:", error);
    return NextResponse.json(
      { success: false, message: error.message }, 
      { status: 500 }
    );
  }
}
