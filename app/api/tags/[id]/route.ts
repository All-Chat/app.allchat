/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ✅ Reuse projection across handlers
const TAG_PROJECTION = {
  name: 1,
  userId: 1,
  tenantId: 1,
  isCampaignSpecific: 1,
  campaignId: 1,
  campaignName: 1,
  createdAt: 1,
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ✅ Parallelize independent async ops
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tag = await Tag.findById(id, TAG_PROJECTION).lean();
    if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

    return NextResponse.json({ tag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, isCampaignSpecific, campaignId, campaignName } = await req.json();

    // ✅ Single atomic update, returns lean doc
    const updatedTag = await Tag.findOneAndUpdate(
      { _id: id, userId },
      {
        ...(name !== undefined && { name: name.trim() }),
        isCampaignSpecific: isCampaignSpecific || false,
        campaignId: isCampaignSpecific ? campaignId : null,
        campaignName: isCampaignSpecific ? campaignName : null,
      },
      { new: true, projection: TAG_PROJECTION, lean: true }
    ).lean();

    if (!updatedTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, tag: updatedTag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const deletedTag = await Tag.findOneAndDelete({ _id: id, userId }).lean();
    if (!deletedTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
