/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

    // Prevent re-starting already running campaigns
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
    // 🔴 BALANCE CHECK — BEFORE STARTING
    // ==========================================
    const pricePerMessage = user.pricePerMessage || 0;
    const currentBalance = user.balance || 0;

    if (pricePerMessage > 0 && currentBalance < pricePerMessage) {
      return NextResponse.json(
        {
          success: false,
          message: "Insufficient balance. Please recharge your account to send messages.",
        },
        { status: 402 }
      );
    }
    // ==========================================

    // Mark as running
    campaign.status = "running";
    await campaign.save();

    let sentCount = 0;
    let failedCount = 0;
    let totalDeducted = 0;

    for (let i = 0; i < campaign.phoneNumbers.length; i++) {
      const phone = campaign.phoneNumbers[i];

      // ==========================================
      // 🔴 PER-MESSAGE BALANCE CHECK IN LOOP
      // ==========================================
      if (pricePerMessage > 0) {
        const freshUser = await User.findById(userId);
        if (!freshUser) break;
        const freshBalance = freshUser.balance || 0;

        if (freshBalance < pricePerMessage) {
          console.log(`💰 Campaign stopped: balance ran out after ${sentCount} messages`);
          // Mark remaining as failed
          for (let j = i; j < campaign.phoneNumbers.length; j++) {
            if (campaign.reportData[j]) {
              campaign.reportData[j].status = "failed";
            }
            failedCount++;
          }
          break;
        }
      }
      // ==========================================

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
              image: campaign.mediaUrl.startsWith("http")
                ? { link: campaign.mediaUrl }
                : { id: campaign.mediaUrl },
            }],
          });
        } else if (campaign.mediaType === "video" && campaign.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{
              type: "video",
              video: campaign.mediaUrl.startsWith("http")
                ? { link: campaign.mediaUrl }
                : { id: campaign.mediaUrl },
            }],
          });
        } else if (campaign.mediaType === "document" && campaign.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{
              type: "document",
              document: campaign.mediaUrl.startsWith("http")
                ? { link: campaign.mediaUrl, filename: "document.pdf" }
                : { id: campaign.mediaUrl, filename: "document.pdf" },
            }],
          });
        }

        if (campaign.variables && campaign.variables.length > 0) {
          templatePayload.components.push({
            type: "body",
            parameters: campaign.variables.map((v: string) => ({
              type: "text",
              text: v || "",
            })),
          });
        }

        const messagePayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: templatePayload,
        };

        const sendRes = await fetch(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(messagePayload),
          }
        );

        const sendData = await sendRes.json();

        if (sendData.error) {
          console.error(`❌ Send error for ${phone}:`, sendData.error.message);
          failedCount++;
          if (campaign.reportData[i]) {
            campaign.reportData[i].status = "failed";
          }
          // 🔴 DO NOT DEDUCT FOR FAILED
        } else {
          sentCount++;
          if (campaign.reportData[i]) {
            campaign.reportData[i].status = "sent";
          }

          // ==========================================
          // 🔴 DEDUCT BALANCE ONLY FOR SUCCESSFUL SENDS
          // ==========================================
          if (pricePerMessage > 0) {
            const freshUser = await User.findById(userId);
            if (freshUser) {
              const bal = freshUser.balance || 0;
              freshUser.balance = Math.round((bal - pricePerMessage) * 100) / 100;
              freshUser.balance = Math.max(freshUser.balance, 0);
              await freshUser.save();
              totalDeducted = Math.round((totalDeducted + pricePerMessage) * 100) / 100;
            }
          }
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 50));
      } catch (err: any) {
        console.error(`❌ Send error for ${phone}:`, err.message);
        failedCount++;
        if (campaign.reportData[i]) {
          campaign.reportData[i].status = "failed";
        }
        // 🔴 DO NOT DEDUCT FOR ERRORS
      }
    }

    // ==========================================
    // SAVE FINAL CAMPAIGN STATE
    // ==========================================
    campaign.sentCount = sentCount;
    campaign.failedCount = failedCount;
    campaign.totalDeducted = totalDeducted;
    campaign.status = sentCount > 0 ? "completed" : "failed";
    await campaign.save();

    const finalUser = await User.findById(userId);
    const finalBalance = finalUser?.balance || 0;

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      totalDeducted,
      balance: finalBalance,
    });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}