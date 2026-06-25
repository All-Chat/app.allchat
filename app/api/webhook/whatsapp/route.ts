/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   WHATSAPP WEBHOOK - MULTI-ACCOUNT SUPPORT (BULLETPROOF)
   ===================================================================== */

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
    console.log("✅ Webhook verified");
    return new NextResponse(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/* ─── FIND USER WHO OWNS A PHONE_NUMBER_ID ─────────────────────────────
   Tries 4 different locations where the ID could be stored:
   1. Inside user.whatsappNumbers[].whatsappPhoneNumberId
   2. At user.whatsappPhoneNumberId (top-level)
   3. Inside parent tenant's whatsappNumbers[]
   4. At parent tenant's whatsappPhoneNumberId (top-level)
   ────────────────────────────────────────────────────────────────────── */
async function findUserByPhoneId(phoneNumberId: string): Promise<Record<string, unknown> | null> {
  // 1. Search inside whatsappNumbers[] array
  let user = await User.findOne({
    "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId,
  }).lean();

  if (user) {
    console.log(`🔍 Found user [${user._id}] via whatsappNumbers[] array`);
    return user;
  }

  // 2. Search at top-level whatsappPhoneNumberId field
  user = await User.findOne({
    whatsappPhoneNumberId: phoneNumberId,
  }).lean();

  if (user) {
    console.log(`🔍 Found user [${user._id}] via top-level whatsappPhoneNumberId`);
    return user;
  }

  // 3. Search inside ALL parent tenants' whatsappNumbers[] arrays
  // (in case this is a sub-user and the number is on the parent)
  const allParentTenants = await User.find({
    parentTenantId: { $exists: false },
    "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId,
  }).lean();

  if (allParentTenants.length > 0) {
    console.log(`🔍 Found parent tenant [${allParentTenants[0]._id}] via parent's whatsappNumbers[] array`);
    return allParentTenants[0];
  }

  // 4. Search ALL parent tenants' top-level field
  const parentTopLevel = await User.findOne({
    parentTenantId: { $exists: false },
    whatsappPhoneNumberId: phoneNumberId,
  }).lean();

  if (parentTopLevel) {
    console.log(`🔍 Found parent tenant [${parentTopLevel._id}] via parent's top-level whatsappPhoneNumberId`);
    return parentTopLevel;
  }

  // 5. BRUTE FORCE: Fetch ALL users and check manually
  // This handles any weird schema variation
  const allUsers = await User.find({}).lean();
  for (const u of allUsers) {
    // Check array
    if (u.whatsappNumbers?.length > 0) {
      for (const n of u.whatsappNumbers) {
        if (n.whatsappPhoneNumberId === phoneNumberId) {
          console.log(`🔍 BRUTE FORCE: Found user [${u._id}] in whatsappNumbers[]`);
          return u;
        }
      }
    }
    // Check top-level
    if (u.whatsappPhoneNumberId === phoneNumberId) {
      console.log(`🔍 BRUTE FORCE: Found user [${u._id}] at top-level`);
      return u;
    }
  }

  return null;
}

/* ─── PARSE INCOMING MESSAGE ─────────────────────────────────────────── */
function parseMessage(msg: any) {
  let text = "";
  let messageType = "text";
  let mediaId: string | null = null;

  switch (msg.type) {
    case "text":
      text = msg.text?.body || "";
      messageType = "text";
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
      text = msg.document?.caption || msg.document?.filename || "Document";
      messageType = "document";
      mediaId = msg.document?.id || null;
      break;

    case "audio":
      text = "";
      messageType = "audio";
      mediaId = msg.audio?.id || null;
      break;

    case "sticker":
      text = "";
      messageType = "sticker";
      mediaId = msg.sticker?.id || null;
      break;

    case "location":
      text = `📍 ${msg.location?.latitude?.toFixed(6)}, ${msg.location?.longitude?.toFixed(6)}`;
      if (msg.location?.name) text += `\n${msg.location.name}`;
      if (msg.location?.address) text += `\n${msg.location.address}`;
      messageType = "text";
      break;

    case "contacts": {
      const contacts = msg.contacts || [];
      text = "📇 " + contacts
        .map((c: any) => {
          const name = c.name?.formatted_name || "Unknown";
          const phones = (c.phones || []).map((p: any) => p.phone).join(", ");
          return `${name}: ${phones}`;
        })
        .join("\n");
      messageType = "text";
      break;
    }

    case "interactive": {
      if (msg.interactive?.type === "button_reply") {
        text = msg.interactive.button_reply?.title || "";
      } else if (msg.interactive?.type === "list_reply") {
        text = msg.interactive.list_reply?.title || "";
        if (msg.interactive.list_reply?.description) {
          text += "\n" + msg.interactive.list_reply.description;
        }
      }
      messageType = "text";
      break;
    }

    case "button":
      text = msg.button?.text || "[Button]";
      messageType = "text";
      break;

    case "order":
      text = "🛒 Order received";
      if (msg.order?.text) text += `\n${msg.order.text}`;
      messageType = "text";
      break;

    default:
      text = `[${msg.type || "unknown"}]`;
      messageType = "text";
      break;
  }

  return { text, messageType, mediaId };
}

/* ─── POST: INCOMING MESSAGES ────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.entry) {
      return NextResponse.json({ success: true });
    }

    await connectDB();

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        if (!phoneNumberId) {
          console.error("⚠️ No phone_number_id in metadata", JSON.stringify(value.metadata));
          continue;
        }

        // ── FIND USER (tries all 5 strategies) ──
        const user = await findUserByPhoneId(phoneNumberId);

        if (!user) {
          console.error(`❌ NO USER FOUND for phone_number_id: ${phoneNumberId}`);
          console.error(`   Display phone: ${displayPhoneNumber}`);
          // Don't continue — log and skip
          continue;
        }

        // ── PROCESS MESSAGES ──
        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;

          const contact = (value.contacts || []).find(
            (c: any) => c.wa_id === msg.from
          );
          const contactName = contact?.profile?.name || null;
          const fromPhone = msg.from;

          const { text, messageType, mediaId } = parseMessage(msg);

          // ── CHECK DUPLICATE ──
          const existing = await Message.findOne({
            whatsappMessageId: msg.id,
          }).lean();

          if (existing) {
            // Backfill whatsappPhoneNumberId if missing
            if (!existing.whatsappPhoneNumberId && phoneNumberId) {
              await Message.updateOne(
                { _id: existing._id },
                { $set: { whatsappPhoneNumberId: phoneNumberId } }
              );
              console.log(`📦 Backfilled whatsappPhoneNumberId on existing message ${msg.id}`);
            }
            continue;
          }

          // ── SAVE ──
          const msgTimestamp = msg.timestamp
            ? new Date(parseInt(msg.timestamp) * 1000)
            : new Date();

          await Message.create({
            userId: user._id,
            phone: fromPhone,
            text: text || `[${msg.type}]`,
            direction: "in",
            messageType,
            mediaUrl: mediaId,
            contactName,
            whatsappMessageId: msg.id,
            status: "delivered",
            whatsappPhoneNumberId: phoneNumberId,
            fromPhone: displayPhoneNumber,
            senderNumber: fromPhone,
            createdAt: msgTimestamp,
          });

          console.log(
            `✅ IN msg saved: ${fromPhone} → WABA[${phoneNumberId.substring(0, 8)}...] user[${user._id}] type=${messageType}`
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json({ success: true });
  }
}
