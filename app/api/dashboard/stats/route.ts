/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMinPrice } from "@/lib/billing";

export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Stats are scoped to the logged-in user (Sub-user sees their own campaigns/chats)
    const totalChats = (await Message.distinct("phone", { userId })).length;
    const totalWorkflows = await Workflow.countDocuments({ userId });
    const totalCampaigns = await Campaign.countDocuments({ userId });

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

    // Fetch the logged-in user (needed for WhatsApp credentials)
    const user = await User.findById(userId).select("balance totalRecharged pricePerMessage whatsappAccessToken whatsappPhoneNumberId parentTenantId");

    // ==========================================
    // 🔴 SHARED WALLET LOGIC
    // ==========================================
    // If sub-user, fetch the parent tenant for billing info
    let billingUser = user;
    if (user?.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId }).select("balance totalRecharged priceMarketing priceUtility priceAuthentication");
      if (parent) {
        billingUser = parent;
      }
    }

    const balance = billingUser?.balance || 0;
    const totalRecharged = billingUser?.totalRecharged || 0;
    const totalSpent = Math.round((totalRecharged - balance) * 100) / 100;
    
    const minPrice = getMinPrice(billingUser);
    const canSendMessage = minPrice === 0 || balance >= minPrice;

    // ==========================================
    // ✅ FETCH WHATSAPP PHONE NUMBER DETAILS FROM META
    // ==========================================
    // Note: We use the logged-in user's credentials (user), not billingUser
    let phoneDetails: any = {
      displayPhoneNumber: "Not Configured",
      verifiedName: "Add Credentials in Settings",
      qualityRating: "N/A",
      status: "DISCONNECTED",
      messagingLimitTier: "N/A",
      twoFactorEnabled: "N/A",
    };

    if (user?.whatsappAccessToken && user?.whatsappPhoneNumberId) {
      try {
        // FIX: Using v21.0 (Latest stable) and is_pin_enabled for 2FA
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${user.whatsappPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating,status,whatsapp_business_manager_messaging_limit,is_pin_enabled`,
          {
            headers: { Authorization: `Bearer ${user.whatsappAccessToken}` },
            cache: "no-store"
          }
        );

        const metaJson = await metaRes.json();

        if (metaRes.ok) {
          phoneDetails = {
            displayPhoneNumber: metaJson.display_phone_number || "Not Available",
            verifiedName: metaJson.verified_name || "Not Available",
            qualityRating: metaJson.quality_rating || "N/A",
            status: metaJson.status || "N/A",
            messagingLimitTier: metaJson.whatsapp_business_manager_messaging_limit || "N/A",
            twoFactorEnabled: metaJson.is_pin_enabled === true ? true : (metaJson.is_pin_enabled === false ? false : "N/A"),
          };
        } else {
          // If it fails, it's usually because the token lacks 'whatsapp_business_management' permission
          phoneDetails = {
            displayPhoneNumber: "Error",
            verifiedName: metaJson?.error?.message || "Token lacks whatsapp_business_management permission",
            qualityRating: "N/A",
            status: "ERROR",
            messagingLimitTier: "N/A",
            twoFactorEnabled: "N/A",
          };
        }
      } catch (err) {
        phoneDetails = {
          displayPhoneNumber: "Error",
          verifiedName: "Fetch Failed",
          qualityRating: "N/A",
          status: "ERROR",
          messagingLimitTier: "N/A",
          twoFactorEnabled: "N/A",
        };
      }
    }

    return NextResponse.json({
      success: true,
      totalChats,
      totalWorkflows,
      totalCampaigns,
      campaigns: campaignData,
      phoneDetails,
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
