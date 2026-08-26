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
import CampaignReport from "@/models/CampaignReport"; // ✅ NEW
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Job, Cache } from "@/lib/queue";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";
const formTimers = new Map<string, NodeJS.Timeout>();

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, amount: Number, description: String, status: String,
  createdAt: { type: Date, default: Date.now }, metadata: Object
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

const statusPriority: Record<string, number> = { "pending": 1, "queued": 2, "sent": 3, "delivered": 4, "read": 5 };

function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const currentPriority = statusPriority[currentStatus] || 0;
  const newPriority = statusPriority[newStatus] || 0;
  if (newStatus === "failed" || newStatus === "invalid") return currentPriority < 4 && currentStatus !== "failed" && currentStatus !== "invalid";
  if (currentStatus === "failed" || currentStatus === "invalid") return false;
  return newPriority > currentPriority;
}

function normalizePhone(val: any): string {
  return String(val || "").replace(/\D/g, "").slice(-10);
}

async function upsertSession(phone: string, userId: string, updateData: any) {
  let session = await Session.findOne({ phone, userId });
  if (session) { await Session.updateOne({ _id: session._id }, { $set: updateData }); return await Session.findById(session._id); }
  session = await Session.findOne({ phone });
  if (session) { await Session.updateOne({ _id: session._id }, { $set: { userId, ...updateData } }); return await Session.findById(session._id); }
  return await Session.create({ phone, userId, ...updateData });
}

async function processBalanceRefund(campaignId: any, reportId: any, prevStatus: string, newStatus: string, errorText: string | null, wamid: string, reportDataItem: any) {
  try {
    if ((newStatus === "failed" || newStatus === "invalid") && ["sent", "delivered", "read"].includes(prevStatus)) {
      const campaign: any = await Campaign.findById(campaignId).select("pricePerMessage userId name templateName").lean();
      if (!campaign) return;
      const refundAmount = Number(reportDataItem?.chargedAmount) || Number(campaign.pricePerMessage || 0);
      if (refundAmount <= 0) return;

      let payerId = campaign.userId;
      try {
        const campaignUser = await User.findById(campaign.userId).select("parentTenantId").lean();
        if (campaignUser?.parentTenantId) {
          const parent = await User.findOne({ tenantId: campaignUser.parentTenantId }).select("_id").lean();
          if (parent) payerId = parent._id;
        }
      } catch (e) {}

      try {
        await User.updateOne({ _id: payerId }, { $inc: { balance: refundAmount } });
        await Campaign.updateOne({ _id: campaignId }, { $inc: { totalDeducted: -refundAmount } });
        await CampaignReport.updateOne({ _id: reportId }, { $set: { charged: false, chargedAmount: 0 } }); // ✅ Update report
        await Transaction.create({
          userId: payerId, type: "refund", amount: refundAmount, description: "Refund: Message failed to deliver",
          status: "success", createdAt: new Date(),
          metadata: { campaignName: campaign.name, templateName: campaign.templateName, phone: reportDataItem?.phone, wamid, reason: errorText }
        });
      } catch (e) {}
    }
  } catch (err) {}
}

function buildOutgoingMessagePayload(step: any) {
  let text = step.message || ""; let messageType = "text"; let mediaUrl: string | null = null; let buttons: any[] = [];
  if (step.stepType === "call_action" && step.phoneNumber) { text = step.message || step.phoneNumber; buttons = [{ type: "phone_number", text: step.urlLabel || "Call", phone_number: step.phoneNumber }]; return { text, messageType, mediaUrl, buttons }; }
  if (step.stepType === "url_action" && step.url) { let url = step.url.trim(); if (!url.startsWith("http")) url = "https://" + url; text = step.message || step.url; buttons = [{ type: "url", text: step.urlLabel || "Open", url }]; return { text, messageType, mediaUrl, buttons }; }
  if (step.mediaUrl && ["image", "video", "document"].includes(step.mediaType)) { messageType = step.mediaType; mediaUrl = step.mediaUrl; }
  if (step.buttons?.length > 0) { const valid = step.buttons.filter((b: any) => b.label?.trim()); if (valid.length > 0) buttons = valid.map((b: any) => ({ type: "quick_reply", text: b.label })); }
  return { text, messageType, mediaUrl, buttons };
}

async function saveOutgoingWorkflowMessage(userId: string, customerNumber: string, phoneNumberId: string, step: any) {
  const { text, messageType, mediaUrl, buttons } = buildOutgoingMessagePayload(step);
  await Message.create({ userId, phone: customerNumber, text, direction: "out", messageType, mediaUrl, templateButtons: buttons.length > 0 ? JSON.stringify(buttons) : undefined, status: "sent", whatsappPhoneNumberId: phoneNumberId, senderNumber: phoneNumberId });
}

const clearWorkflowTimer = async (phone: string) => { try { await Job.deleteMany({ queue: "workflow-inactivity", status: "pending", "data.phone": phone }); } catch (err) {} };

const startWorkflowInactivityTimer = async (phone: string, userId: string, workflowId: string, accessToken: string, phoneNumberId: string, baseUrl: string) => {
  try {
    await clearWorkflowTimer(phone);
    const wf = await Workflow.findById(workflowId);
    if (!wf || !wf.steps) return;
    const inactivityNode = Object.values(wf.steps).find((s: any) => s.stepType === "inactivity_node") as any;
    if (!inactivityNode) return;
    await Job.create({ queue: "workflow-inactivity", name: "send-inactivity-message", data: { phone, userId, workflowId, accessToken, phoneNumberId, baseUrl, message: inactivityNode.message || "Are you still there?", delaySeconds: inactivityNode.delaySeconds || 30, repeatCount: inactivityNode.repeatCount || 1, sentCount: 0 }, status: "pending", createdAt: new Date() });
  } catch (err) {}
};

const startFormInactivityTimer = (phone: string, userId: string, formId: string, fieldIndex: number, field: any, form: any, accessToken: string, phoneNumberId: string, baseUrl: string) => {
  if (formTimers.has(phone)) { clearInterval(formTimers.get(phone) as NodeJS.Timeout); formTimers.delete(phone); }
  if (field.delaySeconds > 0 && field.repeatCount > 0 && field.delayMessage) {
    let remindersSent = 0;
    const intervalId = setInterval(async () => {
      try {
        await connectDB();
        const checkSession = await Session.findOne({ phone, userId });
        if (!checkSession || !checkSession.formId || checkSession.formFieldIndex !== fieldIndex) { clearInterval(intervalId); formTimers.delete(phone); return; }
        if (remindersSent < field.repeatCount) { await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, { message: field.delayMessage, stepType: "text" }, baseUrl); remindersSent++; } 
        else { clearInterval(intervalId); formTimers.delete(phone); await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, { message: form.abandonmentMessage || "It seems you are busy.", stepType: "message", buttons: [{ id: `restart_form_${formId}`, label: "🔄 Restart Form", nextStepId: null }] }, baseUrl); checkSession.formId = null; checkSession.formFieldIndex = 0; await checkSession.save(); await FormResponse.updateOne({ formId, phone, status: "incomplete" }, { $set: { status: "abandoned" } }); }
      } catch (err) { clearInterval(intervalId); formTimers.delete(phone); }
    }, field.delaySeconds * 1000);
    formTimers.set(phone, intervalId);
  }
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("hub.mode") === "subscribe" && searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
    return new NextResponse(searchParams.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function findUserByPhoneNumberId(phoneNumberId: string) {
  const user = await User.findOne({ $or: [{ whatsappPhoneNumberId: phoneNumberId }, { "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId }] }).lean();
  if (!user) return null;
  let matchedNumber: any = user.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === phoneNumberId && n.whatsappAccessToken);
  if (!matchedNumber && user.whatsappPhoneNumberId === phoneNumberId && user.whatsappAccessToken) matchedNumber = { whatsappPhoneNumberId: user.whatsappPhoneNumberId, whatsappAccessToken: user.whatsappAccessToken, wabaId: user.wabaId, name: "Default" };
  if (!matchedNumber) return null;
  return { userId: user._id, tenantId: (user as any).tenantId || (user as any).parentTenantId || null, name: matchedNumber.name || user.name || "Unknown", phoneNumberId: matchedNumber.whatsappPhoneNumberId, accessToken: matchedNumber.whatsappAccessToken, wabaId: matchedNumber.wabaId || user.wabaId };
}

function parseMessage(msg: any) {
  let text = ""; let messageType = "text"; let mediaId: string | null = null;
  switch (msg.type) {
    case "text": text = msg.text?.body || ""; break;
    case "button": text = msg.button?.text || msg.button?.payload || ""; break;
    case "interactive": text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ""; break;
    case "image": text = msg.image?.caption || ""; messageType = "image"; mediaId = msg.image?.id; break;
    case "video": text = msg.video?.caption || ""; messageType = "video"; mediaId = msg.video?.id; break;
    case "document": text = msg.document?.filename || "Document"; messageType = "document"; mediaId = msg.document?.id; break;
    case "audio": messageType = "audio"; mediaId = msg.audio?.id; break;
    case "sticker": messageType = "sticker"; mediaId = msg.sticker?.id; break;
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
  if (exists) return;
  const { text, messageType, mediaId } = parseMessage(msg);
  await Message.create({ userId: num.userId, phone: msg.from, text, direction: "in", messageType, mediaUrl: mediaId, whatsappMessageId: msg.id, status: "delivered", whatsappPhoneNumberId: num.phoneNumberId, senderNumber: msg.from, createdAt: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date() });
}

async function uploadMediaToMetaFromUrl(phoneNumberId: string, accessToken: string, mediaUrl: string): Promise<string | null> {
  try {
    if (/^\d+$/.test(mediaUrl)) return mediaUrl;
    let blob: Blob | null = null; let filename = "media";
    if (mediaUrl.startsWith("/uploads/") || mediaUrl.startsWith("/public/")) { const p = path.join(process.cwd(), "public", mediaUrl); if (fs.existsSync(p)) { blob = new Blob([fs.readFileSync(p)]); filename = `media${path.extname(p).toLowerCase()}`; } }
    else if (mediaUrl.startsWith("http")) { const res = await fetch(mediaUrl); if (res.ok) { blob = await res.blob(); filename = `media${path.extname(new URL(mediaUrl).pathname).toLowerCase() || ".bin"}`; } }
    if (!blob) return null;
    const formData = new FormData(); formData.append("file", blob, filename); formData.append("messaging_product", "whatsapp");
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: formData });
    return (await res.json()).id || null;
  } catch { return null; }
}

async function executeWorkflowsForMessage(msg: any, num: any, baseUrl: string) {
  try {
    if (!["text", "button", "interactive"].includes(msg.type)) return;
    const incomingText = parseMessage(msg).text;
    const buttonPayload = extractButtonPayload(msg);
    if (!incomingText && !buttonPayload) return;
    await clearWorkflowTimer(msg.from);
    const activeSession = await Session.findOne({ phone: msg.from, userId: num.userId });

    if (activeSession && activeSession.formId && !(buttonPayload && buttonPayload.startsWith("restart_form_"))) {
      const form = await Form.findById(activeSession.formId);
      if (!form) { await Session.deleteOne({ _id: activeSession._id }); return; }
      const fieldIndex = activeSession.formFieldIndex;
      const currentField = form.fields[fieldIndex];
      if (!currentField) { await Session.deleteOne({ _id: activeSession._id }); return; }
      if (currentField.required && !incomingText.trim()) { await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: "⚠️ Required.", stepType: "text" }, baseUrl); return; }
      await FormResponse.updateOne({ formId: form._id, phone: msg.from, status: "incomplete" }, { $set: { [`data.${currentField.label}`]: incomingText } });
      const nextFieldIndex = fieldIndex + 1;
      if (nextFieldIndex < form.fields.length) {
        activeSession.formFieldIndex = nextFieldIndex; await activeSession.save();
        await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: form.fields[nextFieldIndex].label, stepType: "text" }, baseUrl);
        startFormInactivityTimer(msg.from, num.userId.toString(), form._id.toString(), nextFieldIndex, form.fields[nextFieldIndex], form, num.accessToken, num.phoneNumberId, baseUrl);
      } else {
        await FormResponse.updateOne({ formId: form._id, phone: msg.from, status: "incomplete" }, { $set: { status: "complete" } });
        await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: form.completionMessage || "✅ Thank you!", stepType: "text" }, baseUrl);
        await Session.deleteOne({ _id: activeSession._id });
      }
      return;
    }

    const workflows = await Workflow.find({ userId: num.userId, wabaPhoneNumberId: num.phoneNumberId, active: true });
    if (workflows.length === 0) return;
    let matchedWorkflow: any = null; let matchedByButton = false;

    if (buttonPayload) {
      if (buttonPayload.startsWith("restart_form_")) {
        const formId = buttonPayload.replace("restart_form_", "");
        const formData = await Form.findById(formId);
        if (formData && formData.fields.length > 0) {
          await upsertSession(msg.from, num.userId.toString(), { formId: formData._id, formFieldIndex: 0, updatedAt: new Date() });
          await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: `*${formData.name}*\n\n${formData.fields[0].label}`, stepType: "text" }, baseUrl);
          startFormInactivityTimer(msg.from, num.userId.toString(), formData._id.toString(), 0, formData.fields[0], formData, num.accessToken, num.phoneNumberId, baseUrl);
          return;
        }
      }
      for (const wf of workflows) {
        for (const id of Object.keys(wf.steps)) {
          const step = wf.steps[id];
          const btn = step.buttons?.find((b: any) => b.id === buttonPayload || b.label?.toLowerCase() === incomingText.toLowerCase());
          if (btn?.nextStepId) { matchedWorkflow = wf; matchedByButton = true; break; }
        }
        if (matchedByButton) break;
      }
    }

    if (!matchedWorkflow) {
      for (const wf of workflows) {
        const isMatch = wf.triggers.some((t: any) => {
          const k = (t.keyword || "").trim(); const m = (t.matchMode || "contains").toLowerCase();
          if (m === "exists" || k === "*" || k === "") return true;
          if (m === "exact") return incomingText.trim() === k;
          return incomingText.toLowerCase().trim().includes(k.toLowerCase());
        });
        if (isMatch) { matchedWorkflow = wf; break; }
      }
    }
    if (!matchedWorkflow) return;

    const steps = matchedWorkflow.steps;
    let currentStepId = matchedWorkflow.rootStepId;
    if (matchedByButton && buttonPayload) {
      for (const id of Object.keys(steps)) {
        const btn = steps[id].buttons?.find((b: any) => b.id === buttonPayload || b.label?.toLowerCase() === incomingText.toLowerCase());
        if (btn?.nextStepId) { currentStepId = btn.nextStepId; break; }
      }
    }
    if (!currentStepId || !steps[currentStepId]) return;
    
    await processWorkflowStep(currentStepId, steps, matchedWorkflow, num.accessToken, num.phoneNumberId, msg.from, num.userId.toString(), num.tenantId, baseUrl);
  } catch (err) { console.error("❌ [WORKFLOW] Error:", err); }
}

async function processWorkflowStep(stepId: string, steps: Record<string, any>, matchedWorkflow: any, accessToken: string, phoneNumberId: string, customerNumber: string, userId: string, tenantId: string | null, baseUrl: string) {
  const step = steps[stepId];
  if (!step) return;
  if (step.stepType === "delay_node") { if (step.delaySeconds > 0) await new Promise(r => setTimeout(r, step.delaySeconds * 1000)); if (step.nextStepId) return await processWorkflowStep(step.nextStepId, steps, matchedWorkflow, accessToken, phoneNumberId, customerNumber, userId, tenantId, baseUrl); return; }
  if (step.stepType === "opt_in_node") { await addOptOutNumber(customerNumber, userId, tenantId); return; }
  if (step.stepType === "tag_node") { if (step.selectedTag) await applyTagToContact(customerNumber, step.selectedTag, userId); return; }
  if (step.stepType === "form_node" && step.selectedForm) {
    const formData = await Form.findById(step.selectedForm);
    if (!formData || !formData.fields.length) return;
    await upsertSession(customerNumber, userId, { formId: formData._id, formFieldIndex: 0, workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() });
    await FormResponse.findOneAndUpdate({ formId: formData._id, phone: customerNumber, status: "incomplete" }, { $set: { userId, data: {}, status: "incomplete" } }, { upsert: true, new: true });
    await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, { message: `*${formData.name}*\n\n${formData.fields[0].label}`, stepType: "text" }, baseUrl);
    return;
  }
  await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, step, baseUrl);
  await saveOutgoingWorkflowMessage(userId, customerNumber, phoneNumberId, step);
  await upsertSession(customerNumber, userId, { workflowId: matchedWorkflow._id, currentStepId: step.id, formId: null, formFieldIndex: 0, updatedAt: new Date() });
  await startWorkflowInactivityTimer(customerNumber, userId, matchedWorkflow._id.toString(), accessToken, phoneNumberId, baseUrl);
}

async function sendWorkflowWhatsAppMessage(accessToken: string, phoneNumberId: string, to: string, step: any, baseUrl: string) {
  const sendMessage = async (payload: any) => {
    try { const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!res.ok) console.error("❌ WhatsApp API ERROR:", JSON.stringify(await res.json(), null, 2)); } catch {}
  };
  if (step.stepType === "call_action" && step.phoneNumber) { return sendMessage({ messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "cta_url", header: { type: "text", text: step.urlLabel || "Call" }, body: { text: step.message || "" }, action: { name: "cta_url", parameters: { display_text: step.urlLabel || "Call", url: `${baseUrl}/api/redirect-call?number=${encodeURIComponent(step.phoneNumber)}` } } } }); }
  if (step.stepType === "url_action" && step.url) { let url = step.url.trim(); if (!url.startsWith("http")) url = "https://" + url; return sendMessage({ messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "cta_url", header: { type: "text", text: step.urlLabel || "Open" }, body: { text: step.message || "" }, action: { name: "cta_url", parameters: { display_text: step.urlLabel || "Open", url } } } }); }
  if (step.mediaUrl && ["image", "video", "document"].includes(step.mediaType)) {
    const mediaId = await uploadMediaToMetaFromUrl(phoneNumberId, accessToken, step.mediaUrl);
    if (mediaId) {
      const p: any = { messaging_product: "whatsapp", to, type: step.mediaType };
      if (step.mediaType === "image") p.image = { id: mediaId, caption: step.message || undefined };
      else if (step.mediaType === "video") p.video = { id: mediaId, caption: step.message || undefined };
      else p.document = { id: mediaId, caption: step.message || undefined, filename: "Document" };
      return sendMessage(p);
    }
  }
  if (step.buttons?.length > 0) {
    const valid = step.buttons.filter((b: any) => b.label?.trim());
    if (valid.length > 3) return sendMessage({ messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "list", body: { text: step.message || "Select" }, action: { button: "Options", sections: [{ title: "Menu", rows: valid.slice(0, 10).map((b: any) => ({ id: b.id, title: b.label.substring(0, 24) })) }] } } });
    return sendMessage({ messaging_product: "whatsapp", to, type: "interactive", interactive: { type: "button", body: { text: step.message || "" }, action: { buttons: valid.slice(0, 3).map((b: any) => ({ type: "reply", reply: { id: b.id, title: b.label.substring(0, 20) } })) } } });
  }
  return sendMessage({ messaging_product: "whatsapp", to, type: "text", text: { body: step.message || "", preview_url: true } });
}

async function applyTagToContact(phoneNumber: string, tagId: string, userId: string) {
  try { const { default: Contact } = await import("@/models/Contact"); const { default: Tag } = await import("@/models/Tag"); const tag = await Tag.findById(tagId).lean(); if (tag) await Contact.findOneAndUpdate({ phone: phoneNumber, userId }, { $addToSet: { tags: tag.name } }, { upsert: true }); } catch {}
}
async function addOptOutNumber(phoneNumber: string, userId: string, tenantId: string | null = null) {
  try { const { default: OptNumber } = await import("@/models/OptNumber"); if (!(await OptNumber.findOne({ phoneNumber, userId }))) await OptNumber.create({ phoneNumber, userId, tenantId, createdBy: userId }); } catch {}
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const forwardedProto = req.headers.get('x-forwarded-proto') || (req.headers.get('host')?.includes('localhost') ? 'http' : 'https');
    const baseUrl = `${forwardedProto}://${req.headers.get('x-forwarded-host') || req.headers.get('host')}`;

    const body = await req.json();
    if (!body?.entry) return NextResponse.json({ success: true });

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        if (!value) continue;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const num = await findUserByPhoneNumberId(phoneNumberId);
        if (!num) continue;

        const contactInfo = value.contacts?.[0];
        if (contactInfo?.profile?.name && contactInfo?.wa_id) {
          try { const { default: Contact } = await import("@/models/Contact"); await Contact.findOneAndUpdate({ phone: contactInfo.wa_id, userId: num.userId }, { name: contactInfo.profile.name }, { upsert: true }); } catch {}
        }

        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;
          await processAndSaveMessage(msg, num);
          await executeWorkflowsForMessage(msg, num, baseUrl);
          await handleCampaignReply(msg, num);
        }

        for (const statusObj of value.statuses || []) {
          const { id, status, recipient_id, errors } = statusObj;
          if (status === "delivered" || status === "read") await Message.updateOne({ whatsappMessageId: id }, { $set: { status, error: null } });
          else if (status === "failed") await Message.updateOne({ whatsappMessageId: id }, { $set: { status, error: errors?.[0]?.message || "Failed" } });

          try {
            let errorText = null;
            if (status === "failed" || status === "invalid") errorText = errors?.[0]?.message || "Failed";

            // ✅ FIX: Query CampaignReport directly instead of array search
            const report = await CampaignReport.findOne({ sentWamid: id });
            if (report && shouldUpdateStatus(report.status, status)) {
              const prevStatus = report.status;
              const updateSet: any = { status, error: errorText };
              if (status === "delivered") updateSet.deliveredAt = new Date(parseInt(statusObj.timestamp) * 1000);
              if (status === "read") updateSet.readAt = new Date(parseInt(statusObj.timestamp) * 1000);
              await CampaignReport.updateOne({ _id: report._id }, { $set: updateSet });
              await processBalanceRefund(report.campaignId, report._id, prevStatus, status, errorText, id, report);
              await Cache.deleteOne({ key: `billing:${num.userId}` }).catch(()=>{});
              await Cache.deleteOne({ key: `dashboard:${num.userId}` }).catch(()=>{});
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

async function handleCampaignReply(msg: any, num: any) {
  try {
    const phone = msg.from;
    const text = msg?.text?.body || msg?.button?.text || msg?.interactive?.button_reply?.title || "[Media/Non-text reply]";
    const replyTime = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

    // ✅ FIX: Query CampaignReport directly
    const report = await CampaignReport.findOne({ userId: num.userId, phone }).sort({ createdAt: -1 });
    if (report) {
      await CampaignReport.updateOne(
        { _id: report._id },
        { $set: { status: "replied", repliedAt: replyTime }, $push: { replies: text, replyTimes: replyTime } }
      );
      await Cache.deleteOne({ key: `billing:${num.userId}` }).catch(()=>{});
      await Cache.deleteOne({ key: `dashboard:${num.userId}` }).catch(()=>{});
    }
  } catch (err) {}
}
