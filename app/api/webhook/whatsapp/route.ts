/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   WHATSAPP WEBHOOK - FORCED MULTI-ACCOUNT (PULL + PUSH HYBRID)
   =====================================================================
   1. GET  -> Meta verification
   2. POST -> Receives webhooks from Meta AND can be triggered to pull
   3. CRON -> Calls POST every 1 second to force-fetch from ALL numbers
   ===================================================================== */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";

// ─── GET: Meta Webhook Verification ────────────────────────────────────
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

// ─── EXTRACT ALL UNIQUE WHATSAPP NUMBERS FROM DB ───────────────────────
// Returns array of { userId, name, phoneNumberId, accessToken, wabaId }
async function getAllWhatsappNumbersFromDB() {
  await connectDB();
  const users = await User.find({}).lean();
  const numbers: any[] = [];

  for (const user of users) {
    // 1. Extract from array
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

    // 2. Extract from top-level (if different from array)
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

// ─── FORCE PULL MESSAGES FROM A SINGLE NUMBER ──────────────────────────
async function forcePullMessages(num: any) {
  try {
    const since = Math.floor((Date.now() - 5000) / 1000); // Last 5 seconds
    const url = `https://graph.facebook.com/v21.0/${num.phoneNumberId}/messages?fields=id,from,to,type,text,image,video,audio,document,location,contacts,interactive,button,stamp,timestamp,reply_to&limit=50&since=${since}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${num.accessToken}` },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error(`❌ [PULL] API Error for ${num.name} (${num.phoneNumberId}):`, errData.error?.message || res.statusText);
      return;
    }

    const data = await res.json();
    const msgs = data.data || [];

    if (msgs.length === 0) return; // Silent exit if no messages

    console.log(`📨 [PULL] Found ${msgs.length} new message(s) for ${num.name} (${num.phoneNumberId})`);

    for (const msg of msgs) {
      // Only process INCOMING messages (where 'from' is not our number)
      if (!msg.from || msg.from === num.phoneNumberId.replace(/^\d+/, "")) continue;

      await processAndSaveMessage(msg, num);
    }
  } catch (err) {
    console.error(`❌ [PULL] Exception pulling for ${num.name}:`, err);
  }
}

// ─── PROCESS AND SAVE SINGLE MESSAGE ──────────────────────────────────
async function processAndSaveMessage(msg: any, num: any) {
  // 1. Duplicate check
  const exists = await Message.findOne({ whatsappMessageId: msg.id }).lean();
  if (exists) {
    // Backfill phoneNumberId if missing
    if (!exists.whatsappPhoneNumberId && num.phoneNumberId) {
      await Message.updateOne({ _id: exists._id }, { $set: { whatsappPhoneNumberId: num.phoneNumberId } });
    }
    return;
  }

  // 2. Parse message content
  let text = "";
  let messageType = "text";
  let mediaId: string | null = null;

  switch (msg.type) {
    case "text": text = msg.text?.body || ""; break;
    case "image": text = msg.image?.caption || ""; messageType = "image"; mediaId = msg.image?.id; break;
    case "video": text = msg.video?.caption || ""; messageType = "video"; mediaId = msg.video?.id; break;
    case "document": text = msg.document?.filename || "Document"; messageType = "document"; mediaId = msg.document?.id; break;
    case "audio": messageType = "audio"; mediaId = msg.audio?.id; break;
    case "sticker": messageType = "sticker"; mediaId = msg.sticker?.id; break;
    case "interactive":
      text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
      break;
    default: text = `[${msg.type}]`; break;
  }

  // 3. Save to DB
  const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

  await Message.create({
    userId: num.userId,
    phone: msg.from,
    text: text,
    direction: "in",
    messageType: messageType,
    mediaUrl: mediaId,
    whatsappMessageId: msg.id,
    status: "delivered",
    whatsappPhoneNumberId: num.phoneNumberId, // FORCED SAVE
    senderNumber: msg.from,
    createdAt: timestamp,
  });

  console.log(
    `   ✅ [SAVED] From: ${msg.from} | Type: ${msg.type} | Text: "${text.substring(0, 40)}..." | WABA: ${num.name}`
  );
}

// ─── POST: WEBHOOK RECEIVER + FORCED PULL TRIGGER ──────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    // 🚀 FORCE PULL TRIGGER: If called without body (by cron), pull from ALL numbers
    const contentType = req.headers.get("content-type") || "";
    
    if (!contentType.includes("application/json")) {
      console.log("🔄 [CRON] Triggering forced pull for ALL WhatsApp numbers...");
      const allNumbers = await getAllWhatsappNumbersFromDB();
      
      if (allNumbers.length === 0) {
        console.log("⚠️ [CRON] No WhatsApp numbers found in DB!");
        return NextResponse.json({ success: true, pulled: 0 });
      }

      console.log(`📋 [CRON] Found ${allNumbers.length} number(s) to poll:`);
      allNumbers.forEach(n => console.log(`   → ${n.name} (${n.phoneNumberId})`));

      // Pull from all numbers concurrently
      await Promise.all(allNumbers.map(num => forcePullMessages(num)));

      return NextResponse.json({ success: true, pulled: allNumbers.length, numbers: allNumbers.map(n => n.name) });
    }

    // 📨 META WEBHOOK RECEIVER: Process incoming payload from Meta
    const body = await req.json();
    if (!body?.entry) return NextResponse.json({ success: true });

    console.log("📥 [WEBHOOK] Received payload from Meta");

    // First, get all numbers to map phone_number_id to userId
    const allNumbers = await getAllWhatsappNumbersFromDB();
    const numberMap = new Map<string, any>();
    allNumbers.forEach(n => numberMap.set(n.phoneNumberId, n));

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        
        // FIND THE NUMBER
        const num = numberMap.get(phoneNumberId);
        
        if (!num) {
          console.error(`❌ [WEBHOOK] Received message for UNREGISTERED phone_number_id: ${phoneNumberId}`);
          console.error(`   Please ensure this ID is in your User DB (top-level or whatsappNumbers array).`);
          continue;
        }

        console.log(`🎯 [WEBHOOK] Matched to: ${num.name} (${phoneNumberId})`);

        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;
          await processAndSaveMessage(msg, num);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ [WEBHOOK] Fatal Error:", error);
    return NextResponse.json({ success: true }); // Always return 200 to Meta
  }
}
