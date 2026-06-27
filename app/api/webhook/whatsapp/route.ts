/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import Session from "@/models/Session";
import Form from "@/models/Form";
import FormResponse from "@/models/FormResponse";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";

const workflowTimers = new Map<string, NodeJS.Timeout>();

// ═══════════════════════════════════════════════════════════════
// ✅ STATUS PRIORITY HELPER FUNCTION
// Prevents statuses from jumping backwards or overwriting each other incorrectly.
// ═══════════════════════════════════════════════════════════════
const statusPriority: Record<string, number> = {
  "pending": 1,
  "queued": 2,
  "sent": 3,
  "delivered": 4,
  "read": 5
};

function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const currentPriority = statusPriority[currentStatus] || 0;
  const newPriority = statusPriority[newStatus] || 0;

  // If the new status is failed or invalid (Terminal error states)
  if (newStatus === "failed" || newStatus === "invalid") {
    // Only update to failed if it hasn't been delivered or read yet, and isn't already failed
    return currentPriority < 4 && currentStatus !== "failed" && currentStatus !== "invalid";
  }

  // If the current status is failed or invalid, do not overwrite with success statuses (sent/delivered)
  if (currentStatus === "failed" || currentStatus === "invalid") {
    return false;
  }

  // Otherwise, only update if the new status has a higher priority (e.g., delivered -> read)
  return newPriority > currentPriority;
}

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
  accessToken: string,
  phoneNumberId: string
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
            await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, { message, stepType: "text" });
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
  accessToken: string,
  phoneNumberId: string
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
          await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, { message: field.delayMessage, stepType: "text" });
          remindersSent++;
        } else {
          clearInterval(intervalId);
          const abandonmentStep = {
            message: form.abandonmentMessage || "It seems you are busy right now. We have paused the form. Click the button below whenever you are ready to start over.",
            stepType: "message",
            buttons: [{ id: `restart_form_${formId}`, label: "🔄 Restart Form", nextStepId: null }],
          };
          await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, phone, abandonmentStep);
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ [WEBHOOK] Meta Verification Successful");
    return new NextResponse(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function findUserByPhoneNumberId(phoneNumberId: string) {
  const user = await User.findOne({
    $or: [
      { whatsappPhoneNumberId: phoneNumberId },
      { "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId },
    ],
  }).lean();

  if (!user) return null;

  let matchedNumber: any = null;

  if (user.whatsappNumbers && user.whatsappNumbers.length > 0) {
    matchedNumber = user.whatsappNumbers.find(
      (n: any) => n.whatsappPhoneNumberId === phoneNumberId && n.whatsappAccessToken
    );
  }

  if (!matchedNumber && user.whatsappPhoneNumberId === phoneNumberId && user.whatsappAccessToken) {
    matchedNumber = {
      whatsappPhoneNumberId: user.whatsappPhoneNumberId,
      whatsappAccessToken: user.whatsappAccessToken,
      wabaId: user.wabaId,
      name: "Default Number",
    };
  }

  if (!matchedNumber) return null;

  return {
    userId: user._id,
    name: (matchedNumber as any).name || user.name || "Unknown",
    phoneNumberId: (matchedNumber as any).whatsappPhoneNumberId,
    accessToken: (matchedNumber as any).whatsappAccessToken,
    wabaId: (matchedNumber as any).wabaId || user.wabaId,
  };
}

async function getAllWhatsappNumbersFromDB() {
  const users = await User.find({}).lean();
  const numbers: any[] = [];

  for (const user of users) {
    if (user.whatsappNumbers && user.whatsappNumbers.length > 0) {
      for (const n of user.whatsappNumbers) {
        if (n.whatsappPhoneNumberId && n.whatsappAccessToken) {
          numbers.push({
            userId: user._id,
            name: n.name || user.name || "Unknown",
            phoneNumberId: n.whatsappPhoneNumberId,
            accessToken: n.whatsappAccessToken,
            wabaId: n.wabaId || user.wabaId,
          });
        }
      }
    }
    if (user.whatsappPhoneNumberId && user.whatsappAccessToken) {
      const alreadyExists = numbers.some((n) => n.phoneNumberId === user.whatsappPhoneNumberId);
      if (!alreadyExists) {
        numbers.push({
          userId: user._id,
          name: user.name || "Unknown",
          phoneNumberId: user.whatsappPhoneNumberId,
          accessToken: user.whatsappAccessToken,
          wabaId: user.wabaId,
        });
      }
    }
  }
  return numbers;
}

async function forcePullMessages(num: any) {
  try {
    const since = Math.floor((Date.now() - 5000) / 1000);
    const url = `https://graph.facebook.com/v21.0/${num.phoneNumberId}/messages?fields=id,from,type,text,image,video,audio,document,location,contacts,interactive,button,timestamp&limit=50&since=${since}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${num.accessToken}` } });
    if (!res.ok) return;

    const data = await res.json();
    const msgs = data.data || [];
    if (msgs.length === 0) return;

    for (const msg of msgs) {
      if (!msg.from) continue;
      await processAndSaveMessage(msg, num);
      await executeWorkflowsForMessage(msg, num);
    }
  } catch (err) {
    console.error(`❌ [PULL] Exception for ${num.name}:`, err);
  }
}

function parseMessage(msg: any) {
  let text = "";
  let messageType = "text";
  let mediaId: string | null = null;

  switch (msg.type) {
    case "text": text = msg.text?.body || ""; break;
    case "button": text = msg.button?.text || msg.button?.payload || ""; messageType = "text"; break;
    case "interactive":
      text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.interactive?.nfm_reply?.response_json || "";
      break;
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
    if (!(exists as any).whatsappPhoneNumberId && num.phoneNumberId) {
      await Message.updateOne({ _id: (exists as any)._id }, { $set: { whatsappPhoneNumberId: num.phoneNumberId } });
    }
    return;
  }

  const { text, messageType, mediaId } = parseMessage(msg);
  const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

  await Message.create({
    userId: num.userId,
    phone: msg.from,
    text,
    direction: "in",
    messageType,
    mediaUrl: mediaId,
    whatsappMessageId: msg.id,
    status: "delivered",
    whatsappPhoneNumberId: num.phoneNumberId,
    senderNumber: msg.from,
    createdAt: timestamp,
  });
}

async function uploadMediaToMetaFromUrl(phoneNumberId: string, accessToken: string, mediaUrl: string): Promise<string | null> {
  try {
    if (/^\d+$/.test(mediaUrl)) return mediaUrl;

    let blob: Blob | null = null;
    let filename = "media";

    if (mediaUrl.startsWith("/uploads/") || mediaUrl.startsWith("/public/")) {
      const localPath = path.join(process.cwd(), "public", mediaUrl);
      if (fs.existsSync(localPath)) {
        const fileBuffer = fs.readFileSync(localPath);
        blob = new Blob([fileBuffer]);
        const ext = path.extname(localPath).toLowerCase();
        filename = `media${ext}`;
      }
    } else if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
      const downloadRes = await fetch(mediaUrl);
      if (downloadRes.ok) {
        blob = await downloadRes.blob();
        const ext = path.extname(new URL(mediaUrl).pathname).toLowerCase();
        filename = `media${ext || ".bin"}`;
      }
    } else {
      const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
      if (baseUrl) {
        const fullUrl = `${baseUrl}${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`;
        const downloadRes = await fetch(fullUrl);
        if (downloadRes.ok) {
          blob = await downloadRes.blob();
          const ext = path.extname(new URL(fullUrl).pathname).toLowerCase();
          filename = `media${ext || ".bin"}`;
        }
      }
    }

    if (!blob) return null;

    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("messaging_product", "whatsapp");

    const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    if (uploadData.id) return uploadData.id;
    return null;
  } catch (err) {
    console.error(`❌ [MEDIA] Error uploading to Meta:`, err);
    return null;
  }
}

async function executeWorkflowsForMessage(msg: any, num: any) {
  try {
    const supportedTypes = ["text", "button", "interactive"];
    if (!supportedTypes.includes(msg.type)) return;

    const incomingText = parseMessage(msg).text;
    const buttonPayload = extractButtonPayload(msg);

    if (!incomingText && !buttonPayload) return;

    let workflows = await Workflow.find({
      userId: num.userId,
      wabaPhoneNumberId: num.phoneNumberId,
      active: true,
    });

    if (workflows.length === 0) {
      const legacyWorkflows = await Workflow.find({
        userId: num.userId,
        $or: [{ wabaPhoneNumberId: null }, { wabaPhoneNumberId: { $exists: false } }],
        active: true,
      });

      if (legacyWorkflows.length > 0) {
        workflows = legacyWorkflows;
        try {
          await Workflow.updateMany(
            { userId: num.userId, $or: [{ wabaPhoneNumberId: null }, { wabaPhoneNumberId: { $exists: false } }], active: true },
            { $set: { wabaPhoneNumberId: num.phoneNumberId, wabaPhoneNumber: num.name || null } }
          );
        } catch (fixErr) {}
      }
    }

    if (workflows.length === 0) return;

    let matchedWorkflow: any = null;
    let matchedByButton = false;

    if (buttonPayload) {
      if (buttonPayload.startsWith("restart_form_")) {
        const formId = buttonPayload.replace("restart_form_", "");
        const formData = await Form.findById(formId);
        if (formData && formData.fields.length > 0) {
          await Session.findOneAndUpdate(
            { phone: msg.from, userId: num.userId }, 
            { formId: formData._id, formFieldIndex: 0, updatedAt: new Date() }, 
            { upsert: true, new: true }
          );
          await FormResponse.create({ formId: formData._id, userId: num.userId, phone: msg.from, data: {}, status: "incomplete" });
          const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
          await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: textMsg, stepType: "text" });
          startFormInactivityTimer(msg.from, num.userId.toString(), formData._id.toString(), 0, formData.fields[0], formData, num.accessToken, num.phoneNumberId);
          return;
        }
      }

      const activeSession = await Session.findOne({ phone: msg.from, userId: num.userId });
      if (activeSession && activeSession.workflowId) {
        const wf = await Workflow.findById(activeSession.workflowId);
        if (wf && wf.active && wf.steps) {
          let clickedBtn = null;
          for (const stepId of Object.keys(wf.steps)) {
            const step = wf.steps[stepId];
            const btn = step.buttons?.find((b: any) => b.id === buttonPayload) || 
                        step.buttons?.find((b: any) => b.label?.toLowerCase() === incomingText.toLowerCase());
            if (btn) { clickedBtn = btn; break; }
          }
          
          if (clickedBtn) {
            if (clickedBtn.applyTagId) await applyTagToContact(msg.from, clickedBtn.applyTagId, num.userId.toString());
            if (clickedBtn.optInNodeId) await addOptInNumber(msg.from, num.userId.toString());
            
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
                    activeSession.formId = formData._id; activeSession.formFieldIndex = 0; await activeSession.save();
                    await FormResponse.create({ formId: formData._id, userId: num.userId, phone: msg.from, data: {}, status: "incomplete" });
                    const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
                    await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, { message: textMsg, stepType: "text" });
                    startFormInactivityTimer(msg.from, num.userId.toString(), formData._id.toString(), 0, formData.fields[0], formData, num.accessToken, num.phoneNumberId);
                    return;
                  }
                }
                activeSession.currentStepId = nextStep.id;
                await activeSession.save();
                await sendWorkflowWhatsAppMessage(num.accessToken, num.phoneNumberId, msg.from, nextStep);
                await Message.create({ userId: num.userId, phone: msg.from, text: nextStep.message || `[${nextStep.stepType?.toUpperCase()}]`, direction: "out", messageType: "text" });
                if (nextStep.buttons && nextStep.buttons.length > 0) {
                  startWorkflowInactivityTimer(msg.from, num.userId.toString(), wf._id.toString(), num.accessToken, num.phoneNumberId);
                }
                return;
              } else { 
                await Session.deleteOne({ _id: activeSession._id }); 
                return; 
              }
            } else { 
              await Session.deleteOne({ _id: activeSession._id }); 
              return; 
            }
          } else { 
            await Session.deleteOne({ _id: activeSession._id }); 
          }
        } else { 
          if(activeSession) await Session.deleteOne({ _id: activeSession._id }); 
        }
      }

      for (const wf of workflows) {
        for (const stepId of Object.keys(wf.steps)) {
          const step = wf.steps[stepId];
          const clickedBtn = step.buttons?.find((b: any) => b.id === buttonPayload || b.label?.toLowerCase() === incomingText.toLowerCase());
          if (clickedBtn?.nextStepId) {
            matchedWorkflow = wf;
            matchedByButton = true;
            break;
          }
        }
        if (matchedByButton) break;
      }
    }

    if (!matchedWorkflow) {
      for (const wf of workflows) {
        const isMatch = wf.triggers.some((trigger: any) => {
          const triggerKeyword = (trigger.keyword || "").trim();
          const mode = (trigger.matchMode || "contains").toLowerCase();
          if (mode === "exists") return true;
          if (triggerKeyword === "*" || triggerKeyword === "") return true;
          if (mode === "exact") return incomingText.trim() === triggerKeyword;
          return incomingText.toLowerCase().trim().includes(triggerKeyword.toLowerCase());
        });

        if (isMatch) {
          matchedWorkflow = wf;
          break;
        }
      }
    }

    if (!matchedWorkflow) return;

    const steps = matchedWorkflow.steps;
    let currentStepId: string | null = null;

    if (matchedByButton && buttonPayload) {
      for (const stepId of Object.keys(steps)) {
        const step = steps[stepId];
        const clickedBtn = step.buttons?.find((b: any) => b.id === buttonPayload || b.label?.toLowerCase() === incomingText.toLowerCase());
        if (clickedBtn?.nextStepId) {
          currentStepId = clickedBtn.nextStepId;
          if (clickedBtn.applyTagId) await applyTagToContact(msg.from, clickedBtn.applyTagId, num.userId.toString());
          if (clickedBtn.optInNodeId) await addOptInNumber(msg.from, num.userId.toString());
          break;
        }
      }
    } else {
      currentStepId = matchedWorkflow.rootStepId;
    }

    if (!currentStepId || !steps[currentStepId]) return;

    await processWorkflowStep(
      currentStepId,
      steps,
      matchedWorkflow,
      num.accessToken,
      num.phoneNumberId,
      msg.from,
      num.userId.toString()
    );
  } catch (err) {
    console.error("❌ [WORKFLOW] Execution error:", err);
  }
}

async function processWorkflowStep(
  stepId: string,
  steps: Record<string, any>,
  matchedWorkflow: any,
  accessToken: string,
  phoneNumberId: string,
  customerNumber: string,
  userId: string
) {
  const step = steps[stepId];
  if (!step) return;

  if (step.stepType === "delay_node") {
    const delaySeconds = step.delaySeconds || 10;
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    if (step.nextStepId && steps[step.nextStepId]) {
      await processWorkflowStep(step.nextStepId, steps, matchedWorkflow, accessToken, phoneNumberId, customerNumber, userId);
    }
    return;
  }

  if (step.stepType === "form_node" && step.selectedForm) {
    const formData = await Form.findById(step.selectedForm);
    if (formData && formData.fields.length > 0) {
      await Session.findOneAndUpdate(
        { phone: customerNumber, userId }, 
        { formId: formData._id, formFieldIndex: 0, workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, 
        { upsert: true, new: true }
      );
      await FormResponse.create({ formId: formData._id, userId, phone: customerNumber, data: {}, status: "incomplete" });
      const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
      await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, { message: textMsg, stepType: "text" });
      startFormInactivityTimer(customerNumber, userId, formData._id.toString(), 0, formData.fields[0], formData, accessToken, phoneNumberId);
    }
    return;
  }

  if (step.stepType === "inactivity_node" || step.stepType === "tag_node" || step.stepType === "opt_in_node") return;

  await sendWorkflowWhatsAppMessage(accessToken, phoneNumberId, customerNumber, step);
  
  await Message.create({ 
    userId, 
    phone: customerNumber, 
    text: step.message || `[${step.stepType?.toUpperCase()}]`, 
    direction: "out", 
    messageType: step.mediaType || "text",
    mediaUrl: step.mediaUrl || null,
  });
  
  await Session.findOneAndUpdate(
    { phone: customerNumber, userId }, 
    { workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() }, 
    { upsert: true, new: true }
  );

  if (step.buttons && step.buttons.length > 0) {
    startWorkflowInactivityTimer(customerNumber, userId, matchedWorkflow._id.toString(), accessToken, phoneNumberId);
  }
}

async function sendWorkflowWhatsAppMessage(accessToken: string, phoneNumberId: string, to: string, step: any) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  let payload: any;
  let resolvedMediaId: string | null = null;

  if (step.mediaUrl && step.mediaType && step.mediaType !== "link") {
    const mediaUrl = String(step.mediaUrl);
    if (/^\d+$/.test(mediaUrl)) {
      resolvedMediaId = mediaUrl;
    } else {
      resolvedMediaId = await uploadMediaToMetaFromUrl(phoneNumberId, accessToken, mediaUrl);
    }
  }

  const buildMediaObj = () => {
    if (resolvedMediaId) return { id: resolvedMediaId };
    if (step.mediaUrl && (String(step.mediaUrl).startsWith("http://") || String(step.mediaUrl).startsWith("https://"))) {
      return { link: step.mediaUrl };
    }
    return null;
  };

  if (step.stepType === "url_action" && step.url) {
    payload = {
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: {
        type: "cta_url",
        header: { type: "text", text: step.urlLabel || "Visit Link" },
        body: { text: step.message || "Click the button below" },
        cta: { title: step.urlLabel || "Open Link", url: step.url },
      },
    };
  } else if (step.stepType === "call_action" && step.phoneNumber) {
    payload = {
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: {
        type: "cta_url",
        header: { type: "text", text: step.urlLabel || "Call Us" },
        body: { text: step.message || "Click to call" },
        cta: { title: step.urlLabel || "Call Now", url: `tel:${step.phoneNumber}` },
      },
    };
  } else if (step.buttons && step.buttons.length > 0) {
    const validButtons = step.buttons.filter((b: any) => b.label?.trim());

    if (validButtons.length > 3) {
      const rows = validButtons.slice(0, 10).map((btn: any) => ({ id: btn.id, title: btn.label.substring(0, 24) }));
      payload = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "Options" },
          body: { text: step.message || "Please select an option" },
          action: { button: step.listButtonText || "Options", sections: [{ title: "Choices", rows }] },
        },
      };

      const mediaObj = buildMediaObj();
      if (mediaObj && step.mediaType) {
        if (step.mediaType === "image") payload.interactive.header = { type: "image", image: mediaObj };
        else if (step.mediaType === "video") payload.interactive.header = { type: "video", video: mediaObj };
        else if (step.mediaType === "document") payload.interactive.header = { type: "document", document: { ...mediaObj, filename: "Document" } };
      }
    } else {
      const buttons = validButtons.slice(0, 3).map((btn: any) => ({ type: "reply", reply: { id: btn.id, title: btn.label.substring(0, 20) } }));
      payload = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: {
          type: "button",
          body: { text: step.message || "" },
          action: { buttons },
        },
      };

      const mediaObj = buildMediaObj();
      if (mediaObj && step.mediaType) {
        if (step.mediaType === "image") payload.interactive.header = { type: "image", image: mediaObj };
        else if (step.mediaType === "video") payload.interactive.header = { type: "video", video: mediaObj };
        else if (step.mediaType === "document") payload.interactive.header = { type: "document", document: { ...mediaObj, filename: "Document" } };
      }
    }
  } else {
    const mediaObj = buildMediaObj();

    if (step.mediaUrl && step.mediaType === "link") {
      payload = {
        messaging_product: "whatsapp", to, type: "text",
        text: { body: step.message ? `${step.message}\n\n${step.mediaUrl}` : step.mediaUrl, preview_url: true },
      };
    } else if (step.mediaUrl && step.mediaType === "image" && mediaObj) {
      payload = { messaging_product: "whatsapp", to, type: "image", image: { ...mediaObj, ...(step.message ? { caption: step.message } : {}) } };
    } else if (step.mediaUrl && step.mediaType === "video" && mediaObj) {
      payload = { messaging_product: "whatsapp", to, type: "video", video: { ...mediaObj, ...(step.message ? { caption: step.message } : {}) } };
    } else if (step.mediaUrl && step.mediaType === "audio" && mediaObj) {
      payload = { messaging_product: "whatsapp", to, type: "audio", audio: mediaObj };
    } else if (step.mediaUrl && step.mediaType === "document" && mediaObj) {
      payload = { messaging_product: "whatsapp", to, type: "document", document: { ...mediaObj, filename: "Document", ...(step.message ? { caption: step.message } : {}) } };
    } else {
      payload = { messaging_product: "whatsapp", to, type: "text", text: { body: step.message || "", preview_url: true } };
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) console.error(`❌ [WORKFLOW] API error:`, JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error(`❌ [WORKFLOW] Failed to send:`, err.message);
  }
}

async function applyTagToContact(phoneNumber: string, tagId: string, userId: string) {
  try {
    const { default: Contact } = await import("@/models/Contact");
    await Contact.findOneAndUpdate({ phone: phoneNumber, userId }, { $addToSet: { tags: tagId } }, { upsert: true });
  } catch (err) {}
}

async function addOptInNumber(phoneNumber: string, userId: string) {
  try {
    const { default: OptNumber } = await import("@/models/OptNumber");
    await OptNumber.findOneAndUpdate({ phone: phoneNumber, userId }, { phone: phoneNumber, userId, optedIn: true }, { upsert: true });
  } catch (err) {}
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const allNumbers = await getAllWhatsappNumbersFromDB();
      if (allNumbers.length === 0) return NextResponse.json({ success: true, pulled: 0 });
      await Promise.all(allNumbers.map((num) => forcePullMessages(num)));
      return NextResponse.json({ success: true, pulled: allNumbers.length, numbers: allNumbers.map((n) => n.name) });
    }

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

        // ═══════════════════════════════════════════════════════════════
        // ✅ SAVE CONTACT NAME AUTOMATICALLY FROM META PAYLOAD
        // ═══════════════════════════════════════════════════════════════
        const contactInfo = value.contacts?.[0];
        if (contactInfo?.profile?.name && contactInfo?.wa_id) {
          try {
            const { default: Contact } = await import("@/models/Contact");
            await Contact.findOneAndUpdate(
              { phone: contactInfo.wa_id, userId: num.userId },
              { name: contactInfo.profile.name, phone: contactInfo.wa_id },
              { upsert: true }
            );
          } catch (e) {
            console.error("Failed to save contact name:", e);
          }
        }

        // Process Incoming Messages
        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;
          await processAndSaveMessage(msg, num);
          await executeWorkflowsForMessage(msg, num);
        }

        // ═══════════════════════════════════════════════════════════════
        // ✅ PROCESS OUTBOUND MESSAGE STATUSES (Sent, Delivered, Read, Failed)
        // ═══════════════════════════════════════════════════════════════
        for (const statusObj of value.statuses || []) {
          const { id, status, recipient_id, errors } = statusObj;
          
          // 1. Update the generic Message model ONLY when delivered or read (as requested)
          if (status === "delivered" || status === "read") {
            await Message.updateOne(
              { whatsappMessageId: id }, 
              { $set: { status, error: null } }
            );
          }

          // 2. Update Campaign Report Data dynamically
          try {
            const { default: Campaign } = await import("@/models/Campaign");
            
            // Find campaigns for this user that contain this phone number
            const campaigns = await Campaign.find({ 
                userId: num.userId,
                $or: [
                  { "reportData.phone": recipient_id },
                  { "reportData.phone": `+${recipient_id}` }
                ]
            });

            for (const camp of campaigns) {
                let isModified = false;
                for (const item of camp.reportData) {
                    if (item.phone === recipient_id || item.phone === `+${recipient_id}`) {
                        // ✅ Use the robust status priority checker
                        if (shouldUpdateStatus(item.status, status)) {
                            item.status = status;
                            if (status === "failed" || status === "invalid") {
                                item.error = errors?.[0]?.message || "Failed to send";
                            } else {
                                item.error = null; // Clear error if it somehow recovers
                            }
                            isModified = true;
                        }
                    }
                }
                
                if (isModified) {
                    camp.markModified("reportData"); // Force Mongoose to detect array changes
                    await camp.save();
                    console.log(`📊 [CAMPAIGN] Updated status to ${status} for ${recipient_id} in ${camp.name}`);
                }
            }
          } catch (campErr) {
            console.error("Failed to update campaign report status:", campErr);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ [WEBHOOK] Fatal Error:", error);
    return NextResponse.json({ success: true });
  }
}
