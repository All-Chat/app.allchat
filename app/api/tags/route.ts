/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tags = await Tag.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ CHECK LIMIT BEFORE CREATING
    const limitCheck = await checkLimit(userId, "tags");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Tag limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} tags per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "tags",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
      );
    }

    const { name, isCampaignSpecific, campaignId, campaignName } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    // Check if tag already exists
    const query: any = { userId, name: name.trim().toLowerCase() };
    if (isCampaignSpecific) {
      query.isCampaignSpecific = true;
      query.campaignId = campaignId;
    }
    const existing = await Tag.findOne(query);
    if (existing) {
      return NextResponse.json({ error: "Tag already exists" }, { status: 400 });
    }

    // ==========================================
    // 🔴 MULTI-TENANT DATA ISOLATION
    // ==========================================
    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const tag = await Tag.create({
      userId,
      tenantId, // ✅ ATTACH TENANT ID FOR AGGREGATED VIEWS
      createdBy: userId, // ✅ TRACK WHO CREATED IT
      name: name.trim(),
      isCampaignSpecific: isCampaignSpecific || false,
      campaignId: isCampaignSpecific ? campaignId : null,
      campaignName: isCampaignSpecific ? campaignName : null,
    });

    // ✅ INCREMENT USAGE AFTER SUCCESSFUL CREATION
    await incrementUsage(userId, "tags");

    return NextResponse.json({ success: true, tag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
