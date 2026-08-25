/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";
import mongoose from "mongoose";

const TAG_PROJECTION = {
  name: 1,
  userId: 1,
  tenantId: 1,
  isCampaignSpecific: 1,
  campaignId: 1,
  campaignName: 1,
  createdAt: 1,
};

export async function GET(req: Request) {
  try {
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("id");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 10;
    const skip = (page - 1) * limit;

    // ==========================================
    // ✅ MODE 2: Fetch Paginated Contacts for a Specific Tag (ULTRA FAST)
    // ==========================================
    if (tagId) {
      // ✅ FIX: Use an Aggregation Pipeline to get the sliced array AND the total count in ONE single query.
      // This prevents downloading 100,000 items into memory just to do .length
      const pipeline = [
        { 
          $match: { 
            _id: new mongoose.Types.ObjectId(tagId), 
            userId: new mongoose.Types.ObjectId(userId) 
          } 
        },
        {
          $project: {
            _id: 0, // We don't need the tag ID itself in the response
            // ✅ Slice the array in MongoDB to get only the 10 items we want
            contacts: { $slice: [{ $ifNull: ["$contacts", []] }, skip, limit] },
            // ✅ Use $size to count the array length in MongoDB without pulling it to Node.js
            totalContacts: { $size: { $ifNull: ["$contacts", []] } }
          }
        }
      ];

      const result = await Tag.aggregate(pipeline);
      
      if (!result || result.length === 0) {
        return NextResponse.json({ error: "Tag not found" }, { status: 404 });
      }

      const tagData = result[0];
      const contacts = tagData.contacts || [];
      const totalContacts = tagData.totalContacts || 0;

      return NextResponse.json({
        contacts,
        currentPage: page,
        totalPages: Math.ceil(totalContacts / limit),
        totalContacts
      });
    }

    // ==========================================
    // ✅ MODE 1: Fetch All Tags Metadata (FAST - NO NUMBERS LOADED)
    // ==========================================
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

    // ✅ Use .lean() for faster existence check
    const existing = await Tag.findOne(query).select("_id").lean();
    if (existing) {
      return NextResponse.json({ error: "Tag already exists" }, { status: 400 });
    }

    const tenantId =
      (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    // ✅ Create tag
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
