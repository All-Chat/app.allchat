/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   WHATSAPP WEBHOOK - MULTI-ACCOUNT SUPPORT
   =====================================================================
   Flow:
   1. Meta sends webhook with metadata.phone_number_id
   2. We look up which user owns that phone_number_id
   3. We save the message WITH whatsappPhoneNumberId set
   
   ✅ CRITICAL: whatsappPhoneNumberId is saved on EVERY incoming message.
   Without this, the chat page can't filter messages by WABA number.
   
   Setup:
   - Set WHATSAPP_VERIFY_TOKEN in .env
   - In Meta App Dashboard → Webhooks → subscribe to "messages" field
   - Callback URL: https://yourdomain.com/api/webhook/whatsapp
   ===================================================================== */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";

// ─── GET: Webhook Verification (Meta calls this when you set up the webhook) ──
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return new NextResponse(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.error("❌ Webhook verification failed", { mode, token });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST: Incoming Messages from Meta ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Meta sometimes sends test pings or empty bodies
    if (!body?.entry) {
      return NextResponse.json({ success: true });
    }

    await connectDB();

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        // We only care about "messages" changes
        // Other fields: "messages", "messaging_postbacks", "statuses"
        if (change.field !== "messages") continue;

        const value = change.value;
        if (!value) continue;

        // ── ✅ EXTRACT PHONE_NUMBER_ID FROM METADATA ──
        // This is THE key field that links the message to a specific WABA
        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        if (!phoneNumberId) {
          console.error("⚠️ Webhook: No phone_number_id in metadata", JSON.stringify(value.metadata));
          continue;
        }

        // ── FIND THE USER WHO OWNS THIS PHONE NUMBER ──
        // Search in the whatsappNumbers[] array across ALL users
        const user = await User.findOne({
          "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId,
        }).lean();

        if (!user) {
          console.error(`⚠️ Webhook: No user found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // ── PROCESS EACH MESSAGE ──
        for (const msg of value.messages || []) {
          // Skip reactions — they're not real messages
          if (msg.type === "reaction") continue;

          // Skip system messages (number changes, etc.)
          if (msg.type === "system") continue;

          // Find the contact info for this message sender
          const contact = (value.contacts || []).find(
            (c: any) => c.wa_id === msg.from
          );
          const contactName = contact?.profile?.name || null;
          const fromPhone = msg.from;

          // ── PARSE MESSAGE CONTENT ──
          let text = "";
          let messageType: string = "text";
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

            case "contacts":
              const contacts = msg.contacts || [];
              text = contacts
                .map((c: any) => {
                  const name = c.name?.formatted_name || "Unknown";
                  const phones = (c.phones || []).map((p: any) => p.phone).join(", ");
                  return `${name}: ${phones}`;
                })
                .join("\n");
              text = "📇 " + text;
              messageType = "text";
              break;

            case "interactive": {
              // Button replies and list replies
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

            case "button": {
              text = msg.button?.text || "[Button]";
              messageType = "text";
              break;
            }

            case "order": {
              text = "🛒 Order received";
              if (msg.order?.catalog_id) text += `\nCatalog: ${msg.order.catalog_id}`;
              if (msg.order?.text) text += `\n${msg.order.text}`;
              messageType = "text";
              break;
            }

            default:
              text = `[${msg.type || "unknown"}]`;
              messageType = "text";
              break;
          }

          // ── CHECK FOR DUPLICATES ──
          // Meta may retry webhooks; avoid saving duplicate messages
          const existing = await Message.findOne({
            whatsappMessageId: msg.id,
          }).lean();

          if (existing) {
            // Update the whatsappPhoneNumberId if it was missing (backfill)
            if (!existing.whatsappPhoneNumberId && phoneNumberId) {
              await Message.updateOne(
                { _id: existing._id },
                { $set: { whatsappPhoneNumberId: phoneNumberId } }
              );
            }
            continue;
          }

          // ── ✅ SAVE MESSAGE WITH whatsappPhoneNumberId ──
          // This is what makes the chat page filtering work!
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
            whatsappPhoneNumberId: phoneNumberId, // ← THE CRITICAL FIELD
            fromPhone: displayPhoneNumber,
            senderNumber: fromPhone,
            createdAt: msgTimestamp,
          });

          console.log(
            `✅ Saved IN message: ${fromPhone} → WABA[${phoneNumberId}] user[${user._id}]`
          );
        }
      }
    }

    // Always return 200 to Meta (even if we couldn't process some messages)
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Webhook error:", error);
    // Still return 200 so Meta doesn't retry aggressively
    return NextResponse.json({ success: true });
  }
}
