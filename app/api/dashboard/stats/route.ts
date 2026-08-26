/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport"; // ✅ NEW
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMinPrice } from "@/lib/billing";
import mongoose from "mongoose";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const userObjId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjId).select("balance totalRecharged pricePerMessage whatsappAccessToken whatsappPhoneNumberId parentTenantId isTenant tenantId");
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    const userIdsArray: mongoose.Types.ObjectId[] = [userObjId];
    let tenantIdToSearch = null;

    if (user.isTenant) tenantIdToSearch = user.tenantId || user._id.toString();
    else if (user.parentTenantId) tenantIdToSearch = user.parentTenantId;

    if (tenantIdToSearch) {
      const tenantUser = await User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("_id").lean();
      if (tenantUser && !userIdsArray.some((id) => id.equals(tenantUser._id))) userIdsArray.push(tenantUser._id);
      const subUsers = await User.find({ parentTenantId: tenantIdToSearch }).select("_id").lean();
      subUsers.forEach((u) => { if (!userIdsArray.some((id) => id.equals(u._id))) userIdsArray.push(u._id); });
    }

    const totalChatsAgg = await Message.aggregate([
      { $match: { userId: { $in: userIdsArray }, direction: "in" } },
      { $group: { _id: "$phone" } },
      { $count: "totalChats" },
    ]);

    const totalWorkflows = await Workflow.countDocuments({ userId: userObjId });
    const totalCampaigns = await Campaign.countDocuments({ userId: userObjId });

    const activeCampaigns = await Campaign.aggregate([
      { $match: { userId: userObjId, status: { $in: ["running", "scheduled", "completed"] } } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $project: {
          name: 1, status: 1,
          total: { $ifNull: ["$totalMessages", 0] },
          sentCount: { $ifNull: ["$sentCount", 0] },
          totalDeducted: { $ifNull: ["$totalDeducted", 0] },
        },
      },
    ]);

    // ✅ INSTANT QUERY: Fetch real-time read counts for dashboard charts
    const activeCampaignIds = activeCampaigns.map(c => new mongoose.Types.ObjectId(c._id));
    const readStatsAgg = await CampaignReport.aggregate([
      { $match: { campaignId: { $in: activeCampaignIds }, status: "read" } },
      { $group: { _id: "$campaignId", count: { $sum: 1 } } }
    ]);

    const readCountMap: Record<string, number> = {};
    readStatsAgg.forEach(item => readCountMap[item._id.toString()] = item.count);

    const campaignData = activeCampaigns.map((camp: any) => {
      const total = camp.total || 0;
      const readCount = readCountMap[camp._id.toString()] || 0;
      const sentCount = camp.sentCount || 0;
      return {
        _id: camp._id, name: camp.name, status: camp.status, total,
        sentCount, readCount,
        readPercent: total > 0 ? Math.round((readCount / total) * 100) : 0,
        progress: total > 0 ? Math.round((sentCount / total) * 100) : 0,
        totalDeducted: camp.totalDeducted || 0,
      };
    });

    let billingUser: any = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId }).select("balance totalRecharged priceMarketing priceUtility priceAuthentication");
      if (parent) billingUser = parent;
    }

    const balance = billingUser?.balance || 0;
    const totalRecharged = billingUser?.totalRecharged || 0;
    const totalSpent = Math.round((totalRecharged - balance) * 100) / 100;
    const minPrice = getMinPrice(billingUser);
    const canSendMessage = minPrice === 0 || balance >= minPrice;

    let phoneDetails: any = {
      displayPhoneNumber: "Not Configured", verifiedName: "Add Credentials in Settings",
      qualityRating: "N/A", status: "DISCONNECTED", messagingLimitTier: "N/A", twoFactorEnabled: "N/A",
    };

    if (user.whatsappAccessToken && user.whatsappPhoneNumberId) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${user.whatsappPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating,status,whatsapp_business_manager_messaging_limit,is_pin_enabled`, { headers: { Authorization: `Bearer ${user.whatsappAccessToken}` }, cache: "no-store", signal: controller.signal });
        clearTimeout(timeoutId);
        const metaJson = await metaRes.json();
        if (metaRes.ok) {
          phoneDetails = {
            displayPhoneNumber: metaJson.display_phone_number || "Not Available", verifiedName: metaJson.verified_name || "Not Available",
            qualityRating: metaJson.quality_rating || "N/A", status: metaJson.status || "N/A",
            messagingLimitTier: metaJson.whatsapp_business_manager_messaging_limit || "N/A",
            twoFactorEnabled: metaJson.is_pin_enabled === true ? true : metaJson.is_pin_enabled === false ? false : "N/A",
          };
        }
      } catch (err: any) { /* Ignore errors, keep default */ }
    }

    return NextResponse.json({
      success: true,
      totalChats: totalChatsAgg[0]?.totalChats || 0,
      totalWorkflows, totalCampaigns,
      campaigns: campaignData,
      phoneDetails,
      billing: { balance, totalRecharged, totalSpent: Math.max(totalSpent, 0), canSendMessage },
    });
  } catch (error: any) {
    console.error("Dashboard Stats Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
