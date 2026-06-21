/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
// ✅ NEW: Import Google Sheet Sync Helper
import { syncCampaignToGoogleSheet } from "@/lib/googleSheetSync";

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
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    const token = user.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
    const phoneNumberId = user.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured" }, { status: 400 });

    const category = campaign.templateCategory || "MARKETING";
    const messagePrice = getPriceForCategory(user, category);
    const currentBalance = user.balance || 0;

    if (messagePrice > 0 && currentBalance < messagePrice) {
      return NextResponse.json({ success: false, message: `Insufficient balance. Required: ₹${messagePrice}, Available: ₹${currentBalance}.` }, { status: 402 });
    }

    campaign.status = "running";
    await campaign.save();

    let sentCount = campaign.sentCount || 0;
    let failedCount = campaign.failedCount || 0;
    let totalDeducted = campaign.totalDeducted || 0;

    const workerProcess = async (phone: string, campaignDoc: any, i: number, token: string, phoneNumberId: string) => {
      const currentStatus = campaignDoc.reportData[i]?.status;
      if (["sent", "delivered", "read", "failed", "invalid"].includes(currentStatus)) {
        return { status: "skipped" };
      }

      try {
        let currentVariables: string[] = [];

        // ✅ DYNAMIC VARIABLE RESOLUTION WITH AUTH FALLBACK
        if (campaignDoc.templateCategory === "AUTHENTICATION") {
          // Auth templates MUST have a code. If generateOtp is true OR variables are missing, generate securely.
          if (campaignDoc.generateOtp || currentVariables.length === 0) {
            const len = campaignDoc.otpLength || 4;
            const min = Math.pow(10, len - 1);
            const max = Math.pow(10, len) - 1;
            const otp = Math.floor(Math.random() * (max - min + 1) + min).toString();
            currentVariables = [otp];
          } else if (campaignDoc.mappedVariables?.[i]?.length > 0) {
            currentVariables = campaignDoc.mappedVariables[i];
          } else {
            currentVariables = campaignDoc.variables || [];
          }
        } else {
          // Non-Auth templates
          if (campaignDoc.mappedVariables?.[i]?.length > 0) {
            currentVariables = campaignDoc.mappedVariables[i];
          } else {
            currentVariables = campaignDoc.variables || [];
          }
        }

        // ✅ FILTER OUT EMPTY STRINGS TO PREVENT META API ERROR
        currentVariables = currentVariables.filter(v => v && String(v).trim() !== "");

        const templatePayload: any = {
          name: campaignDoc.templateName,
          language: { code: campaignDoc.languageCode || "en" },
          components: [] as any[],
        };

        if (campaignDoc.mediaType === "image" && campaignDoc.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{ type: "image", image: campaignDoc.mediaUrl.startsWith("http") ? { link: campaignDoc.mediaUrl } : { id: campaignDoc.mediaUrl } }],
          });
        } else if (campaignDoc.mediaType === "video" && campaignDoc.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{ type: "video", video: campaignDoc.mediaUrl.startsWith("http") ? { link: campaignDoc.mediaUrl } : { id: campaignDoc.mediaUrl } }],
          });
        } else if (campaignDoc.mediaType === "document" && campaignDoc.mediaUrl) {
          templatePayload.components.push({
            type: "header",
            parameters: [{ type: "document", document: campaignDoc.mediaUrl.startsWith("http") ? { link: campaignDoc.mediaUrl, filename: "document.pdf" } : { id: campaignDoc.mediaUrl, filename: "document.pdf" } }],
          });
        }

        if (currentVariables.length > 0) {
          templatePayload.components.push({
            type: "body",
            parameters: currentVariables.map((v: string) => ({ type: "text", text: v })),
          });
        }

        const messagePayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: templatePayload,
        };

        let sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(messagePayload),
        });

        let sendData = await sendRes.json();

        // ✅ DYNAMIC RETRY FOR AUTHENTICATION URL BUTTONS
        if (sendData.error?.code === 131008 && campaignDoc.templateCategory === "AUTHENTICATION" && currentVariables.length > 0) {
          console.log(`⚠️ Auth template requires URL button parameter for ${phone}. Retrying...`);
          
          const retryPayload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
              name: campaignDoc.templateName,
              language: { code: campaignDoc.languageCode || "en" },
              components: [
                {
                  type: "body",
                  parameters: currentVariables.map((v: string) => ({ type: "text", text: v })),
                },
                {
                  type: "button",
                  sub_type: "url",
                  index: 0,
                  parameters: [{ type: "text", text: currentVariables[0] }],
                },
              ],
            },
          };

          sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(retryPayload),
          });

          sendData = await sendRes.json();
        }

        if (sendData.error) {
          console.error(`❌ Send error for ${phone}:`, sendData.error.message);
          return { status: "failed" };
        } else {
          return { status: "sent", wamid: sendData?.messages?.[0]?.id || null };
        }
      } catch (err: any) {
        console.error(`❌ Send error for ${phone}:`, err.message);
        return { status: "failed" };
      }
    };

    let index = 0;
    while (index < campaign.phoneNumbers.length) {
      const liveCampaign = await Campaign.findById(campaignId);
      if (liveCampaign.status === "paused") {
        campaign.status = "paused";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        campaign.totalDeducted = totalDeducted;
        await user.save();
        await campaign.save();
        return NextResponse.json({ success: true, message: "Campaign paused", sent: sentCount });
      }
      if (liveCampaign.status === "completed" || liveCampaign.status === "stopped") {
        campaign.status = "completed";
        campaign.sentCount = sentCount;
        campaign.failedCount = failedCount;
        campaign.totalDeducted = totalDeducted;
        await user.save();
        await campaign.save();
        return NextResponse.json({ success: true, message: "Campaign stopped", sent: sentCount });
      }

      const workerPromises = [];
      const batchIndices: any[] = [];

      for (let w = 0; w < 4; w++) {
        if (index < campaign.phoneNumbers.length) {
          batchIndices.push(index);
          workerPromises.push(workerProcess(campaign.phoneNumbers[index], campaign, index, token, phoneNumberId));
          index++;
        }
      }

      const results = await Promise.all(workerPromises);
      let batchDeducted = 0;

      results.forEach((res, i) => {
        const currentI = batchIndices[i];
        if (res.status === "sent") {
          sentCount++;
          if (campaign.reportData[currentI]) {
            campaign.reportData[currentI].status = "sent";
            campaign.reportData[currentI].sentWamid = res.wamid;
            campaign.reportData[currentI].charged = true;
          }
          batchDeducted += messagePrice;
        } else if (res.status === "failed") {
          failedCount++;
          if (campaign.reportData[currentI]) {
            campaign.reportData[currentI].status = "failed";
          }
        }
      });

      if (batchDeducted > 0) {
        user.balance = Math.round((user.balance - batchDeducted) * 100) / 100;
        if (user.balance < 0) user.balance = 0;
        totalDeducted = Math.round((totalDeducted + batchDeducted) * 100) / 100;
      }

      await user.save();
      await campaign.save();
      
      // ✅ NEW: Sync to Google Sheets after every batch
      await syncCampaignToGoogleSheet(userId, {
        name: campaign.name,
        reportData: campaign.reportData
      });

      await new Promise((r) => setTimeout(r, 50));
    }

    campaign.sentCount = sentCount;
    campaign.failedCount = failedCount;
    campaign.totalDeducted = totalDeducted;
    campaign.status = sentCount > 0 ? "completed" : "failed";
    
    await user.save();
    await campaign.save();

    // ✅ NEW: Final sync to Google Sheets
    await syncCampaignToGoogleSheet(userId, {
      name: campaign.name,
      reportData: campaign.reportData
    });

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      message: "Campaign processing complete. Balance deducted dynamically.",
    });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
