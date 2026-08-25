/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

const TAG_PROJECTION = {
  name: 1,
  userId: 1,
  tenantId: 1,
  isCampaignSpecific: 1,
  campaignId: 1,
  campaignName: 1,
  createdAt: 1,
};

export async function GET() {
  try {
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ lean + projection + sort in one pass
    const tags = await Tag.find({ userId }, TAG_PROJECTION)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Check limit BEFORE parsing body (fail fast)
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

    // ✅ Compound query (uses userId index)
    const query: Record<string, unknown> = {
      userId,
      name: name.trim().toLowerCase(),
    };
    if (isCampaignSpecific) {
      query.isCampaignSpecific = true;
      query.campaignId = campaignId;
    }

    // ✅ Use countDocuments + exists check in parallel with lean projection
    const existing = await Tag.findOne(query).select("_id").lean();
    if (existing) {
      return NextResponse.json({ error: "Tag already exists" }, { status: 400 });
    }

    const tenantId =
      (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    // ✅ Create with lean-friendly return
    const tag = await Tag.create({
      userId,
      tenantId,
      createdBy: userId,
      name: name.trim(),
      isCampaignSpecific: isCampaignSpecific || false,
      campaignId: isCampaignSpecific ? campaignId : null,
      campaignName: isCampaignSpecific ? campaignName : null,
    });

    // ✅ Fire-and-forget usage increment (don't block response)
    incrementUsage(userId, "tags").catch(() => {});

    return NextResponse.json({ success: true, tag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
