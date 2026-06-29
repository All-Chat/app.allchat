/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import Session from "@/models/Session";
import Form from "@/models/Form";
import FormResponse from "@/models/FormResponse";
import Campaign from "@/models/Campaign";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";
const workflowTimers = new Map<string, NodeJS.Timeout>();
const formTimers = new Map<string, NodeJS.Timeout>();

// ✅ STATUS PRIORITY HELPER FUNCTION
const statusPriority: Record<string, number> = {
  "pending": 1, "queued": 2, "sent": 3, "delivered": 4, "read": 5
};

function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const currentPriority = statusPriority[currentStatus] || 0;
  const newPriority = statusPriority[newStatus] || 0;
  if (newStatus === "failed" || newStatus === "invalid") {
    return currentPriority < 4 && currentStatus !== "failed" && currentStatus !== "invalid";
  }
  if (currentStatus === "failed" || currentStatus === "invalid") return false;
  return newPriority > currentPriority;
}

const clearWorkflowTimer = (phone: string) => {
  const timerId = workflowTimers.get(phone);
  if (timerId) { clearInterval(timerId); workflowTimers.delete(phone); }
};

const startWorkflowInactivityTimer = (phone: string, userId: string, workflowId: string, accessToken: string, phoneNumberId: string, baseUrl: string) => {
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
            await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, { message, stepType: "text" }, baseUrl);
            sentCount++;
          } else { clearWorkflowTimer(phone); }
        } catch (err) { console.error("Inactivity timer error:", err); clearWorkflowTimer(phone); }
      }, delaySeconds * 1000);

      workflowTimers.set(phone, timerId);
    } catch (err) { console.error("Failed to start inactivity timer:", err); }
  })();
};

const startFormInactivityTimer = (phone: string, userId: string, formId: string, fieldIndex: number, field: any, form: any, accessToken: string, phoneNumberId: string, baseUrl: string) => {
  if (formTimers.has(phone)) {
    clearInterval(formTimers.get(phone) as NodeJS.Timeout);
    formTimers.delete(phone);
  }

  if (field.delaySeconds > 0 && field.repeatCount > 0 && field.delayMessage) {
    let remindersSent = 0;
    const intervalId = setInterval(async () => {
      try {
        await connectDB();
        const checkSession = await Session.findOne({ phone, userId });
        if (!checkSession || !checkSession.formId || checkSession.formFieldIndex !== fieldIndex) { 
          clearInterval(intervalId); 
          formTimers.delete(phone);
          return; 
        }
        if (remindersSent < field.repeatCount) {
          await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, { message: field.delayMessage, stepType: "text" }, baseUrl);
          remindersSent++;
        } else {
          clearInterval(intervalId);
          formTimers.delete(phone);
          const abandonmentStep = { message: form.abandonmentMessage || "It seems you are busy. Click below to restart.", stepType: "message", buttons: [{ id: `restart_form_${formId}`, label: "🔄 Restart Form", nextStepId: null }] };
          await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, abandonmentStep, baseUrl);
          checkSession.formId = null; checkSession.formFieldIndex = 0; await checkSession.save();
          await FormResponse.updateOne({ formId, phone, status: "incomplete" }, { $set: { status: "abandoned" } });
        }
      } catch (err) { console.error("Form timer error:", err); clearInterval(intervalId); formTimers.delete(phone); }
    }, field.delaySeconds * 1000);
    
    formTimers.set(phone, intervalId);
  }
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === VERIFY_TOKEN) return new NextResponse(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function findUserByPhoneNumberId(phoneNumberId: string) {
  const user = await User.findOne({ $or: [{ whatsappPhoneNumberId: phoneNumberId }, { "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId }] }).lean();
  if (!user) return null;
  let matchedNumber: any = null;
  if (user.whatsappNumbers && user.whatsappNumbers.length > 0) {
    matchedNumber = user.whatsappNumbers.find((n: any) => n.whatsappPhoneNumberId === phoneNumberId && n.whatsappAccessToken);
  }
  if (!matchedNumber && user.whatsappPhoneNumberId === phoneNumberId && user.whatsappAccessToken) {
    matchedNumber = { whatsappPhoneNumberId: user.whatsappPhoneNumberId, whatsappAccessToken: user.whatsappAccessToken, wabaId: user.wabaId, name: "Default Number" };
  }
  if (!matchedNumber) return null;
  return { 
    userId: user._id, 
    tenantId: (user as any).tenantId || (user as any).parentTenantId || null, 
    name: (matchedNumber as any).name || user.name || "Unknown", 
    phoneNumberId: (matchedNumber as any).whatsappPhoneNumberId, 
    accessToken: (matchedNumber as any).whatsappAccessToken, 
    wabaId: (matchedNumber as any).wabaId || user.wabaId 
  };
}

async function getAllWhatsappNumbersFromDB() {
  const users = await User.find({}).lean();
  const numbers: any[] = [];
  for (const user of users) {
    if (user.whatsappNumbers && user.whatsappNumbers.length > 0) {
      for (const n of user.whatsappNumbers) {
        if (n.whatsappPhoneNumberId && n.whatsappAccessToken) numbers.push({ userId: user._id, name: n.name || user.name || "Unknown", phoneNumberId: n.whatsappPhoneNumberId, accessToken: n.whatsappAccessToken, wabaId: n.wabaId || user.wabaId });
      }
    }
    if (user.whatsappPhoneNumberId && user.whatsappAccessToken) {
      if (!numbers.some((n) => n.phoneNumberId === user.whatsappPhoneNumberId)) numbers.push({ userId: user._id, name: user.name || "Unknown", phoneNumberId: user.whatsappPhoneNumberId, accessToken: user.whatsappAccessToken, wabaId: user.wabaId });
    }
  }
  return numbers;
}

async function forcePullMessages(num: any, baseUrl: string) {
  try {
    const since = Math.floor((Date.now() - 5000) / 1000);
    const res = await fetch(`https://graph.facebook.com/v21.0/${num.phoneNumberId}/messages?fields=id,from,type,text,image,video,audio,document,location,contacts,interactive,button,timestamp&limit=50&since=${since}`, { headers: { Authorization: `Bearer ${num.accessToken}` } });
    if (!res.ok) return;
    const data = await res.json();
    for (const msg of data.data || []) { if (msg.from) { await processAndSaveMessage(msg, num); await executeWorkflowsForMessage(msg, num, baseUrl); } }
  } catch (err) { console.error(`❌ [PULL] Exception:`, err); }
}

function parseMessage(msg: any) {
  let text = "", messageType = "text", mediaId: string | null = null;
  switch (msg.type) {
    case "text": text = msg.text?.body || ""; break;
    case "button": text = msg.button?.text || msg.button?.payload || ""; messageType = "text"; break;
    case "interactive": text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.interactive?.nfm_reply?.response_json || ""; break;
    case "image": text = msg.image?.caption || ""; messageType = "image"; mediaId = msg.image?.id || null; break;
    case "video": text = msg.video?.caption || ""; messageType = "video"; mediaId = msg.video?.id || null; break;
    case "document": text = msg.document?.filename || "Document"; messageType = "document"; mediaId = msg.document?.id || null; break;
    case "audio": messageType = "audio"; mediaId = msg.audio?.id || null; break;
    case "sticker": messageType = "sticker"; mediaId = msg.sticker?.id || null; break;
    case "location": text = `Location: ${msg.location?.latitude ?? ""},${msg.location?.longitude ?? ""}`; break;
    case "contacts": text = msg.contacts?.[0]?.name?.formatted_name || "Contact"; break;
    default: text = `[${msg.type}]`; break;
  }
  return { text, messageType, mediaId };
}

function extractButtonPayload(msg: any): string | null {
  if (msg.type === "interactive") return msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || null;
  if (msg.type === "button") return msg.button?.payload || msg.button?.text || null;
  return null;
}

async function processAndSaveMessage(msg: any, num: any) {
  const exists = await Message.findOne({ whatsappMessageId: msg.id }).lean();
  if (exists) {
    if (!(exists as any).whatsappPhoneNumberId && num.phoneNumberId) await Message.updateOne({ _id: (exists as any)._id }, { $set: { whatsappPhoneNumberId: num.phoneNumberId } });
    return;
  }
  const { text, messageType, mediaId } = parseMessage(msg);
  await Message.create({ userId: num.userId, phone: msg.from, text, direction: "in", messageType, mediaUrl: mediaId, whatsappMessageId: msg.id, status: "delivered", whatsappPhoneNumberId: num.phoneNumberId, senderNumber: msg.from, createdAt: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date() });
}

async function uploadMediaToMetaFromUrl(phoneNumberId: string, accessToken: string, mediaUrl: string): Promise<string | null> {
  try {
    if (/^\d+$/.test(mediaUrl)) return mediaUrl;
    let blob: Blob | null = null; let filename = "media";
    if (mediaUrl.startsWith("/uploads/") || mediaUrl.startsWith("/public/")) {
      const localPath = path.join(process.cwd(), "public", mediaUrl);
      if (fs.existsSync(localPath)) { blob = new Blob([fs.readFileSync(localPath)]); filename = `media${path.extname(localPath).toLowerCase()}`; }
    } else if (mediaUrl.startsWith("http")) {
      const res = await fetch(mediaUrl); if (res.ok) { blob = await res.blob(); filename = `media${path.extname(new URL(mediaUrl).pathname).toLowerCase() || ".bin"}`; }
    } else {
      const base = process.env.NEXTAUTH_URL || ""; if (base) { const res = await fetch(`${base}${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`); if (res.ok) { blob = await res.blob(); filename = `media${path.extname(new URL(base).pathname).toLowerCase() || ".bin"}`; } }
    }
    if (!blob) return null;
    const formData = new FormData(); formData.append("file", blob, filename); formData.append("messaging_product", "whatsapp");
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
    const data = await res.json(); return data.id || null;
  } catch (err) { console.error(`❌ [MEDIA] Upload failed:`, err); return null; }
}

async function executeWorkflowsForMessage(msg: any, num: any, baseUrl: string) {
  try {
    if (!["text", "button", "interactive"].includes(msg.type)) return;
    const incomingText = parseMessage(msg).text;
    const buttonPayload = extractButtonPayload(msg);
    if (!incomingText && !buttonPayload) return;

    const activeSession = await Session.findOne({ phone: msg.from, userId: num.userId });
    
    if (activeSession && activeSession.formId) {
      if (buttonPayload && buttonPayload.startsWith("restart_form_")) {
        // Fall through
      } else {
        const form = await Form.findById(activeSession.formId);
        if (!form) { await Session.deleteOne({ _id: activeSession._id }); return; }

        const fieldIndex = activeSession.formFieldIndex;
        const currentField = form.fields[fieldIndex];
        if (!currentField) { await Session.deleteOne({ _id: activeSession._id }); return; }

        if (currentField.required && !incomingText.trim()) {
          await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: "⚠️ This field is required. Please enter a valid response.", stepType: "text" }, baseUrl);
          return;
        }

        await FormResponse.updateOne({ formId: form._id, phone: msg.from, status: "incomplete" }, { $set: { [`data.${currentField.label}`]: incomingText } });

        if (formTimers.has(msg.from)) { clearInterval(formTimers.get(msg.from) as NodeJS.Timeout); formTimers.delete(msg.from); }

        const nextFieldIndex = fieldIndex + 1;
        if (nextFieldIndex < form.fields.length) {
          const nextField = form.fields[nextFieldIndex];
          activeSession.formFieldIndex = nextFieldIndex;
          await activeSession.save();
          await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: nextField.label, stepType: "text" }, baseUrl);
          startFormInactivityTimer(msg.from, num.userId.toString(), form._id.toString(), nextFieldIndex, nextField, form, num.accessToken, num.phoneNumberId, baseUrl);
          return;
        } else {
          await FormResponse.updateOne({ formId: form._id, phone: msg.from, status: "incomplete" }, { $set: { status: "complete" } });
          await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: form.completionMessage || "✅ Thank you!", stepType: "text" }, baseUrl);

          const workflow = await Workflow.findById(activeSession.workflowId);
          if (workflow && activeSession.currentStepId) {
            const step = workflow.steps[activeSession.currentStepId];
            if (step && step.nextStepId) {
              activeSession.formId = null; activeSession.formFieldIndex = 0; await activeSession.save();
              await processWorkflowStep(step.nextStepId, workflow.steps, workflow, num.accessToken, num.phoneNumberId, msg.from, num.userId.toString(), num.tenantId, baseUrl);
              return;
            }
          }
          await Session.deleteOne({ _id: activeSession._id });
          return;
        }
      }
    }

    let workflows = await Workflow.find({ userId: num.userId, wabaPhoneNumberId: num.phoneNumberId, active: true });
    if (workflows.length === 0) {
      const legacy = await Workflow.find({ userId: num.userId, $or: [{ wabaPhoneNumberId: null }, { wabaPhoneNumberId: { $exists: false } }], active: true });
      if (legacy.length > 0) { workflows = legacy; await Workflow.updateMany({ userId: num.userId, $or: [{ wabaPhoneNumberId: null }, { wabaPhoneNumberId: { $exists: false } }], active: true }, { $set: { wabaPhoneNumberId: num.phoneNumberId } }); }
    }
    if (workflows.length === 0) return;

    let matchedWorkflow: any = null; let matchedByButton = false;

    if (buttonPayload) {
      if (buttonPayload.startsWith("restart_form_")) {
        const formId = buttonPayload.replace("restart_form_", "");
        const formData = await Form.findById(formId);
        if (formData && formData.fields.length > 0) {
          await Session.findOneAndUpdate({ phone: msg.from, userId: num.userId }, { formId: formData._id, formFieldIndex: 0, updatedAt: new Date() }, { upsert: true, new: true });
          await FormResponse.findOneAndUpdate({ formId: formData._id, phone: msg.from, status: "incomplete" }, { $set: { userId: num.userId, data: {}, status: "incomplete" } }, { upsert: true, new: true });
          await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: `*${formData.name}*\n\n${formData.fields[0].label}`, stepType: "text" }, baseUrl);
          startFormInactivityTimer(msg.from, num.userId.toString(), formData._id.toString(), 0, formData.fields[0], formData, num.accessToken, num.phoneNumberId, baseUrl);
          return;
        }
      }
      
      if (activeSession && activeSession.workflowId && !activeSession.formId) {
        const wf = await Workflow.findById(activeSession.workflowId);
        if (wf && wf.active && wf.steps) {
          let clickedBtn = null;
          for (const id of Object.keys(wf.steps)) { 
            const step = wf.steps[id]; 
            const btn = step.buttons?.find((b: any) => b.id === buttonPayload) || step.buttons?.find((b: any) => b.label?.toLowerCase() === incomingText.toLowerCase()); 
            if (btn) { clickedBtn = btn; break; } 
          }
          if (clickedBtn) {
            if (clickedBtn.applyTagId) await applyTagToContact(msg.from, clickedBtn.applyTagId, num.userId.toString());
            if (clickedBtn.optInNodeId) await addOptOutNumber(msg.from, num.userId.toString(), num.tenantId);
            if (clickedBtn.nextStepId) {
              let nextStep = wf.steps[clickedBtn.nextStepId];
              while (nextStep && nextStep.stepType === "delay_node") { if (nextStep.delaySeconds > 0) await new Promise(r => setTimeout(r, nextStep.delaySeconds * 1000)); nextStep = nextStep.nextStepId ? wf.steps[nextStep.nextStepId] : null; }
              if (nextStep) {
                if (nextStep.stepType === "opt_in_node") { await addOptOutNumber(msg.from, num.userId.toString(), num.tenantId); return; } 
                else if (nextStep.stepType === "tag_node") { if (nextStep.selectedTag) await applyTagToContact(msg.from, nextStep.selectedTag, num.userId.toString()); return; }
                
                if (nextStep.stepType === "form_node" && nextStep.selectedForm) {
                  const formData = await Form.findById(nextStep.selectedForm);
                  if (formData && formData.fields.length > 0) {
                    activeSession.formId = formData._id; activeSession.formFieldIndex = 0; activeSession.currentStepId = nextStep.id; await activeSession.save();
                    await FormResponse.findOneAndUpdate({ formId: formData._id, phone: msg.from, status: "incomplete" }, { $set: { userId: num.userId, data: {}, status: "incomplete" } }, { upsert: true, new: true });
                    await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: `*${formData.name}*\n\n${formData.fields[0].label}`, stepType: "text" }, baseUrl);
                    startFormInactivityTimer(msg.from, num.userId.toString(), formData._id.toString(), 0, formData.fields[0], formData, num.accessToken, num.phoneNumberId, baseUrl);
                    return;
                  }
                }
                activeSession.currentStepId = nextStep.id; await activeSession.save();
                await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, nextStep, baseUrl);
                return;
              } else { await Session.deleteOne({ _id: activeSession._id }); return; }
            } else { await Session.deleteOne({ _id: activeSession._id }); return; }
          } else { await Session.deleteOne({ _id: activeSession._id }); }
        } else { if (activeSession) await Session.deleteOne({ _id: activeSession._id }); }
      }
      for (const wf of workflows) { for (const id of Object.keys(wf.steps)) { const step = wf.steps[id]; const btn = step.buttons?.find((b: any) => b.id === buttonPayload || b.label?.toLowerCase() === incomingText.toLowerCase()); if (btn?.nextStepId) { matchedWorkflow = wf; matchedByButton = true; break; } } if (matchedByButton) break; }
    }

    if (!matchedWorkflow) {
      for (const wf of workflows) {
        const isMatch = wf.triggers.some((t: any) => { 
          const k = (t.keyword || "").trim(); 
          const m = (t.matchMode || "contains").toLowerCase(); 
          if (m === "exists") return true; 
          if (k === "*" || k === "") return true; 
          if (m === "exact") return incomingText.trim() === k; 
          return incomingText.toLowerCase().trim().includes(k.toLowerCase()); 
        });
        if (isMatch) { matchedWorkflow = wf; break; }
      }
    }
    if (!matchedWorkflow) return;

    const steps = matchedWorkflow.steps; 
    let currentStepId: string | null = null;
    
    if (matchedByButton && buttonPayload) {
      for (const id of Object.keys(steps)) { 
        const step = steps[id]; 
        const btn = step.buttons?.find((b: any) => b.id === buttonPayload || b.label?.toLowerCase() === incomingText.toLowerCase()); 
        if (btn?.nextStepId) { 
          currentStepId = btn.nextStepId; 
          if (btn.applyTagId) await applyTagToContact(msg.from, btn.applyTagId, num.userId.toString());
          if (btn.optInNodeId) await addOptOutNumber(msg.from, num.userId.toString(), num.tenantId); 
          break; 
        } 
      }
    } else { currentStepId = matchedWorkflow.rootStepId; }

    if (!currentStepId || !steps[currentStepId]) return;
    
    const rootStep = steps[currentStepId];

    if (rootStep?.triggerActions && rootStep.triggerActions.length > 0) {
      for (const action of rootStep.triggerActions) {
        if (action.type === "opt_in_node") await addOptOutNumber(msg.from, num.userId.toString(), num.tenantId);
        else if (action.type === "tag_node") {
          const tagStep = steps[action.stepId];
          if (tagStep?.selectedTag) await applyTagToContact(msg.from, tagStep.selectedTag, num.userId.toString());
        }
      }
    }

    if (rootStep.stepType === "opt_in_node") { await addOptOutNumber(msg.from, num.userId.toString(), num.tenantId); return; } 
    else if (rootStep.stepType === "tag_node") { if (rootStep.selectedTag) await applyTagToContact(msg.from, rootStep.selectedTag, num.userId.toString()); return; }

    await processWorkflowStep(currentStepId, steps, matchedWorkflow, num.accessToken, num.phoneNumberId, msg.from, num.userId.toString(), num.tenantId, baseUrl);
  } catch (err) { console.error("❌ [WORKFLOW] Error:", err); }
}

async function processWorkflowStep(stepId: string, steps: Record<string, any>, matchedWorkflow: any, accessToken: string, phoneNumberId: string, customerNumber: string, userId: string, tenantId: string | null, baseUrl: string) {
  const step = steps[stepId]; 
  if (!step) return;

  if (step.stepType === "delay_node") { 
    if (step.delaySeconds > 0) await new Promise(r => setTimeout(r, step.delaySeconds * 1000)); 
    if (step.nextStepId && steps[step.nextStepId]) await processWorkflowStep(step.nextStepId, steps, matchedWorkflow, accessToken, phoneNumberId, customerNumber, userId, tenantId, baseUrl); 
    return; 
  }

  if (step.stepType === "opt_in_node") {
    await addOptOutNumber(customerNumber, userId, tenantId);
    if (step.nextStepId && steps[step.nextStepId]) await processWorkflowStep(step.nextStepId, steps, matchedWorkflow, accessToken, phoneNumberId, customerNumber, userId, tenantId, baseUrl);
    return;
  } else if (step.stepType === "tag_node") {
    if (step.selectedTag) await applyTagToContact(customerNumber, step.selectedTag, userId);
    if (step.nextStepId && steps[step.nextStepId]) await processWorkflowStep(step.nextStepId, steps, matchedWorkflow, accessToken, phoneNumberId, customerNumber, userId, tenantId, baseUrl);
    return;
  }

  if (step.stepType === "form_node" && step.selectedForm) {
    const formData = await Form.findById(step.selectedForm);
    if (formData && formData.fields.length > 0) {
      await Session.findOneAndUpdate({ phone: customerNumber, userId }, { formId: formData._id, formFieldIndex: 0, workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, { upsert: true, new: true });
      await FormResponse.findOneAndUpdate({ formId: formData._id, phone: customerNumber, status: "incomplete" }, { $set: { userId, data: {}, status: "incomplete" } }, { upsert: true, new: true });
      await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, { message: `*${formData.name}*\n\n${formData.fields[0].label}`, stepType: "text" }, baseUrl);
      startFormInactivityTimer(customerNumber, userId, formData._id.toString(), 0, formData.fields[0], formData, accessToken, phoneNumberId, baseUrl);
    } 
    return;
  }

  if (["inactivity_node"].includes(step.stepType)) return;

  // ✅ FIX: Properly handle Call Action and URL Action nodes without waiting for replies
  if (step.stepType === "call_action" || step.stepType === "url_action") {
    let historyText = step.message || `[${step.stepType?.toUpperCase()}]`;
    if (step.stepType === "url_action" && step.url) historyText = `${step.message || ""}\n🔗 ${step.urlLabel || "Link"}: ${step.url}`.trim();
    if (step.stepType === "call_action" && step.phoneNumber) historyText = `${step.message || ""}\n📞 Call: ${step.phoneNumber}`.trim();

    await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, step, baseUrl);
    await Message.create({ userId, phone: customerNumber, text: historyText, direction: "out", messageType: "text", mediaUrl: step.mediaUrl || null });
    
    // Continue to next step if connected
    if (step.nextStepId && steps[step.nextStepId]) {
      let nextStep = steps[step.nextStepId];
      while (nextStep && nextStep.stepType === "delay_node") { 
        if (nextStep.delaySeconds > 0) await new Promise(r => setTimeout(r, nextStep.delaySeconds * 1000)); 
        nextStep = nextStep.nextStepId ? steps[nextStep.nextStepId] : null; 
      }
      if (nextStep) {
        await processWorkflowStep(nextStep.id, steps, matchedWorkflow, accessToken, phoneNumberId, customerNumber, userId, tenantId, baseUrl);
      }
    }
    return;
  }

  // Standard Message Node
  const historyText = step.message || `[${step.stepType?.toUpperCase()}]`;
  await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, step, baseUrl);
  await Message.create({ userId, phone: customerNumber, text: historyText, direction: "out", messageType: "text", mediaUrl: step.mediaUrl || null });
  await Session.findOneAndUpdate({ phone: customerNumber, userId }, { workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, { upsert: true, new: true });
  if (step.buttons?.length > 0) startWorkflowInactivityTimer(customerNumber, userId, matchedWorkflow._id.toString(), accessToken, phoneNumberId, baseUrl);
}

// ✅ WHATSAPP API SENDER (Fixed parameters array)
async function sendWorkflowWhatsAppMessage(accessToken: string, phoneNumberId: string, to: string, step: any, baseUrl: string) {
  let payload: any; 
  let resolvedMediaId: string | null = null;
  
  if (step.mediaUrl && step.mediaType && step.mediaType !== "link") { 
    if (/^\d+$/.test(step.mediaUrl)) resolvedMediaId = step.mediaUrl; 
    else resolvedMediaId = await uploadMediaToMetaFromUrl(phoneNumberId, accessToken, step.mediaUrl); 
  }
  const buildMediaObj = () => { 
    if (resolvedMediaId) return { id: resolvedMediaId }; 
    if (step.mediaUrl?.startsWith("http")) return { link: step.mediaUrl }; 
    return null; 
  };

  // ✅ FORCE HTTPS and REMOVE ALL SPACES to prevent WhatsApp API rejections
  let publicBaseUrl = process.env.NEXTAUTH_URL || baseUrl;
  publicBaseUrl = publicBaseUrl.replace(/\s+/g, ""); // Remove any accidental spaces
  if (publicBaseUrl.startsWith("http://")) {
    publicBaseUrl = publicBaseUrl.replace("http://", "https://");
  }
  publicBaseUrl = publicBaseUrl.replace(/\/$/, "");

  // ✅ CALL ACTION NODE
  if (step.stepType === "call_action" && step.phoneNumber) {
    let callNumber = step.phoneNumber.replace(/[^\d+]/g, '');
    if (callNumber.startsWith("+")) {
      callNumber = "+" + callNumber.replace(/\+/g, '');
    } else {
      callNumber = "+" + callNumber;
    }
    
    const redirectUrl = `${publicBaseUrl}/api/call-redirect?phone=${encodeURIComponent(callNumber)}`;

    payload = {
      messaging_product: "whatsapp", 
      to, 
      type: "interactive",
      interactive: {
        type: "cta_url",
        header: { type: "text", text: (step.urlLabel || "Call Us").substring(0, 60) },
        body: { text: step.message || `Tap the button below to call.` },
        action: { 
          name: "cta_url", 
          // ✅ FIX: MUST BE AN ARRAY
          parameters: [{ 
            type: "cta_url", 
            display_text: (step.urlLabel || "Call Now").substring(0, 20), 
            url: redirectUrl 
          }] 
        }
      }
    };
  } 
  // ✅ URL ACTION NODE
  else if (step.stepType === "url_action" && step.url) {
    let url = step.url.trim().replace(/\s+/g, "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    
    payload = {
      messaging_product: "whatsapp", 
      to, 
      type: "interactive",
      interactive: {
        type: "cta_url",
        header: { type: "text", text: (step.urlLabel || "Visit Link").substring(0, 60) },
        body: { text: step.message || "Click the button below to visit the link." },
        action: { 
          name: "cta_url", 
          // ✅ FIX: MUST BE AN ARRAY
          parameters: [{ 
            type: "cta_url", 
            display_text: (step.urlLabel || "Open").substring(0, 20), 
            url: url 
          }] 
        }
      }
    };
  } 
  else if (step.buttons?.length > 0) {
    const valid = step.buttons.filter((b: any) => b.label?.trim());
    if (valid.length > 3) {
      payload = { messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "list", header: { type: "text", text: "Options" }, body: { text: step.message || "Select" }, action: { button: step.listButtonText || "Options", sections: [{ title: "Choices", rows: valid.slice(0, 10).map((b: any) => ({ id: b.id, title: b.label.substring(0, 24) })) }] } } };
      const m = buildMediaObj(); if (m && step.mediaType) { if (step.mediaType === "image") payload.interactive.header = { type: "image", image: m }; else if (step.mediaType === "video") payload.interactive.header = { type: "video", video: m }; else if (step.mediaType === "document") payload.interactive.header = { type: "document", document: { ...m, filename: "Doc" } }; }
    } else {
      payload = { messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "button", body: { text: step.message || "" }, action: { buttons: valid.slice(0, 3).map((b: any) => ({ type: "reply", reply: { id: b.id, title: b.label.substring(0, 20) } })) } } };
      const m = buildMediaObj(); if (m && step.mediaType) { if (step.mediaType === "image") payload.interactive.header = { type: "image", image: m }; else if (step.mediaType === "video") payload.interactive.header = { type: "video", video: m }; else if (step.mediaType === "document") payload.interactive.header = { type: "document", document: { ...m, filename: "Doc" } }; }
    }
  } else {
    const m = buildMediaObj();
    if (step.mediaUrl && step.mediaType === "link") {
      let linkUrl = step.mediaUrl.trim().replace(/\s+/g, "");
      if (!linkUrl.startsWith("http://") && !linkUrl.startsWith("https://")) linkUrl = "https://" + linkUrl;
      payload = { messaging_product: "whatsapp", to, type: "text", text: { body: step.message ? `${step.message}\n\n${linkUrl}` : linkUrl, preview_url: true } };
    }
    else if (step.mediaUrl && step.mediaType === "image" && m) payload = { messaging_product: "whatsapp", to, type: "image", image: { ...m, ...(step.message ? { caption: step.message } : {}) } };
    else if (step.mediaUrl && step.mediaType === "video" && m) payload = { messaging_product: "whatsapp", to, type: "video", video: { ...m, ...(step.message ? { caption: step.message } : {}) } };
    else if (step.mediaUrl && step.mediaType === "audio" && m) payload = { messaging_product: "whatsapp", to, type: "audio", audio: m };
    else if (step.mediaUrl && step.mediaType === "document" && m) payload = { messaging_product: "whatsapp", to, type: "document", document: { ...m, filename: "Doc", ...(step.message ? { caption: step.message } : {}) } };
    else payload = { messaging_product: "whatsapp", to, type: "text", text: { body: step.message || "", preview_url: true } };
  }

  try { 
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, { 
      method: "POST", 
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, 
      body: JSON.stringify(payload) 
    }); 
    
    const data = await res.json();
    if (!res.ok) {
      console.error(`❌ [WORKFLOW] API Error for ${step.stepType}:`, JSON.stringify(data, null, 2));
      
      // Fallback to text if button fails
      if (step.stepType === "url_action" || step.stepType === "call_action") {
        let fallbackBody = step.message || "";
        if (step.stepType === "url_action" && step.url) {
          let u = step.url;
          if (!u.startsWith("http")) u = "https://" + u;
          fallbackBody += `\n\n${u}`;
        }
        if (step.stepType === "call_action" && step.phoneNumber) {
          let callNumber = step.phoneNumber.replace(/[^\d+]/g, '');
          if (!callNumber.startsWith("+")) callNumber = "+" + callNumber;
          fallbackBody += `\n\n📞 Click here to call: ${publicBaseUrl}/api/call-redirect?phone=${encodeURIComponent(callNumber)}`;
        }
        
        const fallbackPayload = {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: fallbackBody.trim(), preview_url: true }
        };
        await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, { 
          method: "POST", 
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, 
          body: JSON.stringify(fallbackPayload) 
        });
      }
    } else {
      console.log(`✅ [WORKFLOW] Button sent successfully!`);
    }
  } catch (err: any) { 
    console.error(`❌ [WORKFLOW] Send failed:`, err.message); 
  }
}

async function applyTagToContact(phoneNumber: string, tagId: string, userId: string) {
  try {
    const { default: Contact } = await import("@/models/Contact");
    const { default: Tag } = await import("@/models/Tag");
    const tag = await Tag.findById(tagId).lean();
    if (!tag) return;
    await Contact.findOneAndUpdate({ phone: phoneNumber, userId }, { $addToSet: { tags: tag.name } }, { upsert: true });
  } catch (err) { console.error("Failed to apply tag to contact:", err); }
}

async function addOptOutNumber(phoneNumber: string, userId: string, tenantId: string | null = null) {
  try {
    const { default: OptNumber } = await import("@/models/OptNumber");
    const existing = await OptNumber.findOne({ phoneNumber, userId });
    if (!existing) await OptNumber.create({ phoneNumber, userId, tenantId, createdBy: userId });
  } catch (err) { console.error("Failed to add opt-out number:", err); }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    
    const forwardedProto = req.headers.get('x-forwarded-proto') || (req.headers.get('host')?.includes('localhost') ? 'http' : 'https');
    const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const baseUrl = `${forwardedProto}://${forwardedHost}`;
    
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const allNumbers = await getAllWhatsappNumbersFromDB();
      if (allNumbers.length === 0) return NextResponse.json({ success: true, pulled: 0 });
      await Promise.all(allNumbers.map((num) => forcePullMessages(num, baseUrl)));
      return NextResponse.json({ success: true, pulled: allNumbers.length });
    }

    const body = await req.json();
    if (!body?.entry) return NextResponse.json({ success: true });

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value; if (!value) continue;
        const phoneNumberId = value.metadata?.phone_number_id; if (!phoneNumberId) continue;
        
        const num = await findUserByPhoneNumberId(phoneNumberId); if (!num) continue;

        const contactInfo = value.contacts?.[0];
        if (contactInfo?.profile?.name && contactInfo?.wa_id) {
          try { 
            const { default: Contact } = await import("@/models/Contact"); 
            await Contact.findOneAndUpdate({ phone: contactInfo.wa_id, userId: num.userId }, { name: contactInfo.profile.name, phone: contactInfo.wa_id }, { upsert: true }); 
          } catch {}
        }

        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;
          await processAndSaveMessage(msg, num);
          await executeWorkflowsForMessage(msg, num, baseUrl);
        }

        for (const statusObj of value.statuses || []) {
          const { id, status, recipient_id, errors } = statusObj;
          if (status === "delivered" || status === "read") await Message.updateOne({ whatsappMessageId: id }, { $set: { status, error: null } });
          else if (status === "failed") await Message.updateOne({ whatsappMessageId: id }, { $set: { status, error: errors?.[0]?.message || "Failed" } });

          try {
            const { default: Campaign } = await import("@/models/Campaign");
            let errorText = null;
            if (status === "failed" || status === "invalid") {
              const raw = errors?.[0]?.message || "Failed to send";
              errorText = (raw.toLowerCase().includes("undeliverable") || raw.toLowerCase().includes("unsupported")) ? "Message not delivered to maintain a healthy ecosystem." : raw;
            }
            const camps = await Campaign.find({ userId: num.userId, $or: [{ "reportData.phone": recipient_id }, { "reportData.phone": `+${recipient_id}` }] });
            for (const camp of camps) {
              for (const item of camp.reportData) {
                if (item.phone === recipient_id || item.phone === `+${recipient_id}`) {
                  if (shouldUpdateStatus(item.status, status)) {
                    await Campaign.updateOne(
                      { _id: camp._id, "reportData.phone": item.phone },
                      { $set: { "reportData.$.status": status, "reportData.$.error": errorText } }
                    );
                  }
                }
              }
            }
          } catch (campErr) { console.error("Failed to update campaign status:", campErr); }
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ [WEBHOOK] Fatal Error:", error);
    return NextResponse.json({ success: true });
  }
}
