/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ PERFORMANCE: Use lean() for fast read
    const tag = await Tag.findById(params.id).lean();
    if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

    return NextResponse.json({ tag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, isCampaignSpecific, campaignId, campaignName } = await req.json();

    const updatedTag = await Tag.findOneAndUpdate(
      { _id: params.id, userId },
      { 
        name: name?.trim(), 
        isCampaignSpecific: isCampaignSpecific || false,
        campaignId: isCampaignSpecific ? campaignId : null,
        campaignName: isCampaignSpecific ? campaignName : null
      },
      { new: true }
    );

    if (!updatedTag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

    return NextResponse.json({ success: true, tag: updatedTag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const deletedTag = await Tag.findOneAndDelete({ _id: params.id, userId });
    if (!deletedTag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
