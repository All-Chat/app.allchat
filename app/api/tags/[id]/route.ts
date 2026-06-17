/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Tag from "@/models/Tag";
import Contact from "@/models/Contact";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🔥 MANUAL URL PARSING (Bypasses Next.js params bug)
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const id = parts[parts.length - 1];

    const { name, isCampaignSpecific, campaignId, campaignName } = await req.json();
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }

    const tag = await Tag.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { 
        name: name.trim(), 
        isCampaignSpecific: isCampaignSpecific || false,
        campaignId: isCampaignSpecific ? campaignId : null,
        campaignName: isCampaignSpecific ? campaignName : null
      },
      { new: true }
    );

    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, tag });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🔥 MANUAL URL PARSING (Bypasses Next.js params bug)
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const id = parts[parts.length - 1];

    const tag = await Tag.findOneAndDelete({ _id: id, userId: session.user.id });
    
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Also remove this tag from any contacts that had it
    await Contact.updateMany(
      { userId: session.user.id, tags: tag.name },
      { $pull: { tags: tag.name } }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
