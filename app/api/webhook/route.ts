/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export async function POST(req: Request) {
  try {
    console.log("🚀 Webhook POST hit");

    const body = await req.json();

    await connectDB();

    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // Ignore non-message events
    if (!value?.messages?.length) {
      return NextResponse.json({ success: true });
    }

    const msg = value.messages[0];
    const phone = msg.from;

    const text =
      msg?.text?.body ||
      msg?.button?.text ||
      msg?.interactive?.button_reply?.title ||
      msg?.interactive?.list_reply?.title ||
      "";

    const incoming = text.toLowerCase().trim();

    console.log("📩 Incoming:", phone, incoming);

    // =========================
    // IDENTIFY USER (MULTI-TENANT)
    // =========================
    const metadataPhoneNumberId = value?.metadata?.phone_number_id;

    let userId: string | null = null;
    let user: any = null;

    if (metadataPhoneNumberId) {
      user = await User.findOne({
        whatsappPhoneNumberId: metadataPhoneNumberId,
      });

      if (user) userId = user._id.toString();
    }

    if (!userId) {
      user = await User.findOne().sort({ _id: -1 });
      if (user) userId = user._id.toString();
    }

    // =========================
    // SAVE INCOMING MESSAGE
    // =========================
    await Message.create({
      userId,
      phone,
      text,
      direction: "in",
    });

    // =========================
    // LOAD WORKFLOWS
    // =========================
    const workflows = await Workflow.find(userId ? { userId } : {});

    let matched = false;

    // =========================
    // WORKFLOW ENGINE
    // =========================
    for (const wf of workflows) {
      const triggers =
        wf?.triggers ||
        (wf?.trigger
          ? [{ keyword: wf.trigger.keyword, matchMode: "contains" }]
          : []);

      if (!triggers.length) continue;

      let isMatch = false;

      for (const trigger of triggers) {
        const keyword = trigger?.keyword?.toLowerCase().trim();
        const matchMode = trigger?.matchMode || "contains";

        if (!keyword) continue;

        if (matchMode === "exact") {
          if (incoming === keyword) isMatch = true;
        } else {
          if (incoming.includes(keyword)) isMatch = true;
        }
      }

      if (isMatch) {
        matched = true;

        const actions = wf?.actions || [];
        const rootStep = wf?.steps?.[wf?.rootStepId];

        const messagesToSend = rootStep
          ? [rootStep.message]
          : actions.map((a: any) => a?.message);

        for (const message of messagesToSend) {
          if (!message) continue;

          console.log("📤 Sending template message:", message);

          // =========================
          // FIXED CALL (MATCHES YOUR LIB)
          // =========================
          await sendWhatsAppTemplate({
            to: phone,
            templateName: message, // assuming your workflow stores template name here
            languageCode: "en_US",
          });

          await Message.create({
            userId,
            phone,
            text: message,
            direction: "out",
          });
        }

        break;
      }
    }

    if (!matched) {
      console.log("❌ No workflow matched");
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("❌ Webhook error:", err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
