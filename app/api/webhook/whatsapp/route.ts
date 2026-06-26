/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";

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

async function forcePullMessages(num: any) {
  try {
    const since = Math.floor((Date.now() - 5000) / 1000);
    const url = `https://graph.facebook.com/v21.0/${num.phoneNumberId}/messages?fields=id,from,type,text,image,video,audio,document,location,contacts,interactive,button,timestamp&limit=50&since=${since}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${num.accessToken}` },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(`❌ [PULL] API Error for ${num.name}:`, errData.error?.message || res.statusText);
      return;
    }

    const data = await res.json();
    const msgs = data.data || [];
    if (msgs.length === 0) return;

    console.log(`📨 [PULL] Found ${msgs.length} message(s) for ${num.name}`);

    for (const msg of msgs) {
      if (!msg.from) continue;
      await processAndSaveMessage(msg, num);
    }
  } catch (err) {
    console.error(`❌ [PULL] Exception for ${num.name}:`, err);
  }
}

// ─── PARSE MESSAGE — single place, used by both push and pull ──────────
function parseMessage(msg: any): { text: string; messageType: string; mediaId: string | null } {
  let text = "";
  let messageType = "text";
  let mediaId: string | null = null;

  switch (msg.type) {
    case "text":
      text = msg.text?.body || "";
      break;

    // ✅ When a user taps a quick-reply button on a template, Meta sends:
    //    { type: "button", button: { text: "Interested", payload: "Interested" } }
    //    We read msg.button.text which is the label printed on the button.
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

async function processAndSaveMessage(msg: any, num: any) {
  const exists = await Message.findOne({ whatsappMessageId: msg.id }).lean();
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

  console.log(`   ✅ [SAVED] From: ${msg.from} | Type: ${msg.type} | Text: "${text.substring(0, 60)}" | WABA: ${num.name}`);
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      console.log("🔄 [CRON] Triggering forced pull for ALL WhatsApp numbers...");
      const allNumbers = await getAllWhatsappNumbersFromDB();

      if (allNumbers.length === 0) {
        return NextResponse.json({ success: true, pulled: 0 });
      }

      await Promise.all(allNumbers.map((num) => forcePullMessages(num)));

      return NextResponse.json({
        success: true,
        pulled: allNumbers.length,
        numbers: allNumbers.map((n) => n.name),
      });
    }

    // Meta webhook push
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
          console.error(`❌ [WEBHOOK] Unregistered phone_number_id: ${phoneNumberId}`);
          continue;
        }

        console.log(`🎯 [WEBHOOK] Matched: ${num.name} (${phoneNumberId})`);

        // ✅ Log the raw payload for button messages so you can verify in your server logs
        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;
          if (msg.type === "button") {
            console.log(`🔘 [BUTTON] Raw payload:`, JSON.stringify(msg, null, 2));
          }
          await processAndSaveMessage(msg, num);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ [WEBHOOK] Fatal Error:", error);
    return NextResponse.json({ success: true });
  }
}
