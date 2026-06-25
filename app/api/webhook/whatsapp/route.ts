/* ============================================================================
   WHATSAPP WEBHOOK ROUTE
   ---------------------------------------------------------------------------- */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
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
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";
import { getPriceForCategory } from "@/lib/billing";
import { syncCampaignToGoogleSheet, syncTestMessageToGoogleSheet } from "@/lib/googleSheetSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const VERIFY_TOKEN = "my_secret_token";

const workflowTimers = new Map<string, NodeJS.Timeout>();

const clearWorkflowTimer = (phone: string) => {
  const timerId = workflowTimers.get(phone);
  if (timerId) { clearInterval(timerId); workflowTimers.delete(phone); }
};

const startWorkflowInactivityTimer = (phone: string, userId: string, workflowId: string, ownerUser: any) => {
  clearWorkflowTimer(phone);
  (async () => {
    try {
      await connectDB();
      const wf = await Workflow.findById(workflowId);
      if (!wf || !wf.steps) return;
      const inactivityNode = Object.values(wf.steps).find((s: any) => s.stepType === "inactivity_node") as any;
      if (!inactivityNode) return;
      const delaySeconds = inactivityNode.delaySeconds || 30;
      const repeatCount = inactivityNode.repeatCount || 1;
      const message = inactivityNode.message || "Are you still there?";
      let sentCount = 0;
      const timerId = setInterval(async () => {
        try {
          const session = await Session.findOne({ phone, userId });
          if (!session || session.formId) { clearWorkflowTimer(phone); return; }
          if (sentCount < repeatCount) {
            await sendWhatsAppMessage(phone, { message, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
            sentCount++;
          } else { clearWorkflowTimer(phone); }
        } catch (err) { clearWorkflowTimer(phone); }
      }, delaySeconds * 1000);
      workflowTimers.set(phone, timerId);
    } catch (err) { console.error("Failed to start inactivity timer:", err); }
  })();
};

const startFormInactivityTimer = (phone: string, userId: string, formId: string, fieldIndex: number, field: any, form: any, ownerUser: any) => {
  if (field.delaySeconds > 0 && field.repeatCount > 0 && field.delayMessage) {
    let remindersSent = 0;
    const intervalId = setInterval(async () => {
      try {
        await connectDB();
        const checkSession = await Session.findOne({ phone, userId });
        if (!checkSession || !checkSession.formId || checkSession.formFieldIndex !== fieldIndex) { clearInterval(intervalId); return; }
        if (remindersSent < field.repeatCount) {
          await sendWhatsAppMessage(phone, { message: field.delayMessage, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
          remindersSent++;
        } else {
          clearInterval(intervalId);
          const abandonmentStep = { message: form.abandonmentMessage || "It seems you are busy.", stepType: "message", buttons: [{ id: `restart_form_${formId}`, label: "🔄 Restart Form", nextStepId: null }] };
          await sendWhatsAppMessage(phone, abandonmentStep, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
          checkSession.formId = null; checkSession.formFieldIndex = 0; await checkSession.save();
          await FormResponse.updateOne({ formId, phone, status: "incomplete" }, { $set: { status: "abandoned" } });
        }
      } catch (err) { clearInterval(intervalId); }
    }, field.delaySeconds * 1000);
  }
};

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

    /* ══════════════════════════════════════════════════════════════════════════
       ✅ FIX: MULTI-ACCOUNT ARRAY LOOKUP
       Before this fix, if Account B's number was stored inside the 
       `whatsappNumbers` array instead of the top-level `whatsappPhoneNumberId` 
       field, the lookup failed. It then fell back to grabbing the "latest" 
       user (Account A), causing Account B's replies to be saved under Account A!
       ══════════════════════════════════════════════════════════════════════════ */
    if (metadataPhoneNumberId) {
      // 1. Try top-level field (Works for Account A)
      ownerUser = await User.findOne({ whatsappPhoneNumberId: metadataPhoneNumberId });
      
      // 2. If not found, search inside the `whatsappNumbers` array (Fixes Account B)
      if (!ownerUser) {
        ownerUser = await User.findOne({ 
          "whatsappNumbers.whatsappPhoneNumberId": metadataPhoneNumberId 
        });
        
        // If found in the array, extract the specific access token for THIS number
        if (ownerUser) {
          const matchedNumber = ownerUser.whatsappNumbers?.find(
            (n: any) => n.whatsappPhoneNumberId === metadataPhoneNumberId
          );
          if (matchedNumber) {
            ownerUser = ownerUser.toObject(); // Convert mongoose doc to plain object
            ownerUser.whatsappPhoneNumberId = matchedNumber.whatsappPhoneNumberId;
            ownerUser.whatsappAccessToken = matchedNumber.whatsappAccessToken || ownerUser.whatsappAccessToken;
          }
        }
      }
      
      if (ownerUser) userId = ownerUser._id.toString();
    }
    
    // 3. Final fallback only if STILL no match
    if (!userId) {
      ownerUser = await User.findOne().sort({ _id: -1 });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION A: HANDLE MESSAGE STATUSES
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
          const campaignQuery: any = { "reportData.sentWamid": wamid, status: { $in: ["running", "paused", "completed"] } };
          if (userId) campaignQuery.userId = userId;
          const campaigns = await Campaign.find(campaignQuery);

          for (const camp of campaigns) {
            if (!camp.reportData) continue;
            const reportIndex = camp.reportData.findIndex((r: any) => r.sentWamid === wamid);
            if (reportIndex === -1) continue;
            const currentItem = camp.reportData[reportIndex];
            let finalStatus = newStatus;
            if (newStatus === "failed" || newStatus === "undelivered") {
              const isInvalidNumber = errorCode === 1005 || errorCode === 1001 || errorCode === 1006 || errorSubcode === 1005 || errorSubcode === 1001 || errorDetails.includes("not registered") || errorDetails.includes("invalid");
              finalStatus = isInvalidNumber ? "invalid" : "failed";
            }
            const statusPriority: any = { read: 5, delivered: 4, sent: 3, invalid: 2, failed: 1, pending: 0 };
            if (statusPriority[finalStatus] > (statusPriority[currentItem.status] || 0)) {
              let balanceAdjustment = 0;
              const cost = ownerUser ? getPriceForCategory(ownerUser, camp.templateCategory || "MARKETING") : 0;
              if ((finalStatus === "failed" || finalStatus === "invalid") && currentItem.charged) {
                balanceAdjustment += cost; currentItem.charged = false;
                camp.totalDeducted = Math.max(0, (camp.totalDeducted || 0) - cost);
              }
              currentItem.status = finalStatus; camp.markModified("reportData"); await camp.save();
              if (balanceAdjustment !== 0 && userId) await User.findByIdAndUpdate(userId, { $inc: { balance: balanceAdjustment } });
            }
          }
          if (userId) { try { await syncTestMessageToGoogleSheet(userId, { phone: statusPhone, status: newStatus }, false); } catch (e) {} }
        }
      } catch (statusErr) { console.error("⚠️ Status Update Error:", statusErr); }
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

    let lowerText = "", textToSave = "", buttonId: string | null = null, messageType = "text", mediaId = null, isButtonReply = false;
    if (message.type === "text") { lowerText = message.text?.body?.toLowerCase().trim() || ""; textToSave = message.text.body.trim(); }
    else if (message.type === "interactive") { const btn = message.interactive?.button_reply || message.interactive?.list_reply; textToSave = btn?.title?.trim() || btn?.id?.trim() || ""; lowerText = textToSave.toLowerCase(); buttonId = btn?.id || null; isButtonReply = true; }
    else if (message.type === "button") { textToSave = message.button?.text?.trim() || message.button?.payload?.trim() || ""; lowerText = textToSave.toLowerCase(); buttonId = message.button?.payload || null; isButtonReply = true; }
    else if (["image", "video", "document", "audio", "sticker"].includes(message.type)) { messageType = message.type; mediaId = message[message.type]?.id || null; textToSave = message[message.type]?.caption || ""; lowerText = textToSave.toLowerCase().trim(); if (message.type === "document") textToSave = message[message.type]?.filename || "Document.pdf"; }

    if (!textToSave && !buttonId && !mediaId) return NextResponse.json({ success: true });

    // ✅ FIX: Save with the CORRECT userId and whatsappPhoneNumberId
    await Message.create({
      userId, phone, text: textToSave, direction: "in", messageType, mediaUrl: mediaId,
      whatsappMessageId: message.id || null, contactName: contactName,
      whatsappPhoneNumberId: metadataPhoneNumberId || null,
    });

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION C: CONVERSATIONAL FORM LOGIC
       ══════════════════════════════════════════════════════════════════════════ */
    const activeSession = await Session.findOne({ phone, userId });
    if (activeSession && activeSession.formId) {
      try {
        const form = await Form.findById(activeSession.formId);
        if (!form) { await Session.deleteOne({ _id: activeSession._id }); return NextResponse.json({ success: true }); }
        const currentField = form.fields[activeSession.formFieldIndex];
        await FormResponse.findOneAndUpdate({ formId: form._id, phone, status: "incomplete" }, { $set: { [`data.${currentField.label}`]: textToSave } }, { upsert: true, new: true });
        const nextIndex = activeSession.formFieldIndex + 1;
        if (nextIndex < form.fields.length) {
          activeSession.formFieldIndex = nextIndex; await activeSession.save();
          await sendWhatsAppMessage(phone, { message: form.fields[nextIndex].label, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
          startFormInactivityTimer(phone, userId!, form._id.toString(), nextIndex, form.fields[nextIndex], form, ownerUser);
        } else {
          await FormResponse.updateOne({ formId: form._id, phone, status: "incomplete" }, { $set: { status: "complete" } });
          activeSession.formId = null; activeSession.formFieldIndex = 0; await activeSession.save();
          const compMsg = form.completionMessage || "✅ Thank you! Form submitted.";
          await Message.create({ userId, phone, text: compMsg, direction: "out", messageType: "text", whatsappPhoneNumberId: metadataPhoneNumberId || null });
          await sendWhatsAppMessage(phone, { message: compMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
        }
        return NextResponse.json({ success: true });
      } catch (formErr) { return NextResponse.json({ success: true }); }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION D: CAMPAIGN REPORT UPDATE & DYNAMIC AUTO-TAGGING
       ══════════════════════════════════════════════════════════════════════════ */
    if (textToSave) {
      try {
        const contextId = message?.context?.id || null;
        const targetedCampaigns: any[] = [];
        if (contextId) { const q: any = { "reportData.sentWamid": contextId, status: { $in: ["running", "completed"] } }; if (userId) q.userId = userId; const c = await Campaign.findOne(q); if (c) targetedCampaigns.push(c); }
        if (targetedCampaigns.length === 0) { const q: any = { "reportData.phone": phone, status: { $in: ["running", "completed"] } }; if (userId) q.userId = userId; const c = await Campaign.findOne(q).sort({ createdAt: -1 }); if (c) targetedCampaigns.push(c); }
        let userTags: any[] = []; if (userId) userTags = await Tag.find({ userId }).select("name isCampaignSpecific campaignId");
        for (const camp of targetedCampaigns) {
          if (!camp.reportData) continue;
          let reportIndex = contextId ? camp.reportData.findIndex((r: any) => r.sentWamid === contextId) : -1;
          if (reportIndex === -1) reportIndex = camp.reportData.findIndex((r: any) => r.phone === phone);
          if (reportIndex !== -1) {
            const currentReplies = camp.reportData[reportIndex].replies || [];
            if (currentReplies.length < 5) {
              currentReplies.push(textToSave); camp.reportData[reportIndex].replies = currentReplies; camp.reportData[reportIndex].status = "read";
              const currentTags = camp.reportData[reportIndex].tags || []; let detectedTags: string[] = [];
              for (const t of userTags) { const tl = t.name.toLowerCase(); if (tl && lowerText.includes(tl)) { if (t.isCampaignSpecific) { if (t.campaignId?.toString() === camp._id.toString()) detectedTags.push(t.name); } else detectedTags.push(t.name); } }
              if (detectedTags.length > 0) { for (const dt of detectedTags) { if (!currentTags.includes(dt)) currentTags.push(dt); } camp.reportData[reportIndex].tags = currentTags; }
              camp.markModified("reportData"); await camp.save();
              if (ownerUser) { try { await syncCampaignToGoogleSheet(ownerUser._id.toString(), { name: camp.name, reportData: camp.reportData }); } catch (e) {} }
              if (detectedTags.length > 0 && userId) { try { for (const dt of detectedTags) { await Tag.findOneAndUpdate({ userId, name: dt }, { $setOnInsert: { userId, name: dt } }, { upsert: true }); await Contact.findOneAndUpdate({ userId, phone }, { $setOnInsert: { userId, phone, name: contactName }, $addToSet: { tags: dt } }, { upsert: true }); } } catch (e) {} }
            }
          }
        }
        if (userId) { try { await syncTestMessageToGoogleSheet(userId, { phone, status: "read", reply: textToSave }, false); } catch (e) {} }
      } catch (reportErr) { console.error("⚠️ Report Error:", reportErr); }
    }

    /* ══════════════════════════════════════════════════════════════════════════
       SECTION E: WORKFLOW LOGIC
       ══════════════════════════════════════════════════════════════════════════ */
    if (messageType === "text" || isButtonReply) {
      try {
        if (isButtonReply && buttonId && buttonId.startsWith("restart_form_")) {
          const formId = buttonId.replace("restart_form_", "");
          const formData = await Form.findById(formId);
          if (formData && formData.fields.length > 0) {
            await Session.findOneAndUpdate({ phone, userId }, { formId: formData._id, formFieldIndex: 0, updatedAt: new Date() }, { upsert: true, new: true });
            await FormResponse.create({ formId: formData._id, userId, phone, data: {}, status: "incomplete" });
            const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
            await Message.create({ userId, phone, text: textMsg, direction: "out", messageType: "text", whatsappPhoneNumberId: metadataPhoneNumberId || null });
            await sendWhatsAppMessage(phone, { message: textMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
            startFormInactivityTimer(phone, userId!, formData._id.toString(), 0, formData.fields[0], formData, ownerUser);
            return NextResponse.json({ success: true });
          }
        }

        if (isButtonReply && userId) {
          const session = activeSession || (await Session.findOne({ phone, userId }));
          if (session) {
            const wf = await Workflow.findById(session.workflowId);
            if (wf && wf.active && wf.steps) {
              let clickedBtn = null;
              for (const stepId in wf.steps) { const step = wf.steps[stepId]; const btn = step.buttons?.find((b: any) => b.id === buttonId || b.label?.toLowerCase() === lowerText); if (btn) { clickedBtn = btn; break; } }
              if (clickedBtn) {
                if (clickedBtn.optInNodeId) { try { if (!(await OptNumber.findOne({ userId, phoneNumber: phone }))) await OptNumber.create({ userId, phoneNumber: phone }); } catch (e) {} }
                if (clickedBtn.nextStepId) {
                  let nextStep = wf.steps[clickedBtn.nextStepId];
                  while (nextStep && nextStep.stepType === "delay_node") { if (nextStep.delaySeconds > 0) await new Promise(r => setTimeout(r, nextStep.delaySeconds * 1000)); nextStep = nextStep.nextStepId ? wf.steps[nextStep.nextStepId] : null; }
                  if (nextStep) {
                    if (nextStep.stepType === "form_node" && nextStep.selectedForm) {
                      const fData = await Form.findById(nextStep.selectedForm);
                      if (fData && fData.fields.length > 0) {
                        session.formId = fData._id; session.formFieldIndex = 0; await session.save();
                        await FormResponse.create({ formId: fData._id, userId, phone, data: {}, status: "incomplete" });
                        const tMsg = `*${fData.name}*\n\n${fData.fields[0].label}`;
                        await Message.create({ userId, phone, text: tMsg, direction: "out", messageType: "text", whatsappPhoneNumberId: metadataPhoneNumberId || null });
                        await sendWhatsAppMessage(phone, { message: tMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                        startFormInactivityTimer(phone, userId!, fData._id.toString(), 0, fData.fields[0], fData, ownerUser);
                        return NextResponse.json({ success: true });
                      }
                    }
                    session.currentStepId = nextStep.id; await session.save();
                    await sendWhatsAppMessage(phone, nextStep, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                    await Message.create({ userId, phone, text: nextStep.message || `[${nextStep.stepType?.toUpperCase()}]`, direction: "out", messageType: "text", whatsappPhoneNumberId: metadataPhoneNumberId || null });
                    if (nextStep.buttons?.length > 0) startWorkflowInactivityTimer(phone, userId!, wf._id.toString(), ownerUser);
                    return NextResponse.json({ success: true });
                  } else { await Session.deleteOne({ _id: session._id }); return NextResponse.json({ success: true }); }
                } else { await Session.deleteOne({ _id: session._id }); return NextResponse.json({ success: true }); }
              } else { await Session.deleteOne({ _id: session._id }); return NextResponse.json({ success: true }); }
            } else { await Session.deleteOne({ _id: session._id }); }
          }
        }

        const workflowQuery: any = { active: true }; if (userId) workflowQuery.userId = userId;
        const workflows = await Workflow.find(workflowQuery);
        let matchedStepId: string | null = null, matchedWorkflow: any = null;
        const checkText = isButtonReply ? textToSave || "" : lowerText;
        for (const wf of workflows) { const hasMatch = wf.triggers?.some((t: any) => { const tk = t.keyword.toLowerCase().trim(); if (tk === "*") return true; const m = t.matchMode || "contains"; return m === "exact" ? checkText === tk : checkText.includes(tk); }); if (hasMatch) { matchedWorkflow = wf; matchedStepId = wf.rootStepId; break; } }

        if (matchedWorkflow && matchedStepId) {
          let step = matchedWorkflow.steps?.[matchedStepId];
          while (step && step.stepType === "delay_node") { if (step.delaySeconds > 0) await new Promise(r => setTimeout(r, step.delaySeconds * 1000)); step = step.nextStepId ? matchedWorkflow.steps[step.nextStepId] : null; }
          if (step && (step.message || step.stepType === "template" || step.stepType === "url_action" || step.stepType === "call_action" || step.stepType === "form_node")) {
            if (step.stepType === "form_node" && step.selectedForm) {
              const fData = await Form.findById(step.selectedForm);
              if (fData && fData.fields.length > 0) {
                await Session.findOneAndUpdate({ phone, userId }, { formId: fData._id, formFieldIndex: 0, workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, { upsert: true, new: true });
                await FormResponse.create({ formId: fData._id, userId, phone, data: {}, status: "incomplete" });
                const tMsg = `*${fData.name}*\n\n${fData.fields[0].label}`;
                await Message.create({ userId, phone, text: tMsg, direction: "out", messageType: "text", whatsappPhoneNumberId: metadataPhoneNumberId || null });
                await sendWhatsAppMessage(phone, { message: tMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                startFormInactivityTimer(phone, userId!, fData._id.toString(), 0, fData.fields[0], fData, ownerUser);
                return NextResponse.json({ success: true });
              }
            }
            await sendWhatsAppMessage(phone, step, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
            await Message.create({ userId, phone, text: step.message || `[${step.stepType?.toUpperCase()}]`, direction: "out", messageType: "text", whatsappPhoneNumberId: metadataPhoneNumberId || null });
            await Session.findOneAndUpdate({ phone, userId }, { workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, { upsert: true, new: true });
            if (step.buttons?.length > 0) startWorkflowInactivityTimer(phone, userId!, matchedWorkflow._id.toString(), ownerUser);
          }
        }
      } catch (workflowError) { console.error("⚠️ WORKFLOW CRASHED:", workflowError); }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) { console.error("❌ WEBHOOK CRASH:", error); return NextResponse.json({ success: false, error: error.message }, { status: 500 }); }
}
