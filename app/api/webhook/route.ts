/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Workflow from "@/models/Workflow";
import User from "@/models/User"; // ADDED: To find which user owns this number
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export async function POST(req: Request) {
  try {
    console.log("🚀 Webhook POST hit");

    const body = await req.json();

    await connectDB();

    const value = body?.entry?.[0]?.changes?.[0]?.value;

    // ===============================
    // IGNORE NON-MESSAGE EVENTS
    // ===============================
    if (!value?.messages?.length) {
      console.log("ℹ️ Not a message event (ignored)");
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

    console.log("📩 Incoming message:", phone, "->", incoming);

    // ===============================
    // IDENTIFY USER (CRITICAL FOR MULTI-TENANT)
    // ===============================
    // Since Meta calls this webhook directly, there's no NextAuth session.
    // We find the user based on the WhatsApp Phone Number ID Meta sends.
    const metadataPhoneNumberId = value?.metadata?.phone_number_id;
    let userId: string | null = null;

    if (metadataPhoneNumberId) {
      const ownerUser = await User.findOne({ whatsappPhoneNumberId: metadataPhoneNumberId });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    // Fallback: If you only have 1 user on the platform, assign it to them
    if (!userId) {
      const fallbackUser = await User.findOne().sort({ _id: -1 });
      if (fallbackUser) userId = fallbackUser._id.toString();
    }

    // ===============================
    // SAVE INCOMING MESSAGE
    // ===============================
    await Message.create({
      userId, // ADDED: Tie to the user who owns this number
      phone,
      text,
      direction: "in",
    });

    // ===============================
    // LOAD WORKFLOWS FOR THIS USER
    // ===============================
    const workflowQuery = userId ? { userId } : {};
    const workflows = await Workflow.find(workflowQuery);

    console.log("🔍 Workflows found:", workflows.length);

    let matched = false;

    // ===============================
    // WORKFLOW ENGINE (UPDATED FOR TRIGGERS ARRAY)
    // ===============================
    for (const wf of workflows) {
      // Support both new array format and old single keyword format
      const triggers = wf?.triggers || (wf?.trigger ? [{ keyword: wf.trigger.keyword, matchMode: "exact" }] : []);

      if (triggers.length === 0) continue;

      let isMatch = false;

      for (const trigger of triggers) {
        const keyword = trigger?.keyword?.toLowerCase().trim();
        if (!keyword) continue;

        const matchMode = trigger?.matchMode || "contains";

        if (matchMode === "exact") {
          if (incoming === keyword) isMatch = true;
        } else {
          // Contains mode
          if (incoming.includes(keyword)) isMatch = true;
        }
      }

      if (isMatch) {
        matched = true;
        console.log("⚡ MATCHED WORKFLOW");

        // Support both new steps format and old actions format
        const actions = wf?.actions || [];
        const rootStep = wf?.steps?.[wf?.rootStepId];
        
        const messagesToSend = rootStep ? [rootStep.message] : actions.map((a: any) => a?.message);

        if (messagesToSend.length === 0 || !messagesToSend[0]) {
          console.log("❌ No messages in workflow");
          continue;
        }

        for (const message of messagesToSend) {
          if (!message) continue;

          console.log("📤 Sending message:", message);

          try {
            await sendWhatsAppTemplate(phone, message);
            console.log("✅ Sent successfully");

            // SAVE OUTGOING MESSAGE
            await Message.create({
              userId, // ADDED: Tie to the user who owns this number
              phone,
              text: message,
              direction: "out",
            });
          } catch (err) {
            console.error("❌ Send failed:", err);
          }
        }

        break; // Stop after first matched workflow
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