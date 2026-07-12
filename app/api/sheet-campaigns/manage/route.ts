/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SheetCampaign from "@/models/SheetCampaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { campaignId, action } = await req.json();

    if (action === "delete") {
      await SheetCampaign.findOneAndDelete({ _id: campaignId, userId: session.user.id });
      return NextResponse.json({ success: true });
    }

    if (action === "start") {
      await SheetCampaign.findOneAndUpdate(
        { _id: campaignId, userId: session.user.id },
        { status: "running", lastSynced: null }, // Reset lastSynced so it runs immediately
        { new: true }
      );
      return NextResponse.json({ success: true, message: "Campaign started! It will run continuously in the background." });
    }

    if (action === "stop") {
      await SheetCampaign.findOneAndUpdate(
        { _id: campaignId, userId: session.user.id },
        { status: "stopped" },
        { new: true }
      );
      return NextResponse.json({ success: true, message: "Campaign stopped." });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
