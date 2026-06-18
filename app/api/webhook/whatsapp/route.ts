/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Campaign from "@/models/Campaign";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import Session from "@/models/Session";
import Contact from "@/models/Contact";
import Tag from "@/models/Tag";
import OptNumber from "@/models/OptNumber"; // 🔴 IMPORTED OPT-NUMBER MODEL
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const VERIFY_TOKEN = "my_secret_token";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!mode && !token && !challenge)
      return new Response("WhatsApp Webhook Endpoint is Live ✅", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    if (mode === "subscribe" && token === VERIFY_TOKEN)
      return new Response(challenge || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

    return new Response("Forbidden", { status: 403 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    if (!value) return NextResponse.json({ success: true });

    await connectDB();

    // ==========================================
    // IDENTIFY USER
    // ==========================================
    const metadataPhoneNumberId = value?.metadata?.phone_number_id;
    let userId: string | null = null;
    let ownerUser: any = null;

    if (metadataPhoneNumberId) {
      ownerUser = await User.findOne({
        whatsappPhoneNumberId: metadataPhoneNumberId,
      });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    if (!userId) {
      ownerUser = await User.findOne().sort({ _id: -1 });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    // ==========================================
    // 1. HANDLE MESSAGE STATUSES
    // ==========================================
    if (value.statuses && value.statuses.length > 0) {
      try {
        const statusUpdate = value.statuses[0];
        let statusPhone = statusUpdate.recipient_id;
        const newStatus = statusUpdate.status;
        const errorCode = statusUpdate.errors?.[0]?.code;
        const errorSubcode = statusUpdate.errors?.[0]?.error_subcode;
        const errorDetails = String(
          statusUpdate.errors?.[0]?.error_data?.details || ""
        ).toLowerCase();

        if (statusPhone.startsWith("whatsapp:"))
          statusPhone = statusPhone.replace("whatsapp:", "");
        statusPhone = statusPhone.replace(/\+/g, "");

        if (statusPhone && newStatus) {
          const campaignQuery: any = {
            "reportData.phone": statusPhone,
            status: { $in: ["running", "completed"] },
          };
          if (userId) campaignQuery.userId = userId;

          const campaigns = await Campaign.find(campaignQuery);

          for (const camp of campaigns) {
            if (!camp.reportData) continue;
            const reportIndex = camp.reportData.findIndex(
              (r: any) => r.phone === statusPhone
            );
            if (reportIndex !== -1) {
              const currentItem = camp.reportData[reportIndex];
              let finalStatus = newStatus;

              if (newStatus === "failed" || newStatus === "undelivered") {
                const isInvalidNumber =
                  errorCode === 1005 ||
                  errorCode === 1001 ||
                  errorCode === 1006 ||
                  errorSubcode === 1005 ||
                  errorSubcode === 1001 ||
                  errorDetails.includes("not registered") ||
                  errorDetails.includes("invalid") ||
                  errorDetails.includes("not a whatsapp user") ||
                  errorDetails.includes("unable to find");
                finalStatus = isInvalidNumber ? "invalid" : "failed";
              }

              let shouldUpdate = false;
              if (finalStatus === "failed" || finalStatus === "invalid") {
                shouldUpdate = true;
              } else {
                const statusPriority: any = {
                  read: 5,
                  delivered: 4,
                  sent: 3,
                  invalid: 2,
                  failed: 1,
                  pending: 0,
                };
                if (
                  statusPriority[finalStatus] >
                  (statusPriority[currentItem.status] || 0)
                )
                  shouldUpdate = true;
              }

              if (shouldUpdate) {
                camp.reportData[reportIndex].status = finalStatus;
                camp.markModified("reportData");
                await camp.save();
                console.log(
                  `📊 Updated report status for ${statusPhone} to ${finalStatus}`
                );
              }
            }
          }
        }
      } catch (statusErr) {
        console.error("⚠️ Status Update Error:", statusErr);
      }
      return NextResponse.json({ success: true });
    }

    // ==========================================
    // 2. HANDLE INBOUND MESSAGES
    // ==========================================
    if (!value?.messages?.length) return NextResponse.json({ success: true });

    const message = value.messages[0];

    let rawPhone = message.from;
    if (rawPhone.startsWith("whatsapp:"))
      rawPhone = rawPhone.replace("whatsapp:", "");
    const phone = rawPhone.replace(/\+/g, "");

    const contactName = value.contacts?.[0]?.profile?.name || "Unknown";

    let lowerText = "";
    let textToSave = "";
    let buttonId: string | null = null;
    let messageType = "text";
    let mediaId = null;
    let isButtonReply = false;

    if (message.type === "text") {
      lowerText = message.text?.body?.toLowerCase().trim() || "";
      textToSave = message.text.body.trim();
      messageType = "text";
    } else if (message.type === "interactive") {
      const buttonReply =
        message.interactive?.button_reply || message.interactive?.list_reply;
      textToSave = buttonReply?.title?.trim() || buttonReply?.id?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = buttonReply?.id || null;
      messageType = "text";
      isButtonReply = true;
    } else if (message.type === "button") {
      textToSave =
        message.button?.text?.trim() || message.button?.payload?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = message.button?.payload || null;
      messageType = "text";
      isButtonReply = true;
    } else if (
      ["image", "video", "document", "audio", "sticker"].includes(
        message.type
      )
    ) {
      messageType = message.type;
      mediaId = message[message.type]?.id || null;
      textToSave = message[message.type]?.caption || "";
      lowerText = textToSave.toLowerCase().trim();
      if (message.type === "document")
        textToSave = message[message.type]?.filename || "Document.pdf";
    }

    if (!textToSave && !buttonId && !mediaId)
      return NextResponse.json({ success: true });

    await Message.create({
      userId,
      phone,
      text: textToSave,
      direction: "in",
      messageType,
      mediaUrl: mediaId,
      whatsappMessageId: message.id || null,
      contactName: contactName,
    });
    console.log(`📩 INBOUND SAVED ✔️ for ${phone}`);

    // ==========================================
    // 3. CAMPAIGN REPORT UPDATE & DYNAMIC AUTO-TAGGING
    // ==========================================
    if (textToSave) {
      try {
        const contextId = message?.context?.id || null;
        const targetedCampaigns: any[] = [];

        if (contextId) {
          const exactQuery: any = {
            "reportData.sentWamid": contextId,
            status: { $in: ["running", "completed"] },
          };
          if (userId) exactQuery.userId = userId;
          const exactCampaign = await Campaign.findOne(exactQuery);
          if (exactCampaign) targetedCampaigns.push(exactCampaign);
        }

        if (targetedCampaigns.length === 0) {
          const latestQuery: any = {
            "reportData.phone": phone,
            status: { $in: ["running", "completed"] },
          };
          if (userId) latestQuery.userId = userId;
          const latestCampaign = await Campaign.findOne(latestQuery).sort({
            createdAt: -1,
          });
          if (latestCampaign) targetedCampaigns.push(latestCampaign);
        }

        // Fetch all user tags ONCE to check against the reply
        let userTags: any[] = [];
        if (userId) {
          userTags = await Tag.find({ userId }).select("name isCampaignSpecific campaignId");
        }

        for (const camp of targetedCampaigns) {
          if (!camp.reportData) continue;
          let reportIndex = contextId
            ? camp.reportData.findIndex((r: any) => r.sentWamid === contextId)
            : -1;
          if (reportIndex === -1)
            reportIndex = camp.reportData.findIndex(
              (r: any) => r.phone === phone
            );

          if (reportIndex !== -1) {
            const currentReplies = camp.reportData[reportIndex].replies || [];
            if (currentReplies.length < 5) {
              currentReplies.push(textToSave);
              camp.reportData[reportIndex].replies = currentReplies;
              camp.reportData[reportIndex].status = "read";
              
              // --- DYNAMIC AUTO-TAGGING LOGIC ---
              const currentTags = camp.reportData[reportIndex].tags || [];
              let detectedTags: string[] = [];

              // Check if any word in the reply matches any of the user's tags
              for (const t of userTags) {
                const tagNameLower = t.name.toLowerCase();
                if (tagNameLower && lowerText.includes(tagNameLower)) {
                  
                  if (t.isCampaignSpecific) {
                    if (t.campaignId && t.campaignId.toString() === camp._id.toString()) {
                      detectedTags.push(t.name);
                    }
                  } else {
                    detectedTags.push(t.name);
                  }
                }
              }

              // Add detected tags to the campaign report
              if (detectedTags.length > 0) {
                for (const dt of detectedTags) {
                  if (!currentTags.includes(dt)) {
                    currentTags.push(dt);
                  }
                }
                camp.reportData[reportIndex].tags = currentTags;
              }

              camp.markModified("reportData");
              await camp.save();
              console.log(`📩 Saved reply for ${phone} in Campaign: ${camp.name}`);

              // --- SAVE TO CONTACTS DB (Isolated to prevent crashes) ---
              if (detectedTags.length > 0 && userId) {
                try {
                  for (const dt of detectedTags) {
                    await Tag.findOneAndUpdate(
                      { userId, name: dt },
                      { $setOnInsert: { userId, name: dt } },
                      { upsert: true, new: true }
                    );

                    await Contact.findOneAndUpdate(
                      { userId, phone },
                      { 
                        $setOnInsert: { userId, phone, name: contactName },
                        $addToSet: { tags: dt } 
                      },
                      { upsert: true, new: true }
                    );
                  }
                  console.log(`🏷️ Contact ${phone} tagged as: ${detectedTags.join(", ")}`);
                } catch (tagErr) {
                  console.error("⚠️ Failed to save Contact/Tag globally:", tagErr);
                }
              }
            }
          }
        }
      } catch (reportErr) {
        console.error("⚠️ Campaign Report Update Failed:", reportErr);
      }
    }

    // ==========================================
    // 4. WORKFLOW LOGIC
    // ==========================================
    if (messageType === "text" || isButtonReply) {
      try {
        if (isButtonReply && userId) {
          const session = await Session.findOne({ phone, userId });
          
          if (session) {
            const wf = await Workflow.findById(session.workflowId);
            
            if (wf && wf.steps) {
              let clickedBtn = null;

              for (const stepId in wf.steps) {
                const step = wf.steps[stepId];
                const btn = step.buttons?.find((b: any) => 
                  b.id === buttonId || b.label?.toLowerCase() === lowerText
                );
                if (btn) {
                  clickedBtn = btn;
                  break;
                }
              }

              if (clickedBtn) {
                
                // 🔴 NEW: CHECK IF BUTTON HAS OPT-IN NODE CONNECTED & SAVE NUMBER
                if (clickedBtn.optInNodeId) {
                  try {
                    const existingOpt = await OptNumber.findOne({ userId, phoneNumber: phone });
                    if (!existingOpt) {
                      await OptNumber.create({ userId, phoneNumber: phone });
                      console.log(`📝 Opt-in number saved automatically: ${phone}`);
                    }
                  } catch (optErr) {
                    console.error("⚠️ Failed to save opt-in number:", optErr);
                  }
                }

                if (clickedBtn.nextStepId) {
                  const nextStep = wf.steps[clickedBtn.nextStepId];
                  
                  if (nextStep) {
                    session.currentStepId = nextStep.id;
                    await session.save();

                    await sendWhatsAppMessage(
                      phone, 
                      nextStep, 
                      ownerUser?.whatsappPhoneNumberId, 
                      ownerUser?.whatsappAccessToken
                    );
                    
                    await Message.create({
                      userId,
                      phone,
                      text: nextStep.message || `[${nextStep.stepType?.toUpperCase()}]`,
                      direction: "out",
                      messageType: "text",
                    });
                    console.log(`📤 OUTBOUND WORKFLOW (Next Step) SAVED ✔️`);
                    return NextResponse.json({ success: true });
                  }
                } else {
                  await Session.deleteOne({ _id: session._id });
                  console.log(`🛑 Workflow ended for ${phone}`);
                  return NextResponse.json({ success: true });
                }
              } else {
                await Session.deleteOne({ _id: session._id });
                console.log(`🛑 Workflow ended for ${phone}`);
                return NextResponse.json({ success: true });
              }
            } else {
              await Session.deleteOne({ _id: session._id });
            }
          }
        }

        const workflowQuery: any = {};
        if (userId) workflowQuery.userId = userId;
        const workflows = await Workflow.find(workflowQuery);

        let matchedStepId: string | null = null;
        let matchedWorkflow: any = null;

        const checkText = isButtonReply ? (textToSave || "") : lowerText;

        for (const wf of workflows) {
          const hasMatch = wf.triggers?.some((t: any) => {
            const triggerKeyword = t.keyword.toLowerCase().trim();
            const mode = t.matchMode || "contains";
            if (mode === "exact") return checkText === triggerKeyword;
            else return checkText.includes(triggerKeyword);
          });
          
          if (hasMatch) {
            matchedWorkflow = wf;
            matchedStepId = wf.rootStepId;
            break;
          }
        }

        if (matchedWorkflow && matchedStepId) {
          const step = matchedWorkflow.steps?.[matchedStepId];
          
          if (step && (step.message || step.stepType === "template" || step.stepType === "url_action" || step.stepType === "call_action")) {
            await sendWhatsAppMessage(
              phone, 
              step, 
              ownerUser?.whatsappPhoneNumberId, 
              ownerUser?.whatsappAccessToken
            );
            
            await Message.create({
              userId,
              phone,
              text: step.message || `[${step.stepType?.toUpperCase()}]`,
              direction: "out",
              messageType: "text",
            });
            console.log(`📤 OUTBOUND WORKFLOW (Trigger) SAVED ✔️`);

            await Session.findOneAndUpdate(
              { phone, userId },
              { 
                workflowId: matchedWorkflow._id, 
                currentStepId: step.id,
                updatedAt: new Date() 
              },
              { upsert: true, new: true }
            );
          }
        }
      } catch (workflowError) {
        console.error("⚠️ WORKFLOW CRASHED:", workflowError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ WEBHOOK CRASH:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
