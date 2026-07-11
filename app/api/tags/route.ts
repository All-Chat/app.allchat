/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";
import { countsQueue } from "@/lib/queue";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cacheKey = `tags_cache_${userId}`;
    const redisClient = await countsQueue.client;

    // 1. ✅ CHECK REDIS CACHE FIRST
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      // Return instantly in 1ms
      return NextResponse.json({ tags: JSON.parse(cachedData) });
    }

    // 2. ✅ CACHE MISS: Fetch from DB
    await connectDB();
    
    // ✅ PERFORMANCE: Use .lean() and .select() to get ONLY the fields needed.
    // This prevents downloading large unused fields like __v.
    const tags = await Tag.find({ userId })
      .select("_id name isCampaignSpecific campaignId campaignName createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Cache the result for 1 hour (Tags rarely change, we will clear on POST)
    await (redisClient as any).set(cacheKey, JSON.stringify(tags), 'EX', 3600);

    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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

    await connectDB();

    // Check if tag already exists
    const query: any = { userId, name: name.trim().toLowerCase() };
    if (isCampaignSpecific) {
      query.isCampaignSpecific = true;
      query.campaignId = campaignId;
    }
    
    const existing = await Tag.findOne(query).lean();
    if (existing) {
      return NextResponse.json({ error: "Tag already exists" }, { status: 400 });
    }

    // ==========================================
    // 🔴 MULTI-TENANT DATA ISOLATION
    // ==========================================
    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const tag = await Tag.create({
      userId,
      tenantId, 
      createdBy: userId, 
      name: name.trim(),
      isCampaignSpecific: isCampaignSpecific || false,
      campaignId: isCampaignSpecific ? campaignId : null,
      campaignName: isCampaignSpecific ? campaignName : null,
    });

    // ✅ INCREMENT USAGE AFTER SUCCESSFUL CREATION
    await incrementUsage(userId, "tags");

    // ✅ INVALIDATE REDIS CACHE so the next GET request fetches the fresh data
    const redisClient = await countsQueue.client;
    await redisClient.del(`tags_cache_${userId}`).catch(() => {});

    return NextResponse.json({ success: true, tag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
