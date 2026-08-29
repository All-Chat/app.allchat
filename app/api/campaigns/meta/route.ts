/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    if (!userId) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) return NextResponse.json({ success: false }, { status: 400 });

    const campaign = await Campaign.findOne(
      { _id: new mongoose.Types.ObjectId(campaignId), userId: new mongoose.Types.ObjectId(userId) },
      { additionalFields: 1 } // ✅ ONLY fetch the field names, nothing else
    ).lean();

    if (!campaign) return NextResponse.json({ success: false }, { status: 404 });

    return NextResponse.json({ 
      success: true, 
      additionalFields: campaign.additionalFields || [] 
    });
  } catch (error: any) {
    console.error("Meta API Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
