/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Campaign from "@/models/Campaign";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const VERIFY_TOKEN = "my_secret_token";

const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  phone: String,
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: "Workflow" },
  currentStepId: String,
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Session = mongoose.models.Session || mongoose.model("Session", SessionSchema);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!mode && !token && !challenge) return new Response("WhatsApp Webhook Endpoint is Live ✅", { status: 200, headers: { "Content-Type": "text/plain" } });
    if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
    return new Response("Forbidden", { status: 403 });
  } catch (err) { return new Response("Error", { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return NextResponse.json({ success: true });

    await connectDB();

    const metadataPhoneNumberId = value?.metadata?.phone_number_id;
    let userId: string | null = null;
    let ownerUser: any = null;

    if (metadataPhoneNumberId) {
      ownerUser = await User.findOne({ whatsappPhoneNumberId: metadataPhoneNumberId });
      if (ownerUser) userId = ownerUser._id.toString();
    }
    if (!userId) {
      ownerUser = await User.findOne().sort({ _id: -1 });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    // 1. HANDLE STATUSES
    if (value.statuses && value.statuses.length > 0) {
      try {
        const statusUpdate = value.statuses[0];
        let statusPhone = statusUpdate.recipient_id;
        const newStatus = statusUpdate.status;
        const errorCode = statusUpdate.errors?.[0]?.code;
        const errorSubcode = statusUpdate.errors?.[0]?.error_subcode;
        const errorDetails = String(statusUpdate.errors?.[0]?.error_data?.details || "").toLowerCase();

        if (statusPhone.startsWith("whatsapp:")) statusPhone = statusPhone.replace("whatsapp:", "");
        statusPhone = statusPhone.replace(/\+/g, "");

        if (statusPhone && newStatus) {
          const campaignQuery: any = { "reportData.phone": statusPhone, status: { $in: ["running", "completed"] } };
          if (userId) campaignQuery.userId = userId;
          const campaigns = await Campaign.find(campaignQuery);

          for (const camp of campaigns) {
            if (!camp.reportData) continue;
            const reportIndex = camp.reportData.findIndex((r: any) => r.phone === statusPhone);
            if (reportIndex !== -1) {
              const currentItem = camp.reportData[reportIndex];
              let finalStatus = newStatus;
              if (newStatus === "failed" || newStatus === "undelivered") {
                const isInvalidNumber = errorCode === 1005 || errorCode === 1001 || errorCode === 1006 || errorSubcode === 1005 || errorSubcode === 1001 || errorDetails.includes("not registered") || errorDetails.includes("invalid") || errorDetails.includes("not a whatsapp user") || errorDetails.includes("unable to find");
                finalStatus = isInvalidNumber ? "invalid" : "failed";
              }
              let shouldUpdate = false;
              if (finalStatus === "failed" || finalStatus === "invalid") shouldUpdate = true;
              else {
                const statusPriority: any = { read: 5, delivered: 4, sent: 3, invalid: 2, failed: 1, pending: 0 };
                if (statusPriority[finalStatus] > (statusPriority[currentItem.status] || 0)) shouldUpdate = true;
              }
              if (shouldUpdate) {
                camp.reportData[reportIndex].status = finalStatus;
                camp.markModified("reportData");
                await camp.save();
              }
            }
          }
        }
      } catch (statusErr) { console.error("⚠️ Status Update Error:", statusErr); }
      return NextResponse.json({ success: true });
    }

    // 2. HANDLE INBOUND MESSAGES
    if (!value?.messages?.length) return NextResponse.json({ success: true });

    const message = value.messages[0];
    let rawPhone = message.from;
    if (rawPhone.startsWith("whatsapp:")) rawPhone = rawPhone.replace("whatsapp:", "");
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
      const buttonReply = message.interactive?.button_reply || message.interactive?.list_reply;
      textToSave = buttonReply?.title?.trim() || buttonReply?.id?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = buttonReply?.id || null;
      messageType = "text";
      isButtonReply = true;
    } else if (message.type === "button") {
      textToSave = message.button?.text?.trim() || message.button?.payload?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = message.button?.payload || null;
      messageType = "text";
      isButtonReply = true;
    } else if (["image", "video", "document", "audio", "sticker"].includes(message.type)) {
      messageType = message.type;
      mediaId = message[message.type]?.id || null;
      textToSave = message[message.type]?.caption || "";
      lowerText = textToSave.toLowerCase().trim();
      if (message.type === "document") textToSave = message[message.type]?.filename || "Document.pdf";
    }

    if (!textToSave && !buttonId && !mediaId) return NextResponse.json({ success: true });

    await Message.create({ userId, phone, text: textToSave, direction: "in", messageType, mediaUrl: mediaId, whatsappMessageId: message.id || null, contactName });

    // 3. CAMPAIGN REPORT UPDATE
    if (textToSave) {
      try {
        const contextId = message?.context?.id || null;
        const targetedCampaigns: any[] = [];
        if (contextId) {
          const exactQuery: any = { "reportData.sentWamid": contextId, status: { $in: ["running", "completed"] } };
          if (userId) exactQuery.userId = userId;
          const exactCampaign = await Campaign.findOne(exactQuery);
          if (exactCampaign) targetedCampaigns.push(exactCampaign);
        }
        if (targetedCampaigns.length === 0) {
          const latestQuery: any = { "reportData.phone": phone, status: { $in: ["running", "completed"] } };
          if (userId) latestQuery.userId = userId;
          const latestCampaign = await Campaign.findOne(latestQuery).sort({ createdAt: -1 });
          if (latestCampaign) targetedCampaigns.push(latestCampaign);
        }
        for (const camp of targetedCampaigns) {
          if (!camp.reportData) continue;
          let reportIndex = contextId ? camp.reportData.findIndex((r: any) => r.sentWamid === contextId) : -1;
          if (reportIndex === -1) reportIndex = camp.reportData.findIndex((r: any) => r.phone === phone);
          if (reportIndex !== -1) {
            const currentReplies = camp.reportData[reportIndex].replies || [];
            if (currentReplies.length < 5) {
              currentReplies.push(textToSave);
              camp.reportData[reportIndex].replies = currentReplies;
              camp.reportData[reportIndex].status = "read";
              camp.markModified("reportData");
              await camp.save();
            }
          }
        }
      } catch (reportErr) { console.error("⚠️ Campaign Report Update Failed:", reportErr); }
    }

    // 4. WORKFLOW STATE MACHINE & EXECUTION
    if (messageType === "text" || isButtonReply) {
      try {
        let session = await Session.findOne({ userId, phone });
        let matchedWorkflow: any = null;
        let nextStepId: string | null = null;

        if (buttonId) {
          console.log(`[Flow] Button clicked. Searching for buttonId: ${buttonId}`);
          const workflows = await Workflow.find({ userId });
          for (const wf of workflows) {
            const wfObj = wf.toObject();
              const stepsArray = Object.values(wfObj.steps || {}) as any[];
            for (const step of stepsArray) {
              if (step.buttons && step.buttons.length > 0) {
                const btn = step.buttons.find((b: any) => b.id === buttonId);
                if (btn) {
                  matchedWorkflow = wf;
                  nextStepId = btn.nextStepId;
                  console.log(`[Flow] Found button. Advancing to step: ${nextStepId}`);
                  break;
                }
              }
            }
            if (matchedWorkflow) break;
          }
        }

        if (!matchedWorkflow && session) {
          const wf = await Workflow.findById(session.workflowId);
          if (wf) {
            const wfObj = wf.toObject();
            const currentStep = wfObj.steps?.[session.currentStepId];
            if (currentStep && (currentStep.nodeType === "question" || currentStep.nodeType === "formNode")) {
              nextStepId = currentStep.buttons[0]?.nextStepId || null;
              matchedWorkflow = wf;
              console.log(`[Flow] Session active. Advancing to step: ${nextStepId}`);
            }
          }
        }

        if (!matchedWorkflow && (lowerText || buttonId)) {
          const workflowQuery: any = { userId };
          const workflows = await Workflow.find(workflowQuery);
          for (const wf of workflows) {
            const hasMatch = wf.triggers?.some((t: any) => {
              const triggerKeyword = t.keyword.toLowerCase().trim();
              const mode = t.matchMode || "contains";
              const textToCheck = lowerText || buttonId || "";
              if (mode === "exact") return textToCheck === triggerKeyword;
              else return textToCheck.includes(triggerKeyword);
            });
            if (hasMatch) {
              matchedWorkflow = wf;
              nextStepId = wf.rootStepId;
              console.log(`[Flow] Trigger matched. Starting workflow at root: ${nextStepId}`);
              break;
            }
          }
        }

        if (matchedWorkflow && nextStepId) {
          const wfObj = matchedWorkflow.toObject();
          const stepToExecute = wfObj.steps?.[nextStepId];
          
          if (stepToExecute) {
            await Session.findOneAndUpdate({ userId, phone }, { workflowId: matchedWorkflow._id, currentStepId: nextStepId }, { upsert: true, new: true });
            await executeStep(stepToExecute, phone, ownerUser);
            await Message.create({ userId, phone, text: stepToExecute.message || `[${stepToExecute.nodeType}]`, direction: "out", messageType: "text" });
          } else {
            console.log("[Flow] Flow ended (no next step). Clearing session.");
            await Session.deleteOne({ userId, phone });
          }
        } else if (session && !matchedWorkflow) {
          await Session.deleteOne({ userId, phone });
        }
      } catch (workflowError) {
        console.error("⚠️ WORKFLOW CRASHED:", workflowError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ WEBHOOK CRASH:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function executeStep(step: any, phone: string, ownerUser: any) {
  const token = ownerUser?.whatsappAccessToken || process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = ownerUser?.whatsappPhoneNumberId || process.env.META_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("❌ Missing WhatsApp credentials for user");
    return;
  }

  const apiUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };

  let payload: any = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: step.message || "..." }
  };

  // FIX: Filter out hidden 'Continue' buttons so they aren't sent to WhatsApp
  const visibleButtons = step.buttons?.filter((b: any) => !b.isHidden) || [];
  const hasButtons = visibleButtons.length > 0 && !visibleButtons.some((b: any) => b.phoneNumber || b.url);

  if (hasButtons) {
    if (visibleButtons.length <= 3) {
      const waButtons = visibleButtons.map((b: any) => ({
        type: "reply",
        reply: { id: b.id, title: (b.label || "Button").substring(0, 20) }
      }));
      payload = {
        messaging_product: "whatsapp", to: phone, type: "interactive",
        interactive: { type: "button", body: { text: step.message || "Please choose an option:" }, action: { buttons: waButtons } }
      };
    } else {
      const rows = visibleButtons.map((b: any) => ({ id: b.id, title: (b.label || "Option").substring(0, 24) }));
      payload = {
        messaging_product: "whatsapp", to: phone, type: "interactive",
        interactive: { type: "list", body: { text: step.message || "Please choose an option:" }, action: { button: "Options", sections: [{ title: "Choose an option", rows: rows }] } }
      };
    }
  } else if (step.nodeType === "callButton" || step.nodeType === "websiteButton") {
    const ctaBtn = step.buttons[0];
    payload = {
      messaging_product: "whatsapp", to: phone, type: "interactive",
      interactive: {
        type: "cta_url", body: { text: step.message || "Click below" },
        action: { name: "cta_url", parameters: { display_text: (ctaBtn.label || "Click").substring(0, 20), url: step.nodeType === "callButton" ? `tel:${ctaBtn.phoneNumber}` : ctaBtn.url } }
      }
    };
  } else if (step.nodeType === "formNode") {
    // ⚠️ CHANGE "yourdomain.com" TO YOUR ACTUAL WEBSITE URL ⚠️
    const formUrl = `https://yourdomain.com/form/${step.id}?phone=${phone}`;
    const msg = `${step.message || "Please fill out the form:"}\n\n${formUrl}`;
    payload = { messaging_product: "whatsapp", to: phone, type: "text", text: { body: msg } };
  } else if (step.nodeType === "mediaNode" && step.metadata?.mediaUrl) {
    payload = { messaging_product: "whatsapp", to: phone, type: "text", text: { body: `${step.message || ""}\n\n[Media URL: ${step.metadata.mediaUrl}]` } };
  } else if (step.nodeType === "delay") {
    return; 
  }

  try {
    console.log(`[Flow] Sending payload to WhatsApp for step: ${step.id}`);
    const res = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.error) {
      console.error("❌ WhatsApp API Error:", JSON.stringify(data.error, null, 2));
    } else {
      console.log("✅ WhatsApp message sent successfully!");
    }
  } catch (err) {
    console.error("Failed to send WhatsApp message:", err);
  }
}
