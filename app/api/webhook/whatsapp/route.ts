/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";

// ─── GET: Webhook Verification ─────────────────────────────────────────
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

// ─── GET ALL WHATSAPP NUMBERS FROM DB ──────────────────────────────────
async function getAllWhatsappNumbersFromDB() {
  await connectDB();
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
      const alreadyExists = numbers.some(
        (n) => n.phoneNumberId === user.whatsappPhoneNumberId
      );
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

// ─── FORCE PULL MESSAGES (CRON) ────────────────────────────────────────
async function forcePullMessages(num: any) {
  try {
    const since = Math.floor((Date.now() - 5000) / 1000);
    const url = `https://graph.facebook.com/v21.0/${num.phoneNumberId}/messages?fields=id,from,type,text,image,video,audio,document,location,contacts,interactive,button,timestamp&limit=50&since=${since}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${num.accessToken}` },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(
        `❌ [PULL] API Error for ${num.name}:`,
        errData.error?.message || res.statusText
      );
      return;
    }

    const data = await res.json();
    const msgs = data.data || [];
    if (msgs.length === 0) return;

    console.log(`📨 [PULL] Found ${msgs.length} message(s) for ${num.name}`);

    for (const msg of msgs) {
      if (!msg.from) continue;
      await processAndSaveMessage(msg, num);
      // ✅ ALSO EXECUTE WORKFLOWS FOR PULLED MESSAGES
      await executeWorkflowsForMessage(msg, num);
    }
  } catch (err) {
    console.error(`❌ [PULL] Exception for ${num.name}:`, err);
  }
}

// ─── PARSE MESSAGE ─────────────────────────────────────────────────────
function parseMessage(msg: any): {
  text: string;
  messageType: string;
  mediaId: string | null;
} {
  let text = "";
  let messageType = "text";
  let mediaId: string | null = null;

  switch (msg.type) {
    case "text":
      text = msg.text?.body || "";
      break;
    case "button":
      text = msg.button?.text || msg.button?.payload || "";
      messageType = "text";
      break;
    case "interactive":
      text =
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        msg.interactive?.nfm_reply?.response_json ||
        "";
      break;
    case "image":
      text = msg.image?.caption || "";
      messageType = "image";
      mediaId = msg.image?.id || null;
      break;
    case "video":
      text = msg.video?.caption || "";
      messageType = "video";
      mediaId = msg.video?.id || null;
      break;
    case "document":
      text = msg.document?.filename || "Document";
      messageType = "document";
      mediaId = msg.document?.id || null;
      break;
    case "audio":
      messageType = "audio";
      mediaId = msg.audio?.id || null;
      break;
    case "sticker":
      messageType = "sticker";
      mediaId = msg.sticker?.id || null;
      break;
    case "location":
      text = `Location: ${msg.location?.latitude ?? ""},${msg.location?.longitude ?? ""}`;
      break;
    case "contacts":
      text = msg.contacts?.[0]?.name?.formatted_name || "Contact";
      break;
    default:
      text = `[${msg.type}]`;
      break;
  }

  return { text, messageType, mediaId };
}

// ─── EXTRACT BUTTON PAYLOAD ────────────────────────────────────────────
function extractButtonPayload(msg: any): string | null {
  if (msg.type === "interactive") {
    return (
      msg.interactive?.button_reply?.id ||
      msg.interactive?.list_reply?.id ||
      null
    );
  }
  if (msg.type === "button") {
    return msg.button?.payload || msg.button?.text || null;
  }
  return null;
}

// ─── PROCESS AND SAVE MESSAGE ──────────────────────────────────────────
async function processAndSaveMessage(msg: any, num: any) {
  const exists = await Message.findOne({
    whatsappMessageId: msg.id,
  }).lean();
  if (exists) {
    if (!(exists as any).whatsappPhoneNumberId && num.phoneNumberId) {
      await Message.updateOne(
        { _id: (exists as any)._id },
        { $set: { whatsappPhoneNumberId: num.phoneNumberId } }
      );
    }
    return;
  }

  const { text, messageType, mediaId } = parseMessage(msg);

  const timestamp = msg.timestamp
    ? new Date(parseInt(msg.timestamp) * 1000)
    : new Date();

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

  console.log(
    `   ✅ [SAVED] From: ${msg.from} | Type: ${msg.type} | Text: "${text.substring(0, 60)}" | WABA: ${num.name}`
  );
}

// ════════════════════════════════════════════════════════════════════════
// 🔴 WORKFLOW EXECUTION ENGINE
// ════════════════════════════════════════════════════════════════════════
async function executeWorkflowsForMessage(msg: any, num: any) {
  try {
    // Only process text, button, and interactive messages for workflows
    const supportedTypes = ["text", "button", "interactive"];
    if (!supportedTypes.includes(msg.type)) return;

    const incomingText = parseMessage(msg).text;
    const buttonPayload = extractButtonPayload(msg);

    if (!incomingText && !buttonPayload) return;

    console.log(
      `🔄 [WORKFLOW] Checking workflows for user ${num.userId} on number ${num.phoneNumberId} | Text: "${incomingText?.substring(0, 40)}" | BtnPayload: ${buttonPayload}`
    );

    // ──────────────────────────────────────
    // 🔴 FIND ACTIVE WORKFLOWS FOR THIS USER + THIS WABA NUMBER
    // This is the critical query that makes multi-user work.
    // ──────────────────────────────────────
    let workflows = await Workflow.find({
      userId: num.userId,
      wabaPhoneNumberId: num.phoneNumberId,
      active: true,
    });

    // Fallback: Also check workflows without wabaPhoneNumberId
    // (supports workflows created before the wabaPhoneNumberId field was added)
    if (workflows.length === 0) {
      workflows = await Workflow.find({
        userId: num.userId,
        wabaPhoneNumberId: null,
        active: true,
      });
      if (workflows.length > 0) {
        console.log(
          `⚠️ [WORKFLOW] Found ${workflows.length} legacy workflows (no wabaPhoneNumberId) for user ${num.userId}`
        );
      }
    }

    if (workflows.length === 0) return;

    // ──────────────────────────────────────
    // MATCH AGAINST WORKFLOW TRIGGERS
    // ──────────────────────────────────────
    let matchedWorkflow: any = null;
    let matchedByButton = false;

    // Priority 1: Button click → navigate to next step
    if (buttonPayload) {
      for (const wf of workflows) {
        for (const stepId of Object.keys(wf.steps)) {
          const step = wf.steps[stepId];
          const clickedBtn = step.buttons?.find(
            (b: any) =>
              b.id === buttonPayload || b.label === incomingText
          );
          if (clickedBtn?.nextStepId) {
            matchedWorkflow = wf;
            matchedByButton = true;
            console.log(
              `🎯 [WORKFLOW] Button "${incomingText}" matched in workflow ${wf._id}`
            );
            break;
          }
        }
        if (matchedByButton) break;
      }
    }

    // Priority 2: Keyword trigger → new conversation
    if (!matchedWorkflow) {
      for (const wf of workflows) {
        const isMatch = wf.triggers.some((trigger: any) => {
          const keyword = trigger.keyword?.toLowerCase().trim();
          if (keyword === "*" || keyword === "") return true;

          const text = incomingText.toLowerCase().trim();

          if (trigger.matchMode === "exact") {
            return text === keyword;
          } else {
            return text.includes(keyword);
          }
        });

        if (isMatch) {
          matchedWorkflow = wf;
          console.log(
            `🎯 [WORKFLOW] Keyword trigger matched workflow ${wf._id}`
          );
          break;
        }
      }
    }

    if (!matchedWorkflow) {
      console.log(
        `⚠️ [WORKFLOW] No trigger matched for: "${incomingText?.substring(0, 30)}"`
      );
      return;
    }

    // ──────────────────────────────────────
    // EXECUTE THE MATCHED WORKFLOW
    // ──────────────────────────────────────
    const steps = matchedWorkflow.steps;
    let currentStepId: string | null = null;

    // Determine starting point
    if (matchedByButton && buttonPayload) {
      // Find the next step after the clicked button
      for (const stepId of Object.keys(steps)) {
        const step = steps[stepId];
        const clickedBtn = step.buttons?.find(
          (b: any) =>
            b.id === buttonPayload || b.label === incomingText
        );
        if (clickedBtn?.nextStepId) {
          currentStepId = clickedBtn.nextStepId;

          // ✅ Apply tag if button has tagNodeId
          if (clickedBtn.applyTagId) {
            await applyTagToContact(msg.from, clickedBtn.applyTagId, num.userId.toString());
          }
          // ✅ Opt-in if button has optInNodeId
          if (clickedBtn.optInNodeId) {
            await addOptInNumber(msg.from, num.userId.toString());
          }
          break;
        }
      }
    } else {
      // New conversation → start from root
      currentStepId = matchedWorkflow.rootStepId;
    }

    if (!currentStepId || !steps[currentStepId]) {
      console.error("❌ [WORKFLOW] No valid starting step found");
      return;
    }

    console.log(
      `🚀 [WORKFLOW] Executing workflow ${matchedWorkflow._id}, starting at step ${currentStepId}`
    );

    // Process the step chain (handles delays recursively)
    await processWorkflowStep(
      currentStepId,
      steps,
      num.accessToken,
      num.phoneNumberId,
      msg.from
    );
  } catch (err) {
    console.error("❌ [WORKFLOW] Execution error:", err);
  }
}

// ─── PROCESS A WORKFLOW STEP ───────────────────────────────────────────
async function processWorkflowStep(
  stepId: string,
  steps: Record<string, any>,
  accessToken: string,
  phoneNumberId: string,
  customerNumber: string
) {
  const step = steps[stepId];
  if (!step) return;

  // 🔴 HANDLE DELAY NODE
  if (step.stepType === "delay_node") {
    const delaySeconds = step.delaySeconds || 10;
    console.log(
      `⏱️ [WORKFLOW] Delaying for ${delaySeconds} seconds...`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, delaySeconds * 1000)
    );

    // Continue to the next step after delay
    if (step.nextStepId && steps[step.nextStepId]) {
      await processWorkflowStep(
        step.nextStepId,
        steps,
        accessToken,
        phoneNumberId,
        customerNumber
      );
    }
    return;
  }

  // 🔴 SKIP non-sending nodes (handled elsewhere)
  if (
    step.stepType === "inactivity_node" ||
    step.stepType === "tag_node" ||
    step.stepType === "opt_in_node" ||
    step.stepType === "form_node"
  ) {
    return;
  }

  // 🔴 SEND THE MESSAGE
  await sendWorkflowWhatsAppMessage(
    accessToken,
    phoneNumberId,
    customerNumber,
    step
  );
}

// ─── SEND WHATSAPP MESSAGE ─────────────────────────────────────────────
async function sendWorkflowWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  step: any
) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  let payload: any;

  // URL Action
  if (step.stepType === "url_action" && step.url) {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        header: {
          type: "text",
          text: step.urlLabel || "Visit Link",
        },
        body: { text: step.message || "Click the button below" },
        cta: {
          title: step.urlLabel || "Open Link",
          url: step.url,
        },
      },
    };
  }
  // Call Action
  else if (step.stepType === "call_action" && step.phoneNumber) {
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        header: {
          type: "text",
          text: step.urlLabel || "Call Us",
        },
        body: { text: step.message || "Click to call" },
        cta: {
          title: step.urlLabel || "Call Now",
          url: `tel:${step.phoneNumber}`,
        },
      },
    };
  }
  // Message with buttons (>3 = list, ≤3 = buttons)
  else if (step.buttons && step.buttons.length > 0) {
    const validButtons = step.buttons.filter(
      (b: any) => b.label?.trim()
    );

    if (validButtons.length > 3) {
      // LIST MODE
      const rows = validButtons.slice(0, 10).map((btn: any) => ({
        id: btn.id,
        title: btn.label.substring(0, 24),
      }));

      payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "Options" },
          body: {
            text: step.message || "Please select an option",
          },
          action: {
            button: step.listButtonText || "Options",
            sections: [
              {
                title: "Choices",
                rows,
              },
            ],
          },
        },
      };
    } else {
      // BUTTON MODE
      const buttons = validButtons.slice(0, 3).map((btn: any) => ({
        type: "reply",
        reply: {
          id: btn.id,
          title: btn.label.substring(0, 20),
        },
      }));

      payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: step.message || "" },
          action: { buttons },
        },
      };

      // Add media header if exists
      if (step.mediaUrl && step.mediaType === "image") {
        payload.interactive.header = {
          type: "image",
          image: { link: step.mediaUrl },
        };
      } else if (step.mediaUrl && step.mediaType === "video") {
        payload.interactive.header = {
          type: "video",
          video: { link: step.mediaUrl },
        };
      } else if (
        step.mediaUrl &&
        step.mediaType === "document"
      ) {
        payload.interactive.header = {
          type: "document",
          document: {
            link: step.mediaUrl,
            filename: "Document",
          },
        };
      }
    }
  }
  // Plain text or media message (no buttons)
  else {
    if (step.mediaUrl && step.mediaType) {
      payload = {
        messaging_product: "whatsapp",
        to,
        type: step.mediaType,
        [step.mediaType]: {
          link: step.mediaUrl,
          ...(step.mediaType === "document" && {
            filename: "Document",
          }),
          ...(step.message && { caption: step.message }),
        },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: step.message || "" },
      };
    }
  }

  // Send via WhatsApp API
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok) {
      console.log(
        `✅ [WORKFLOW] Message sent to ${to}: "${(step.message || "").substring(0, 50)}..."`
      );
    } else {
      console.error(
        `❌ [WORKFLOW] WhatsApp API error:`,
        JSON.stringify(result, null, 2)
      );
    }
  } catch (err: any) {
    console.error(`❌ [WORKFLOW] Failed to send:`, err.message);
  }
}

// ─── HELPER: Apply tag to contact ──────────────────────────────────────
async function applyTagToContact(
  phoneNumber: string,
  tagId: string,
  userId: string
) {
  try {
    const { default: Contact } = await import("@/models/Contact");
    await Contact.findOneAndUpdate(
      { phoneNumber, userId },
      { $addToSet: { tags: tagId } },
      { upsert: true }
    );
    console.log(`🏷️ [WORKFLOW] Tag ${tagId} applied to ${phoneNumber}`);
  } catch (err) {
    console.error("Failed to apply tag:", err);
  }
}

// ─── HELPER: Add opt-in number ─────────────────────────────────────────
async function addOptInNumber(phoneNumber: string, userId: string) {
  try {
    const { default: OptInNumber } = await import(
      "@/models/OptNumber"
    );
    await OptInNumber.findOneAndUpdate(
      { phoneNumber, userId },
      { phoneNumber, userId, optedIn: true },
      { upsert: true }
    );
    console.log(`📝 [WORKFLOW] Opt-in recorded for ${phoneNumber}`);
  } catch (err) {
    console.error("Failed to add opt-in:", err);
  }
}

// ════════════════════════════════════════════════════════════════════════
// POST: Main webhook handler
// ════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const contentType = req.headers.get("content-type") || "";

    // ─── CRON PULL MODE ────────────────────────────────
    if (!contentType.includes("application/json")) {
      console.log(
        "🔄 [CRON] Triggering forced pull for ALL WhatsApp numbers..."
      );
      const allNumbers = await getAllWhatsappNumbersFromDB();

      if (allNumbers.length === 0) {
        return NextResponse.json({ success: true, pulled: 0 });
      }

      await Promise.all(
        allNumbers.map((num) => forcePullMessages(num))
      );

      return NextResponse.json({
        success: true,
        pulled: allNumbers.length,
        numbers: allNumbers.map((n) => n.name),
      });
    }

    // ─── META WEBHOOK PUSH ─────────────────────────────
    const body = await req.json();
    if (!body?.entry) return NextResponse.json({ success: true });

    console.log("📥 [WEBHOOK] Received payload from Meta");

    const allNumbers = await getAllWhatsappNumbersFromDB();
    const numberMap = new Map<string, any>();
    allNumbers.forEach((n) => numberMap.set(n.phoneNumberId, n));

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const num = numberMap.get(phoneNumberId);

        if (!num) {
          console.error(
            `❌ [WEBHOOK] Unregistered phone_number_id: ${phoneNumberId}`
          );
          continue;
        }

        console.log(
          `🎯 [WEBHOOK] Matched: ${num.name} (${phoneNumberId})`
        );

        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system")
            continue;
          if (msg.type === "button") {
            console.log(
              `🔘 [BUTTON] Raw payload:`,
              JSON.stringify(msg, null, 2)
            );
          }

          // ✅ SAVE MESSAGE FIRST
          await processAndSaveMessage(msg, num);

          // ══════════════════════════════════════════════
          // 🔴 EXECUTE WORKFLOW IF MATCHED
          // This is the NEW addition that makes workflows
          // actually fire when a message comes in.
          // ══════════════════════════════════════════════
          await executeWorkflowsForMessage(msg, num);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ [WEBHOOK] Fatal Error:", error);
    return NextResponse.json({ success: true });
  }
}
