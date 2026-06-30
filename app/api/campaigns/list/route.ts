/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();

    const { searchParams } = new URL(req.url);
    const checkName = searchParams.get("check");
    const excludeId = searchParams.get("excludeId"); // Used when editing

    // ✅ LIVE CHECK MODE: If check parameter exists, just return if it exists or not
    if (checkName !== null) {
      const query: any = { userId, name: { $regex: new RegExp(`^${checkName}$`, 'i') } };
      if (excludeId) query._id = { $ne: excludeId };
      
      const existing = await Campaign.findOne(query).lean();
      return NextResponse.json({ success: true, exists: !!existing });
    }

    // ✅ NORMAL LIST MODE
    const campaigns = await Campaign.find({ userId })
      .select("name templateName templateCategory variables phoneNumbers names mediaUrl mediaType languageCode status totalMessages sentCount failedCount totalDeducted scheduledAt createdAt reportData additionalFields additionalFieldsData")
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
