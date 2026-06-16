/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // 2. Get total unique phones that have chatted FOR THIS USER
    const totalChats = (await Message.distinct("phone", { userId })).length;

    // 3. Get total workflows FOR THIS USER
    const totalWorkflows = await Workflow.countDocuments({ userId });

    // 4. Get total campaigns FOR THIS USER
    const totalCampaigns = await Campaign.countDocuments({ userId });

    // 5. Get recent active campaigns FOR THIS USER
    const activeCampaigns = await Campaign.find({
      userId: userId,
      status: { $in: ["running", "scheduled", "completed"] }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

    const campaignData = activeCampaigns.map((camp: any) => {
      const total = camp.reportData?.length || 0;
      const readCount = camp.reportData?.filter((r: any) => r.status === 'read').length || 0;
      const deliveredCount = camp.reportData?.filter((r: any) => r.status === 'delivered').length || 0;
      const sentCount = camp.reportData?.filter((r: any) =>
        ['sent', 'delivered', 'read'].includes(r.status)
      ).length || 0;

      return {
        _id: camp._id,
        name: camp.name,
        status: camp.status,
        total,
        sentCount,
        readCount,
        readPercent: total > 0 ? Math.round((readCount / total) * 100) : 0,
        progress: total > 0 ? Math.round((sentCount / total) * 100) : 0,
        totalDeducted: camp.totalDeducted || 0,
      };
    });

    // ==========================================
    // 🔴 BILLING INFO FROM USER
    // ==========================================
    const user = await User.findById(userId).select("balance totalRecharged pricePerMessage");
    const balance = user?.balance || 0;
    const totalRecharged = user?.totalRecharged || 0;
    const totalSpent = Math.round((totalRecharged - balance) * 100) / 100;
    const pricePerMessage = user?.pricePerMessage || 0;
    const canSendMessage = pricePerMessage === 0 || balance >= pricePerMessage;

    return NextResponse.json({
      success: true,
      totalChats,
      totalWorkflows,
      totalCampaigns,
      campaigns: campaignData,
      // ==========================================
      // 🔴 BILLING DATA
      // ==========================================
      billing: {
        balance,
        totalRecharged,
        totalSpent: Math.max(totalSpent, 0),
        canSendMessage,
      },
    });
  } catch (error: any) {
    console.error("Dashboard Stats Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}