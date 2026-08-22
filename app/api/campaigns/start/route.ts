/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import { campaignQueue } from "@/lib/queue";

export const runtime = "nodejs";

function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s.replace(/\\"/g, '"').replace(/\\'/g, "'");
  return s;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ success: false, message: "ID required" }, { status: 400 });

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== userId)
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

    if (["completed", "stopped"].includes(campaign.status)) {
      return NextResponse.json({ success: true, message: "Campaign already completed or stopped." });
    }

    if (campaign.status === "running") {
      const activeCount = await campaignQueue.getActiveCount();
      const waitingCount = await campaignQueue.getWaitingCount();
      if (activeCount > 0 || waitingCount > 0) {
        return NextResponse.json({
          success: true,
          message: "Campaign is already running and has jobs in progress.",
        });
      }
    }

    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    let payer = user;
    if (user.parentTenantId) {
      const p = await User.findOne({ tenantId: user.parentTenantId });
      if (p) payer = p;
    }

    let exPhone = "";
    if (campaign.senderPhoneId) {
      const n = user.whatsappNumbers?.find((n: any) => n._id?.toString() === campaign.senderPhoneId);
      exPhone = n?.whatsappPhoneNumberId || campaign.senderPhoneId;
    }

    let PHONE_NUMBER_ID = cleanStr(exPhone || "");
    let ACCESS_TOKEN = "";
    if (user?.whatsappNumbers?.length > 0) {
      const m = user.whatsappNumbers.find((n: any) =>
        n.whatsappPhoneNumberId === PHONE_NUMBER_ID ||
        n.phoneNumberId === PHONE_NUMBER_ID ||
        n.id === PHONE_NUMBER_ID ||
        n._id?.toString() === PHONE_NUMBER_ID
      );
      if (m) ACCESS_TOKEN = m.whatsappAccessToken || "";
    }
    if (!ACCESS_TOKEN && payer?.whatsappNumbers?.length > 0) {
      const m = payer.whatsappNumbers.find((n: any) =>
        n.whatsappPhoneNumberId === PHONE_NUMBER_ID ||
        n.phoneNumberId === PHONE_NUMBER_ID ||
        n.id === PHONE_NUMBER_ID ||
        n._id?.toString() === PHONE_NUMBER_ID
      );
      if (m) ACCESS_TOKEN = m.whatsappAccessToken || "";
    }
    if (!ACCESS_TOKEN)
      ACCESS_TOKEN = user?.whatsappAccessToken || payer?.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";
    if (!PHONE_NUMBER_ID)
      PHONE_NUMBER_ID = user?.whatsappPhoneNumberId || payer?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN)
      return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });

    const cat = (campaign.templateCategory || "MARKETING").toUpperCase().trim();
    const bPrice = getPriceForCategory(payer, cat);

    if (bPrice > 0 && (payer.balance || 0) < bPrice)
      return NextResponse.json({ success: false, message: `Insufficient balance.` }, { status: 402 });

    const totalNumbers = campaign.phoneNumbers.length;

    // ✅ Lock in pricePerMessage only (no totalDeducted — calculated from delivered)
    await Campaign.updateOne(
      { _id: campaignId },
      {
        $set: {
          status: "running",
          whatsappPhoneNumberId: PHONE_NUMBER_ID,
          pricePerMessage: bPrice,
        },
      }
    );

    // Reset queued messages to pending
    await Campaign.updateOne(
      { _id: campaignId },
      { $set: { "reportData.$[elem].status": "pending" } },
      { arrayFilters: [{ "elem.status": "queued" }] }
    );

    // ═══════════════════════════════════════════════════════════════
    // ✅ REMOVED: Transaction.insertMany() for ALL phone numbers
    //
    // Previously this created transactions for ALL numbers upfront
    // with status "success" — even before messages were sent.
    // This caused the transaction history to show wrong amount.
    //
    // Transactions should ONLY be created in the WORKER after
    // each message is actually DELIVERED (sent + delivered + read + replied).
    // ═══════════════════════════════════════════════════════════════

    // Divide numbers into chunks of 10
    const CHUNK_SIZE = 10;
    const jobs = [];

    for (let i = 0; i < totalNumbers; i += CHUNK_SIZE) {
      const endIdx = Math.min(i + CHUNK_SIZE, totalNumbers);

      jobs.push({
        name: 'send-chunk',
        data: {
          campaignId,
          userId,
          payerId: payer._id.toString(),
          startIdx: i,
          endIdx: endIdx,
          PHONE_NUMBER_ID,
          ACCESS_TOKEN,
          pricePerMessage: bPrice,  // ✅ Pass price to worker
        },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          jobId: `${campaignId}-chunk-${i}`,
        }
      });
    }

    await campaignQueue.addBulk(jobs);

    return NextResponse.json({ success: true, message: "Campaign started in background queue!" });
  } catch (error: any) {
    console.error("❌ Start Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
