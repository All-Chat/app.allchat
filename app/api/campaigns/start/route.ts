/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { campaignId } = await req.json();

    if (!campaignId) {
      return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== userId) {
      return NextResponse.json({ success: false, message: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status === "running") {
      return NextResponse.json({ success: false, message: "Campaign is already running" }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const token = user.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
    const phoneNumberId = user.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return NextResponse.json(
        { success: false, message: "WhatsApp credentials not configured" },
        { status: 400 }
      );
    }

    // ==========================================
    // 🔴 CATEGORY-BASED INITIAL BALANCE CHECK
    // ==========================================
    const category = campaign.templateCategory || "MARKETING";
    const messagePrice = getPriceForCategory(user, category);
    const currentBalance = user.balance || 0;

    if (messagePrice > 0 && currentBalance < messagePrice) {
      return NextResponse.json(
        {
          success: false,
          message: `Insufficient balance for ${category} messages. Required: ₹${messagePrice}, Available: ₹${currentBalance}. Please recharge your account.`,
        },
        { status: 402 }
      );
    }
    // ==========================================

    // Mark as running
    campaign.status = "running";
    await campaign.save();

    let sentCount = campaign.sentCount || 0;
    let failedCount = campaign.failedCount || 0;

    for (let i = 0; i < campaign.phoneNumbers.length; i++) {
      const phone = campaign.phoneNumbers[i];

      const liveCampaign = await Campaign.findById(campaignId);
      if (liveCampaign.status === "paused") {
        console.log("⏸️ Campaign paused by user. Saving progress...");
        campaign.status = "paused";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        await campaign.save();
        return NextResponse.json({ success: true, message: "Campaign paused", sent: sentCount });
      }
      if (liveCampaign.status === "completed" || liveCampaign.status === "stopped") {
        console.log("⏹️ Campaign stopped by user.");
        campaign.status = "completed";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        await campaign.save();
        return NextResponse.json({ success: true, message: "Campaign stopped", sent: sentCount });
      }

      const currentStatus = campaign.reportData[i]?.status;
      if (["sent", "delivered", "read", "failed", "invalid"].includes(currentStatus)) {
        continue; 
      }

      try {
        const templatePayload: any = {
          name: campaign.templateName,
          language: {
            code: campaign.languageCode || "en",
          },
          components: [] as any[],
        };

        if (campaign.mediaType === "image" && campaign.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{
              type: "image",
              image: campaign.mediaUrl.startsWith("http") ? { link: campaign.mediaUrl } : { id: campaign.mediaUrl },
            }],
          });
        } else if (campaign.mediaType === "video" && campaign.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{
              type: "video",
              video: campaign.mediaUrl.startsWith("http") ? { link: campaign.mediaUrl } : { id: campaign.mediaUrl },
            }],
          });
        } else if (campaign.mediaType === "document" && campaign.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{
              type: "document",
              document: campaign.mediaUrl.startsWith("http") ? { link: campaign.mediaUrl, filename: "document.pdf" } : { id: campaign.mediaUrl, filename: "document.pdf" },
            }],
          });
        }

        if (campaign.variables && campaign.variables.length > 0) {
          templatePayload.components.push({
            type: "body",
            parameters: campaign.variables.map((v: string) => ({ type: "text", text: v || "" })),
          });
        }

        const messagePayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: templatePayload,
        };

        const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(messagePayload),
        });

        const sendData = await sendRes.json();

        if (sendData.error) {
          console.error(`❌ Send error for ${phone}:`, sendData.error.message);
          failedCount++;
          if (campaign.reportData[i]) {
            campaign.reportData[i].status = "failed";
          }
        } else {
          sentCount++;
          if (campaign.reportData[i]) {
            campaign.reportData[i].status = "sent";
            campaign.reportData[i].sentWamid = sendData.message_id || null; // Save WAMID
            campaign.reportData[i].charged = false; // Explicitly set to false. Webhook will charge on 'delivered'
          }
        }

        await new Promise((r) => setTimeout(r, 50));
      } catch (err: any) {
        console.error(`❌ Send error for ${phone}:`, err.message);
        failedCount++;
        if (campaign.reportData[i]) {
          campaign.reportData[i].status = "failed";
        }
      }
    }

    campaign.sentCount = sentCount;
    campaign.failedCount = failedCount;
    campaign.status = sentCount > 0 ? "completed" : "failed";
    await campaign.save();

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      message: "Campaign processing complete. Billing will update dynamically via webhook on delivery.",
    });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
