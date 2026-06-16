/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Campaign from "@/models/Campaign";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const VERIFY_TOKEN = "my_secret_token";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!mode && !token && !challenge)
      return new Response("WhatsApp Webhook Endpoint is Live ✅", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    if (mode === "subscribe" && token === VERIFY_TOKEN)
      return new Response(challenge || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

    return new Response("Forbidden", { status: 403 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    if (!value) return NextResponse.json({ success: true });

    // ==========================================
    // CONNECT DB EARLY — needed for User lookup
    // ==========================================
    await connectDB();

    // ==========================================
    // IDENTIFY USER (CRITICAL FOR MULTI-TENANT)
    // ==========================================
    const metadataPhoneNumberId = value?.metadata?.phone_number_id;
    let userId: string | null = null;
    let ownerUser: any = null; // Store full user object to use their credentials later

    if (metadataPhoneNumberId) {
      ownerUser = await User.findOne({
        whatsappPhoneNumberId: metadataPhoneNumberId,
      });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    if (!userId) {
      ownerUser = await User.findOne().sort({ _id: -1 }); // Fallback
      if (ownerUser) userId = ownerUser._id.toString();
    }

    // ==========================================
    // 1. HANDLE MESSAGE STATUSES
    // ==========================================
    if (value.statuses && value.statuses.length > 0) {
      try {
        const statusUpdate = value.statuses[0];
        let statusPhone = statusUpdate.recipient_id;
        const newStatus = statusUpdate.status;
        const errorCode = statusUpdate.errors?.[0]?.code;
        const errorSubcode = statusUpdate.errors?.[0]?.error_subcode;
        const errorDetails = String(
          statusUpdate.errors?.[0]?.error_data?.details || ""
        ).toLowerCase();

        if (statusPhone.startsWith("whatsapp:"))
          statusPhone = statusPhone.replace("whatsapp:", "");
        statusPhone = statusPhone.replace(/\+/g, "");

        if (statusPhone && newStatus) {
          const campaignQuery: any = {
            "reportData.phone": statusPhone,
            status: { $in: ["running", "completed"] },
          };
          if (userId) campaignQuery.userId = userId;

          const campaigns = await Campaign.find(campaignQuery);

          for (const camp of campaigns) {
            if (!camp.reportData) continue;
            const reportIndex = camp.reportData.findIndex(
              (r: any) => r.phone === statusPhone
            );
            if (reportIndex !== -1) {
              const currentItem = camp.reportData[reportIndex];
              let finalStatus = newStatus;

              if (newStatus === "failed" || newStatus === "undelivered") {
                const isInvalidNumber =
                  errorCode === 1005 ||
                  errorCode === 1001 ||
                  errorCode === 1006 ||
                  errorSubcode === 1005 ||
                  errorSubcode === 1001 ||
                  errorDetails.includes("not registered") ||
                  errorDetails.includes("invalid") ||
                  errorDetails.includes("not a whatsapp user") ||
                  errorDetails.includes("unable to find");
                finalStatus = isInvalidNumber ? "invalid" : "failed";
              }

              let shouldUpdate = false;
              if (finalStatus === "failed" || finalStatus === "invalid") {
                shouldUpdate = true;
              } else {
                const statusPriority: any = {
                  read: 5,
                  delivered: 4,
                  sent: 3,
                  invalid: 2,
                  failed: 1,
                  pending: 0,
                };
                if (
                  statusPriority[finalStatus] >
                  (statusPriority[currentItem.status] || 0)
                )
                  shouldUpdate = true;
              }

              if (shouldUpdate) {
                camp.reportData[reportIndex].status = finalStatus;
                camp.markModified("reportData");
                await camp.save();
                console.log(
                  `📊 Updated report status for ${statusPhone} to ${finalStatus}`
                );
              }
            }
          }
        }
      } catch (statusErr) {
        console.error("⚠️ Status Update Error:", statusErr);
      }
      return NextResponse.json({ success: true });
    }

    // ==========================================
    // 2. HANDLE INBOUND MESSAGES
    // ==========================================

    if (!value?.messages?.length) return NextResponse.json({ success: true });

    const message = value.messages[0];

    let rawPhone = message.from;
    if (rawPhone.startsWith("whatsapp:"))
      rawPhone = rawPhone.replace("whatsapp:", "");
    const phone = rawPhone.replace(/\+/g, "");

    const contactName = value.contacts?.[0]?.profile?.name || "Unknown";

    let lowerText = "";
    let textToSave = "";
    let buttonId: string | null = null;
    let messageType = "text";
    let mediaId = null;
    let isButtonReply = false;

    if (message.type === "text") {
      lowerText = message.text?.body?.toLowerCase().trim() || "";
      textToSave = message.text.body.trim();
      messageType = "text";
    } else if (message.type === "interactive") {
      const buttonReply =
        message.interactive?.button_reply || message.interactive?.list_reply;
      textToSave = buttonReply?.title?.trim() || buttonReply?.id?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = buttonReply?.id || null;
      messageType = "text";
      isButtonReply = true;
    } else if (message.type === "button") {
      textToSave =
        message.button?.text?.trim() || message.button?.payload?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = message.button?.payload || null;
      messageType = "text";
      isButtonReply = true;
    } else if (
      ["image", "video", "document", "audio", "sticker"].includes(
        message.type
      )
    ) {
      messageType = message.type;
      mediaId = message[message.type]?.id || null;
      textToSave = message[message.type]?.caption || "";
      lowerText = textToSave.toLowerCase().trim();
      if (message.type === "document")
        textToSave = message[message.type]?.filename || "Document.pdf";
    }

    if (!textToSave && !buttonId && !mediaId)
      return NextResponse.json({ success: true });

    // FIXED: Changed metaMessageId to whatsappMessageId to match your schema and outbound messages
    await Message.create({
      userId,
      phone,
      text: textToSave,
      direction: "in",
      messageType,
      mediaUrl: mediaId,
      whatsappMessageId: message.id || null, 
      contactName: contactName,
    });
    console.log(`📩 INBOUND SAVED ✔️ for ${phone}`);

    // ==========================================
    // 3. CAMPAIGN REPORT UPDATE
    // ==========================================
    if (textToSave) {
      try {
        const contextId = message?.context?.id || null;
        const targetedCampaigns: any[] = [];

        if (contextId) {
          const exactQuery: any = {
            "reportData.sentWamid": contextId,
            status: { $in: ["running", "completed"] },
          };
          if (userId) exactQuery.userId = userId;
          const exactCampaign = await Campaign.findOne(exactQuery);
          if (exactCampaign) targetedCampaigns.push(exactCampaign);
        }

        if (targetedCampaigns.length === 0) {
          const latestQuery: any = {
            "reportData.phone": phone,
            status: { $in: ["running", "completed"] },
          };
          if (userId) latestQuery.userId = userId;
          const latestCampaign = await Campaign.findOne(latestQuery).sort({
            createdAt: -1,
          });
          if (latestCampaign) targetedCampaigns.push(latestCampaign);
        }

        for (const camp of targetedCampaigns) {
          if (!camp.reportData) continue;
          let reportIndex = contextId
            ? camp.reportData.findIndex((r: any) => r.sentWamid === contextId)
            : -1;
          if (reportIndex === -1)
            reportIndex = camp.reportData.findIndex(
              (r: any) => r.phone === phone
            );

          if (reportIndex !== -1) {
            const currentReplies = camp.reportData[reportIndex].replies || [];
            if (currentReplies.length < 5) {
              currentReplies.push(textToSave);
              camp.reportData[reportIndex].replies = currentReplies;
              camp.reportData[reportIndex].status = "read";
              camp.markModified("reportData");
              await camp.save();
              console.log(
                `📩 Saved reply for ${phone} in Campaign: ${camp.name}`
              );
            }
          }
        }
      } catch (reportErr) {
        console.error("⚠️ Campaign Report Update Failed:", reportErr);
      }
    }

    // ==========================================
    // 4. WORKFLOW LOGIC
    // ==========================================
    if (messageType === "text") {
      try {
        const workflowQuery: any = {};
        if (userId) workflowQuery.userId = userId;
        const workflows = await Workflow.find(workflowQuery);

        let matchedStepId: string | null = null;
        let matchedWorkflow: any = null;

        if (buttonId) {
          const cleanButtonId = buttonId.toLowerCase().trim();
          for (const wf of workflows) {
            const hasMatch = wf.triggers?.some((t: any) => {
              const triggerKeyword = t.keyword.toLowerCase().trim();
              const mode = t.matchMode || "contains";
              if (mode === "exact") return cleanButtonId === triggerKeyword;
              else
                return (
                  cleanButtonId.includes(triggerKeyword) ||
                  triggerKeyword.includes(cleanButtonId)
                );
            });
            if (hasMatch) {
              matchedWorkflow = wf;
              matchedStepId = wf.rootStepId;
              break;
            }
          }
        } else if (lowerText) {
          for (const wf of workflows) {
            const hasMatch = wf.triggers?.some((t: any) => {
              const triggerKeyword = t.keyword.toLowerCase().trim();
              const mode = t.matchMode || "contains";
              if (mode === "exact") return lowerText === triggerKeyword;
              else return lowerText.includes(triggerKeyword);
            });
            if (hasMatch) {
              matchedWorkflow = wf;
              matchedStepId = wf.rootStepId;
              break;
            }
          }
        }

        if (matchedWorkflow && matchedStepId) {
          const step = matchedWorkflow.steps?.[matchedStepId];
          if (step?.message) {
            // ADDED: Pass the owner's specific WhatsApp credentials for multi-tenant sending
            await sendWhatsAppMessage(
              phone, 
              step, 
              ownerUser?.whatsappPhoneNumberId, 
              ownerUser?.whatsappAccessToken
            );
            
            await Message.create({
              userId,
              phone,
              text: step.message,
              direction: "out",
              messageType: "text",
            });
            console.log(`📤 OUTBOUND WORKFLOW SAVED ✔️`);
          }
        }
      } catch (workflowError) {
        console.error("⚠️ WORKFLOW CRASHED:", workflowError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ WEBHOOK CRASH:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}