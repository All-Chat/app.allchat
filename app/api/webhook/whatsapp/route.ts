/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   WHATSAPP WEBHOOK - BULLETPROOF DB SAVING
   ===================================================================== */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import mongoose from "mongoose";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "watiX_webhook_verify_2024";

// ─── GET: Meta Verification ────────────────────────────────────────────
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

// ─── FIND USER BY PHONE NUMBER ID ──────────────────────────────────────
async function findUserByPhoneId(phoneNumberId: string): Promise<any> {
  // 1. Check inside array
  let user = await User.findOne({ "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId }).lean();
  if (user) return user;

  // 2. Check top-level
  user = await User.findOne({ whatsappPhoneNumberId: phoneNumberId }).lean();
  if (user) return user;

  // 3. Check parent tenants
  user = await User.findOne({ parentTenantId: { $exists: false }, "whatsappNumbers.whatsappPhoneNumberId": phoneNumberId }).lean();
  if (user) return user;

  user = await User.findOne({ parentTenantId: { $exists: false }, whatsappPhoneNumberId: phoneNumberId }).lean();
  if (user) return user;

  // 4. Brute force all users
  const allUsers = await User.find({}).lean();
  for (const u of allUsers) {
    if (u.whatsappNumbers?.some((n: any) => n.whatsappPhoneNumberId === phoneNumberId)) return u;
    if (u.whatsappPhoneNumberId === phoneNumberId) return u;
  }

  return null;
}

// ─── PARSE MESSAGE CONTENT ────────────────────────────────────────────
function parseMessageContent(msg: any) {
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

  return { text, messageType, mediaId };
}

// ─── POST: INCOMING MESSAGES ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.entry) return NextResponse.json({ success: true });

    await connectDB();

    // Get raw MongoDB collection for BULLETPROOF saving
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection not established");
    }
    const messagesCollection = db.collection("messages");

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        if (!value) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        if (!phoneNumberId) {
          console.error("⚠️ No phone_number_id in metadata");
          continue;
        }

        const user = await findUserByPhoneId(phoneNumberId);
        if (!user) {
          console.error(`❌ NO USER FOUND for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        console.log(`🎯 [WEBHOOK] Matched WABA: ${phoneNumberId} to User: ${user._id}`);

        for (const msg of value.messages || []) {
          if (msg.type === "reaction" || msg.type === "system") continue;

          const contact = (value.contacts || []).find((c: any) => c.wa_id === msg.from);
          const contactName = contact?.profile?.name || null;
          const fromPhone = msg.from;
          const { text, messageType, mediaId } = parseMessageContent(msg);

          // 1. Standard duplicate check
          const exists = await Message.findOne({ whatsappMessageId: msg.id }).lean();
          if (exists) {
            // ✅ BACKFILL: If it exists but missing the ID, force update it
            if (!exists.whatsappPhoneNumberId && phoneNumberId) {
              await messagesCollection.updateOne(
                { _id: exists._id },
                { $set: { whatsappPhoneNumberId: phoneNumberId } }
              );
              console.log(`📦 [BACKFILL] Updated missing ID on ${msg.id}`);
            }
            continue;
          }

          const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();
          const newObjectId = new mongoose.Types.ObjectId();

          // ✅ METHOD 1: Standard Mongoose Save
          try {
            await Message.create({
              _id: newObjectId,
              userId: user._id,
              phone: fromPhone,
              text: text || `[${msg.type}]`,
              direction: "in",
              messageType,
              mediaUrl: mediaId,
              contactName,
              whatsappMessageId: msg.id,
              status: "delivered",
              whatsappPhoneNumberId: phoneNumberId, // Attempting to save
              fromPhone: displayPhoneNumber,
              senderNumber: fromPhone,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            console.log(`✅ [MONGOOSE SAVED] ID: ${msg.id} | WABA: ${phoneNumberId}`);
          } catch (mongooseError) {
            console.error(`⚠️ [MONGOOSE FAILED] Falling back to raw MongoDB...`, mongooseError);
            
            // ✅ METHOD 2: BULLETPROOF RAW MONGODB SAVE
            // This bypasses Mongoose schema validation entirely and forces the field in
            await messagesCollection.insertOne({
              _id: newObjectId,
              userId: user._id,
              phone: fromPhone,
              text: text || `[${msg.type}]`,
              direction: "in",
              messageType,
              mediaUrl: mediaId,
              contactName,
              whatsappMessageId: msg.id,
              status: "delivered",
              whatsappPhoneNumberId: phoneNumberId, // FORCED INTO DB
              fromPhone: displayPhoneNumber,
              senderNumber: fromPhone,
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            console.log(`✅ [RAW DB SAVED] ID: ${msg.id} | WABA: ${phoneNumberId}`);
          }

          // ✅ VERIFICATION STEP: Read it back from DB to prove it saved
          const verify = await messagesCollection.findOne({ _id: newObjectId });
          if (verify && verify.whatsappPhoneNumberId) {
            console.log(`🎉 [VERIFIED] Successfully saved in DB with WABA ID: ${verify.whatsappPhoneNumberId}`);
          } else {
            console.error(`❌ [VERIFICATION FAILED] The WABA ID is STILL missing in the DB!`);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ [WEBHOOK FATAL ERROR]", error);
    return NextResponse.json({ success: true });
  }
}
