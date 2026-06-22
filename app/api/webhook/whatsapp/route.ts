/* ============================================================================
   WHATSAPP WEBHOOK ROUTE
   ----------------------------------------------------------------------------
   Handles incoming WhatsApp messages, statuses, workflow logic, 
   conversational forms, and dynamic campaign reporting.
   ============================================================================ */

/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

// Database Models
import Message from "@/models/Message";
import Campaign from "@/models/Campaign";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import Session from "@/models/Session";
import Contact from "@/models/Contact";
import Tag from "@/models/Tag";
import OptNumber from "@/models/OptNumber";
import Form from "@/models/Form";
import FormResponse from "@/models/FormResponse";

// Utilities
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";
import { getPriceForCategory } from "@/lib/billing";
// ✅ NEW: Import Google Sheet Sync Helpers
import { syncCampaignToGoogleSheet, syncTestMessageToGoogleSheet } from "@/lib/googleSheetSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VERIFY_TOKEN = "my_secret_token";

/* ============================================================================
   GLOBAL INACTIVITY TIMERS MAP
   ---------------------------------------------------------------------------- */
const workflowTimers = new Map<string, NodeJS.Timeout>();

const clearWorkflowTimer = (phone: string) => {
  const timerId = workflowTimers.get(phone);
  if (timerId) {
    clearInterval(timerId);
    workflowTimers.delete(phone);
  }
};

const startWorkflowInactivityTimer = (
  phone: string,
  userId: string,
  workflowId: string,
  ownerUser: any
) => {
  clearWorkflowTimer(phone);

  (async () => {
    try {
      await connectDB();
      const wf = await Workflow.findById(workflowId);
      if (!wf || !wf.steps) return;
      
      const inactivityNode = Object.values(wf.steps).find(
        (s: any) => s.stepType === "inactivity_node"
      ) as any;
      
      if (!inactivityNode) return;

      const delaySeconds = inactivityNode.delaySeconds || 30;
      const repeatCount = inactivityNode.repeatCount || 1;
      const message = inactivityNode.message || "Are you still there?";
      let sentCount = 0;

      const timerId = setInterval(async () => {
        try {
          const session = await Session.findOne({ phone, userId });
          if (!session || session.formId) {
            clearWorkflowTimer(phone);
            return;
          }
          if (sentCount < repeatCount) {
            await sendWhatsAppMessage(
              phone,
              { message, stepType: "text" },
              ownerUser?.whatsappPhoneNumberId,
              ownerUser?.whatsappAccessToken
            );
            sentCount++;
          } else {
            clearWorkflowTimer(phone);
          }
        } catch (err) {
          console.error("Inactivity timer execution error:", err);
          clearWorkflowTimer(phone);
        }
      }, delaySeconds * 1000);

      workflowTimers.set(phone, timerId);
    } catch (err) {
      console.error("Failed to start inactivity timer:", err);
    }
  })();
};

const startFormInactivityTimer = (
  phone: string,
  userId: string,
  formId: string,
  fieldIndex: number,
  field: any,
  form: any,
  ownerUser: any
) => {
  if (field.delaySeconds > 0 && field.repeatCount > 0 && field.delayMessage) {
    let remindersSent = 0;
    const intervalId = setInterval(async () => {
      try {
        await connectDB();
        const checkSession = await Session.findOne({ phone, userId });
        if (!checkSession || !checkSession.formId || checkSession.formFieldIndex !== fieldIndex) {
          clearInterval(intervalId);
          return;
        }
        if (remindersSent < field.repeatCount) {
          await sendWhatsAppMessage(
            phone,
            { message: field.delayMessage, stepType: "text" },
            ownerUser?.whatsappPhoneNumberId,
            ownerUser?.whatsappAccessToken
          );
          remindersSent++;
        } else {
          clearInterval(intervalId);
          const abandonmentStep = {
            message: form.abandonmentMessage || "It seems you are busy right now. We have paused the form. Click the button below whenever you are ready to start over.",
            stepType: "message",
            buttons: [{ id: `restart_form_${formId}`, label: "🔄 Restart Form", nextStepId: null }],
          };
          await sendWhatsAppMessage(phone, abandonmentStep, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
          checkSession.formId = null;
          checkSession.formFieldIndex = 0;
          await checkSession.save();
          await FormResponse.updateOne({ formId, phone, status: "incomplete" }, { $set: { status: "abandoned" } });
        }
      } catch (err) {
        console.error("Form timer error:", err);
        clearInterval(intervalId);
      }
    }, field.delaySeconds * 1000);
  }
};

/* ============================================================================
   GET ROUTE - Webhook Verification
   ============================================================================ */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    
    if (!mode && !token && !challenge) {
      return new Response("WhatsApp Webhook Endpoint is Live ✅", { 
        status: 200, 
        headers: { "Content-Type": "text/plain" } 
      });
    }
    
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge || "", { 
        status: 200, 
        headers: { "Content-Type": "text/plain" } 
      });
    }
    
    return new Response("Forbidden", { status: 403 });
  } catch (err) {
    console.error("GET webhook error:", err);
    return new Response("Error", { status: 500 });
  }
}

/* ============================================================================
   POST ROUTE - Main Webhook Handler
   ============================================================================ */
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

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION A: HANDLE MESSAGE STATUSES & DYNAMIC BILLING REFUNDS
       ══════════════════════════════════════════════════════════════════════════ */
    if (value.statuses && value.statuses.length > 0) {
      try {
        const statusUpdate = value.statuses[0];
        const wamid = statusUpdate.id;
        
        let statusPhone = statusUpdate.recipient_id;
        const newStatus = statusUpdate.status;
        const errorCode = statusUpdate.errors?.[0]?.code;
        const errorSubcode = statusUpdate.errors?.[0]?.error_subcode;
        const errorDetails = String(statusUpdate.errors?.[0]?.error_data?.details || "").toLowerCase();

        if (statusPhone.startsWith("whatsapp:")) statusPhone = statusPhone.replace("whatsapp:", "");
        statusPhone = statusPhone.replace(/\+/g, "");

        if (wamid && statusPhone && newStatus) {
          const campaignQuery: any = {
            "reportData.sentWamid": wamid,
            status: { $in: ["running", "paused", "completed"] },
          };
          if (userId) campaignQuery.userId = userId;

          const campaigns = await Campaign.find(campaignQuery);

          for (const camp of campaigns) {
            if (!camp.reportData) continue;

            const reportIndex = camp.reportData.findIndex((r: any) => r.sentWamid === wamid);
            if (reportIndex === -1) continue;

            const currentItem = camp.reportData[reportIndex];
            let finalStatus = newStatus;

            if (newStatus === "failed" || newStatus === "undelivered") {
              const isInvalidNumber =
                errorCode === 1005 || errorCode === 1001 || errorCode === 1006 ||
                errorSubcode === 1005 || errorSubcode === 1001 ||
                errorDetails.includes("not registered") || errorDetails.includes("invalid") ||
                errorDetails.includes("not a whatsapp user") || errorDetails.includes("unable to find");
              finalStatus = isInvalidNumber ? "invalid" : "failed";
            }

            const statusPriority: any = {
              read: 5, delivered: 4, sent: 3, invalid: 2, failed: 1, pending: 0,
            };

            if (statusPriority[finalStatus] > (statusPriority[currentItem.status] || 0)) {
              let balanceAdjustment = 0;
              const cost = ownerUser ? getPriceForCategory(ownerUser, camp.templateCategory || "MARKETING") : 0;

              if ((finalStatus === "failed" || finalStatus === "invalid") && currentItem.charged) {
                balanceAdjustment += cost;
                currentItem.charged = false;
                camp.totalDeducted = Math.max(0, (camp.totalDeducted || 0) - cost);
              }

              currentItem.status = finalStatus;
              camp.markModified("reportData");
              await camp.save();

              if (balanceAdjustment !== 0 && userId) {
                await User.findByIdAndUpdate(userId, { $inc: { balance: balanceAdjustment } });
              }
            }
          }

          // ✅ NEW: Update Test Message Status in Google Sheet
          if (userId) {
            try {
              await syncTestMessageToGoogleSheet(userId, {
                phone: statusPhone,
                status: newStatus,
              }, false); // false = only update if row exists, don't create new
            } catch (e) { console.error("Sheet sync error on status:", e); }
          }
        }
      } catch (statusErr) {
        console.error("⚠️ Status Update Error:", statusErr);
      }
      return NextResponse.json({ success: true });
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION B: HANDLE INBOUND MESSAGES
       ══════════════════════════════════════════════════════════════════════════ */
    if (!value?.messages?.length) return NextResponse.json({ success: true });

    const message = value.messages[0];
    let rawPhone = message.from;
    if (rawPhone.startsWith("whatsapp:")) rawPhone = rawPhone.replace("whatsapp:", "");
    const phone = rawPhone.replace(/\+/g, "");

    clearWorkflowTimer(phone);
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
    } else if (message.type === "interactive") {
      const buttonReply = message.interactive?.button_reply || message.interactive?.list_reply;
      textToSave = buttonReply?.title?.trim() || buttonReply?.id?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = buttonReply?.id || null;
      isButtonReply = true;
    } else if (message.type === "button") {
      textToSave = message.button?.text?.trim() || message.button?.payload?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = message.button?.payload || null;
      isButtonReply = true;
    } else if (["image", "video", "document", "audio", "sticker"].includes(message.type)) {
      messageType = message.type;
      mediaId = message[message.type]?.id || null;
      textToSave = message[message.type]?.caption || "";
      lowerText = textToSave.toLowerCase().trim();
      if (message.type === "document") textToSave = message[message.type]?.filename || "Document.pdf";
    }

    if (!textToSave && !buttonId && !mediaId) return NextResponse.json({ success: true });

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

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION C: CONVERSATIONAL FORM LOGIC
       ══════════════════════════════════════════════════════════════════════════ */
    const activeSession = await Session.findOne({ phone, userId });

    if (activeSession && activeSession.formId) {
      try {
        const form = await Form.findById(activeSession.formId);
        if (!form) {
          await Session.deleteOne({ _id: activeSession._id });
          return NextResponse.json({ success: true });
        }
        
        const currentField = form.fields[activeSession.formFieldIndex];
        
        await FormResponse.findOneAndUpdate(
          { formId: form._id, phone, status: "incomplete" },
          { $set: { [`data.${currentField.label}`]: textToSave } },
          { upsert: true, new: true }
        );
        
        const nextIndex = activeSession.formFieldIndex + 1;
        
        if (nextIndex < form.fields.length) {
          activeSession.formFieldIndex = nextIndex;
          await activeSession.save();
          const nextField = form.fields[nextIndex];
          await sendWhatsAppMessage(phone, { message: nextField.label, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
          startFormInactivityTimer(phone, userId!, form._id.toString(), nextIndex, nextField, form, ownerUser);
        } else {
          await FormResponse.updateOne({ formId: form._id, phone, status: "incomplete" }, { $set: { status: "complete" } });
          activeSession.formId = null;
          activeSession.formFieldIndex = 0;
          await activeSession.save();
          await sendWhatsAppMessage(phone, { message: form.completionMessage || "✅ Thank you! Your form has been submitted successfully.", stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
        }
        
        return NextResponse.json({ success: true });
      } catch (formErr) {
        console.error("⚠️ Form processing error:", formErr);
        return NextResponse.json({ success: true });
      }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION D: CAMPAIGN REPORT UPDATE & DYNAMIC AUTO-TAGGING
       ══════════════════════════════════════════════════════════════════════════ */
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

        let userTags: any[] = [];
        if (userId) userTags = await Tag.find({ userId }).select("name isCampaignSpecific campaignId");

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

              const currentTags = camp.reportData[reportIndex].tags || [];
              let detectedTags: string[] = [];
              
              for (const t of userTags) {
                const tagNameLower = t.name.toLowerCase();
                if (tagNameLower && lowerText.includes(tagNameLower)) {
                  if (t.isCampaignSpecific) {
                    if (t.campaignId && t.campaignId.toString() === camp._id.toString()) detectedTags.push(t.name);
                  } else {
                    detectedTags.push(t.name);
                  }
                }
              }
              
              if (detectedTags.length > 0) {
                for (const dt of detectedTags) {
                  if (!currentTags.includes(dt)) currentTags.push(dt);
                }
                camp.reportData[reportIndex].tags = currentTags;
              }
              
              camp.markModified("reportData");
              await camp.save();

              // ✅ NEW: PUSH REPLY TO GOOGLE SHEETS INSTANTLY (Campaign)
              if (ownerUser) {
                try {
                  await syncCampaignToGoogleSheet(ownerUser._id.toString(), {
                    name: camp.name,
                    reportData: camp.reportData
                  });
                } catch (syncErr) {
                  console.error("⚠️ Google Sheet Sync Error (Webhook):", syncErr);
                }
              }

              if (detectedTags.length > 0 && userId) {
                try {
                  for (const dt of detectedTags) {
                    await Tag.findOneAndUpdate({ userId, name: dt }, { $setOnInsert: { userId, name: dt } }, { upsert: true, new: true });
                    await Contact.findOneAndUpdate({ userId, phone }, { $setOnInsert: { userId, phone, name: contactName }, $addToSet: { tags: dt } }, { upsert: true, new: true });
                  }
                } catch (tagErr) {
                  console.error("⚠️ Failed to save Contact/Tag globally:", tagErr);
                }
              }
            }
          }
        }

        // ✅ NEW: Update Test Message Reply in Google Sheet
        if (userId) {
          try {
            await syncTestMessageToGoogleSheet(userId, {
              phone: phone,
              status: "read",
              reply: textToSave
            }, false); // false = only update if row exists, don't create new
          } catch (e) { console.error("Sheet sync error on reply:", e); }
        }

      } catch (reportErr) {
        console.error("⚠️ Campaign Report Update Failed:", reportErr);
      }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION E: WORKFLOW LOGIC
       ══════════════════════════════════════════════════════════════════════════ */
    if (messageType === "text" || isButtonReply) {
      try {
        // Handle Restart Form Button
        if (isButtonReply && buttonId && buttonId.startsWith("restart_form_")) {
          const formId = buttonId.replace("restart_form_", "");
          const formData = await Form.findById(formId);
          if (formData && formData.fields.length > 0) {
            await Session.findOneAndUpdate({ phone, userId }, { formId: formData._id, formFieldIndex: 0, updatedAt: new Date() }, { upsert: true, new: true });
            await FormResponse.create({ formId: formData._id, userId, phone, data: {}, status: "incomplete" });
            const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
            await sendWhatsAppMessage(phone, { message: textMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
            startFormInactivityTimer(phone, userId!, formData._id.toString(), 0, formData.fields[0], formData, ownerUser);
            return NextResponse.json({ success: true });
          }
        }

        // Handle Active Session Button Replies
        if (isButtonReply && userId) {
          const session = activeSession || (await Session.findOne({ phone, userId }));
          if (session) {
            const wf = await Workflow.findById(session.workflowId);
            
            if (wf && wf.active && wf.steps) {
              let clickedBtn = null;
              for (const stepId in wf.steps) {
                const step = wf.steps[stepId];
                const btn = step.buttons?.find((b: any) => b.id === buttonId || b.label?.toLowerCase() === lowerText);
                if (btn) { clickedBtn = btn; break; }
              }
              
              if (clickedBtn) {
                if (clickedBtn.optInNodeId) {
                  try {
                    const existingOpt = await OptNumber.findOne({ userId, phoneNumber: phone });
                    if (!existingOpt) await OptNumber.create({ userId, phoneNumber: phone });
                  } catch (optErr) { console.error("⚠️ Failed to save opt-in number:", optErr); }
                }
                
                if (clickedBtn.nextStepId) {
                  let nextStep = wf.steps[clickedBtn.nextStepId];
                  while (nextStep && nextStep.stepType === "delay_node") {
                    const delaySeconds = nextStep.delaySeconds || 0;
                    if (delaySeconds > 0) await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
                    nextStep = nextStep.nextStepId ? wf.steps[nextStep.nextStepId] : null;
                  }
                  
                  if (nextStep) {
                    if (nextStep.stepType === "form_node" && nextStep.selectedForm) {
                      const formData = await Form.findById(nextStep.selectedForm);
                      if (formData && formData.fields.length > 0) {
                        session.formId = formData._id; session.formFieldIndex = 0; await session.save();
                        await FormResponse.create({ formId: formData._id, userId, phone, data: {}, status: "incomplete" });
                        const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
                        await sendWhatsAppMessage(phone, { message: textMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                        startFormInactivityTimer(phone, userId!, formData._id.toString(), 0, formData.fields[0], formData, ownerUser);
                        return NextResponse.json({ success: true });
                      }
                    }
                    session.currentStepId = nextStep.id;
                    await session.save();
                    await sendWhatsAppMessage(phone, nextStep, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                    await Message.create({ userId, phone, text: nextStep.message || `[${nextStep.stepType?.toUpperCase()}]`, direction: "out", messageType: "text" });
                    if (nextStep.buttons && nextStep.buttons.length > 0) {
                      startWorkflowInactivityTimer(phone, userId!, wf._id.toString(), ownerUser);
                    }
                    return NextResponse.json({ success: true });
                  } else { 
                    await Session.deleteOne({ _id: session._id }); 
                    return NextResponse.json({ success: true }); 
                  }
                } else { 
                  await Session.deleteOne({ _id: session._id }); 
                  return NextResponse.json({ success: true }); 
                }
              } else { 
                await Session.deleteOne({ _id: session._id }); 
                return NextResponse.json({ success: true }); 
              }
            } else { 
              await Session.deleteOne({ _id: session._id }); 
            }
          }
        }

        const workflowQuery: any = { active: true };
        if (userId) workflowQuery.userId = userId;
        
        const workflows = await Workflow.find(workflowQuery);
        let matchedStepId: string | null = null;
        let matchedWorkflow: any = null;
        const checkText = isButtonReply ? textToSave || "" : lowerText;

        for (const wf of workflows) {
          const hasMatch = wf.triggers?.some((t: any) => {
            const triggerKeyword = t.keyword.toLowerCase().trim();
            if (triggerKeyword === "*") return true;
            const mode = t.matchMode || "contains";
            if (mode === "exact") return checkText === triggerKeyword;
            if (mode === "contains") return checkText.includes(triggerKeyword);
            return false;
          });
          if (hasMatch) { matchedWorkflow = wf; matchedStepId = wf.rootStepId; break; }
        }

        if (matchedWorkflow && matchedStepId) {
          let step = matchedWorkflow.steps?.[matchedStepId];
          while (step && step.stepType === "delay_node") {
            const delaySeconds = step.delaySeconds || 0;
            if (delaySeconds > 0) await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
            step = step.nextStepId ? matchedWorkflow.steps[step.nextStepId] : null;
          }
          
          if (step && (step.message || step.stepType === "template" || step.stepType === "url_action" || step.stepType === "call_action" || step.stepType === "form_node")) {
            if (step.stepType === "form_node" && step.selectedForm) {
              const formData = await Form.findById(step.selectedForm);
              if (formData && formData.fields.length > 0) {
                await Session.findOneAndUpdate({ phone, userId }, { formId: formData._id, formFieldIndex: 0, workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, { upsert: true, new: true });
                await FormResponse.create({ formId: formData._id, userId, phone, data: {}, status: "incomplete" });
                const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
                await sendWhatsAppMessage(phone, { message: textMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                startFormInactivityTimer(phone, userId!, formData._id.toString(), 0, formData.fields[0], formData, ownerUser);
                return NextResponse.json({ success: true });
              }
            }
            
            await sendWhatsAppMessage(phone, step, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
            await Message.create({ userId, phone, text: step.message || `[${step.stepType?.toUpperCase()}]`, direction: "out", messageType: "text" });
            await Session.findOneAndUpdate({ phone, userId }, { workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, { upsert: true, new: true });
            
            if (step.buttons && step.buttons.length > 0) {
              startWorkflowInactivityTimer(phone, userId!, matchedWorkflow._id.toString(), ownerUser);
            }
          }
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
