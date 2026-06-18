/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

// Database Models
import Message from "@/models/Message";
import Campaign from "@/models/Campaign";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import Session from "@/models/Session";
import Contact from "@/models/Contact";
import Tag from "@/models/Tag";
import OptNumber from "@/models/OptNumber";
import Form from "@/models/Form";
import FormResponse from "@/models/FormResponse";

// Utilities
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const VERIFY_TOKEN = "my_secret_token";

/* ============================================================================
   1. WEBHOOK VERIFICATION (GET REQUEST)
   ----------------------------------------------------------------------------
   This endpoint is called by Meta/WhatsApp to verify the webhook setup.
   ============================================================================ */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // If no parameters, just return a live status message
    if (!mode && !token && !challenge) {
      return new Response("WhatsApp Webhook Endpoint is Live ✅", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Verify the token sent by Meta
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Return forbidden if verification fails
    return new Response("Forbidden", { status: 403 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}

/* ============================================================================
   2. WEBHOOK RECEIVER (POST REQUEST)
   ----------------------------------------------------------------------------
   Handles all incoming events from WhatsApp: 
   - Message Statuses (sent, delivered, read, failed)
   - Inbound Messages (text, buttons, media)
   - Conversational Forms
   - Campaign Auto-Tagging & Reporting
   - Workflow Execution
   ============================================================================ */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;

    if (!value) return NextResponse.json({ success: true });

    await connectDB();

    // -------------------------------------------------------------------
    // A. IDENTIFY USER (Find which account this WhatsApp number belongs to)
    // -------------------------------------------------------------------
    const metadataPhoneNumberId = value?.metadata?.phone_number_id;
    let userId: string | null = null;
    let ownerUser: any = null;

    if (metadataPhoneNumberId) {
      ownerUser = await User.findOne({ whatsappPhoneNumberId: metadataPhoneNumberId });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    // Fallback: Fetch the most recent user if not found by phone ID
    if (!userId) {
      ownerUser = await User.findOne().sort({ _id: -1 });
      if (ownerUser) userId = ownerUser._id.toString();
    }

    // -------------------------------------------------------------------
    // B. HANDLE MESSAGE STATUSES (Sent, Delivered, Read, Failed)
    // -------------------------------------------------------------------
    if (value.statuses && value.statuses.length > 0) {
      try {
        const statusUpdate = value.statuses[0];
        let statusPhone = statusUpdate.recipient_id;
        const newStatus = statusUpdate.status;
        
        const errorCode = statusUpdate.errors?.[0]?.code;
        const errorSubcode = statusUpdate.errors?.[0]?.error_subcode;
        const errorDetails = String(statusUpdate.errors?.[0]?.error_data?.details || "").toLowerCase();

        // Clean phone number format
        if (statusPhone.startsWith("whatsapp:")) statusPhone = statusPhone.replace("whatsapp:", "");
        statusPhone = statusPhone.replace(/\+/g, "");

        if (statusPhone && newStatus) {
          // Find active campaigns for this phone number
          const campaignQuery: any = {
            "reportData.phone": statusPhone,
            status: { $in: ["running", "completed"] },
          };
          if (userId) campaignQuery.userId = userId;

          const campaigns = await Campaign.find(campaignQuery);

          for (const camp of campaigns) {
            if (!camp.reportData) continue;
            
            const reportIndex = camp.reportData.findIndex((r: any) => r.phone === statusPhone);
            if (reportIndex !== -1) {
              const currentItem = camp.reportData[reportIndex];
              let finalStatus = newStatus;

              // Determine if the number is invalid or just failed
              if (newStatus === "failed" || newStatus === "undelivered") {
                const isInvalidNumber =
                  errorCode === 1005 || errorCode === 1001 || errorCode === 1006 ||
                  errorSubcode === 1005 || errorSubcode === 1001 ||
                  errorDetails.includes("not registered") || errorDetails.includes("invalid") ||
                  errorDetails.includes("not a whatsapp user") || errorDetails.includes("unable to find");
                
                finalStatus = isInvalidNumber ? "invalid" : "failed";
              }

              // Priority logic: Only upgrade status (e.g., don't downgrade 'read' back to 'delivered')
              let shouldUpdate = false;
              if (finalStatus === "failed" || finalStatus === "invalid") {
                shouldUpdate = true;
              } else {
                const statusPriority: any = { read: 5, delivered: 4, sent: 3, invalid: 2, failed: 1, pending: 0 };
                if (statusPriority[finalStatus] > (statusPriority[currentItem.status] || 0)) {
                  shouldUpdate = true;
                }
              }

              // Save the updated status
              if (shouldUpdate) {
                camp.reportData[reportIndex].status = finalStatus;
                camp.markModified("reportData");
                await camp.save();
                console.log(`📊 Updated report status for ${statusPhone} to ${finalStatus}`);
              }
            }
          }
        }
      } catch (statusErr) {
        console.error("⚠️ Status Update Error:", statusErr);
      }
      
      // Return early after handling status
      return NextResponse.json({ success: true });
    }

    // -------------------------------------------------------------------
    // C. HANDLE INBOUND MESSAGES (Text, Interactive, Media)
    // -------------------------------------------------------------------
    if (!value?.messages?.length) return NextResponse.json({ success: true });

    const message = value.messages[0];

    // Extract and clean sender's phone number
    let rawPhone = message.from;
    if (rawPhone.startsWith("whatsapp:")) rawPhone = rawPhone.replace("whatsapp:", "");
    const phone = rawPhone.replace(/\+/g, "");

    const contactName = value.contacts?.[0]?.profile?.name || "Unknown";

    // Message parsing variables
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
      // WhatsApp Interactive Buttons / List Replies
      const buttonReply = message.interactive?.button_reply || message.interactive?.list_reply;
      textToSave = buttonReply?.title?.trim() || buttonReply?.id?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = buttonReply?.id || null;
      messageType = "text";
      isButtonReply = true;
      
    } else if (message.type === "button") {
      // WhatsApp Quick Reply Buttons
      textToSave = message.button?.text?.trim() || message.button?.payload?.trim() || "";
      lowerText = textToSave.toLowerCase();
      buttonId = message.button?.payload || null;
      messageType = "text";
      isButtonReply = true;
      
    } else if (["image", "video", "document", "audio", "sticker"].includes(message.type)) {
      // Media Messages
      messageType = message.type;
      mediaId = message[message.type]?.id || null;
      textToSave = message[message.type]?.caption || "";
      lowerText = textToSave.toLowerCase().trim();
      if (message.type === "document") textToSave = message[message.type]?.filename || "Document.pdf";
    }

    // If no usable content, exit
    if (!textToSave && !buttonId && !mediaId) return NextResponse.json({ success: true });

    // Save the inbound message to the database
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

    // -------------------------------------------------------------------
    // D. CONVERSATIONAL FORM LOGIC 
    // -------------------------------------------------------------------
    // If the user is currently filling out a form, intercept the message here.
    const activeSession = await Session.findOne({ phone, userId });
    
    if (activeSession && activeSession.formId) {
      try {
        const form = await Form.findById(activeSession.formId);
        if (!form) {
          await Session.deleteOne({ _id: activeSession._id });
          return NextResponse.json({ success: true });
        }

        const currentField = form.fields[activeSession.formFieldIndex];
        
        // Save the user's answer to the FormResponse collection
        await FormResponse.findOneAndUpdate(
          { formId: form._id, phone, status: "incomplete" },
          { $set: { [`data.${currentField.label}`]: textToSave } },
          { upsert: true, new: true }
        );

        const nextIndex = activeSession.formFieldIndex + 1;
        
        // If there are more fields to fill, ask the next question
        if (nextIndex < form.fields.length) {
          activeSession.formFieldIndex = nextIndex;
          await activeSession.save();
          
          const nextField = form.fields[nextIndex];
          await sendWhatsAppMessage(
            phone, 
            { message: nextField.label, stepType: "text" }, 
            ownerUser?.whatsappPhoneNumberId, 
            ownerUser?.whatsappAccessToken
          );
        } else {
          // Form is complete. Mark it and notify the user.
          await FormResponse.updateOne(
            { formId: form._id, phone, status: "incomplete" },
            { $set: { status: "complete" } }
          );
          
          // Clear form data from session
          activeSession.formId = null;
          activeSession.formFieldIndex = 0;
          await activeSession.save();
          
          await sendWhatsAppMessage(
            phone, 
            { message: "✅ Thank you! Your form has been submitted successfully.", stepType: "text" }, 
            ownerUser?.whatsappPhoneNumberId, 
            ownerUser?.whatsappAccessToken
          );
        }
        
        return NextResponse.json({ success: true });
      } catch (formErr) {
        console.error("⚠️ Form processing error:", formErr);
        return NextResponse.json({ success: true });
      }
    }

    // -------------------------------------------------------------------
    // E. CAMPAIGN REPORT UPDATE & DYNAMIC AUTO-TAGGING
    // -------------------------------------------------------------------
    if (textToSave) {
      try {
        const contextId = message?.context?.id || null;
        const targetedCampaigns: any[] = [];

        // Attempt to match the reply to a specific campaign via WhatsApp context ID
        if (contextId) {
          const exactQuery: any = {
            "reportData.sentWamid": contextId,
            status: { $in: ["running", "completed"] },
          };
          if (userId) exactQuery.userId = userId;
          const exactCampaign = await Campaign.findOne(exactQuery);
          if (exactCampaign) targetedCampaigns.push(exactCampaign);
        }

        // Fallback: Match to the most recent active campaign for this phone number
        if (targetedCampaigns.length === 0) {
          const latestQuery: any = {
            "reportData.phone": phone,
            status: { $in: ["running", "completed"] },
          };
          if (userId) latestQuery.userId = userId;
          const latestCampaign = await Campaign.findOne(latestQuery).sort({ createdAt: -1 });
          if (latestCampaign) targetedCampaigns.push(latestCampaign);
        }

        // Fetch all user tags once to check against the reply text
        let userTags: any[] = [];
        if (userId) {
          userTags = await Tag.find({ userId }).select("name isCampaignSpecific campaignId");
        }

        for (const camp of targetedCampaigns) {
          if (!camp.reportData) continue;
          
          let reportIndex = contextId ? camp.reportData.findIndex((r: any) => r.sentWamid === contextId) : -1;
          if (reportIndex === -1) reportIndex = camp.reportData.findIndex((r: any) => r.phone === phone);

          if (reportIndex !== -1) {
            const currentReplies = camp.reportData[reportIndex].replies || [];
            
            // Save up to 5 replies per user in the campaign report
            if (currentReplies.length < 5) {
              currentReplies.push(textToSave);
              camp.reportData[reportIndex].replies = currentReplies;
              camp.reportData[reportIndex].status = "read";
              
              // --- Dynamic Auto-Tagging ---
              const currentTags = camp.reportData[reportIndex].tags || [];
              let detectedTags: string[] = [];

              for (const t of userTags) {
                const tagNameLower = t.name.toLowerCase();
                if (tagNameLower && lowerText.includes(tagNameLower)) {
                  // Check if tag is campaign-specific
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
                  if (!currentTags.includes(dt)) currentTags.push(dt);
                }
                camp.reportData[reportIndex].tags = currentTags;
              }

              camp.markModified("reportData");
              await camp.save();

              // Save tags globally to the Contacts DB
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
                      { $setOnInsert: { userId, phone, name: contactName }, $addToSet: { tags: dt } }, 
                      { upsert: true, new: true }
                    );
                  }
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

    // -------------------------------------------------------------------
    // F. WORKFLOW LOGIC (Button Clicks & Triggers)
    // -------------------------------------------------------------------
    if (messageType === "text" || isButtonReply) {
      try {
        // --- F.1: Handle Workflow Button Clicks ---
        if (isButtonReply && userId) {
          const session = activeSession || await Session.findOne({ phone, userId });
          
          if (session) {
            const wf = await Workflow.findById(session.workflowId);
            
            if (wf && wf.steps) {
              let clickedBtn = null;

              // Find which button was clicked across all steps
              for (const stepId in wf.steps) {
                const step = wf.steps[stepId];
                const btn = step.buttons?.find((b: any) => b.id === buttonId || b.label?.toLowerCase() === lowerText);
                if (btn) { clickedBtn = btn; break; }
              }

              if (clickedBtn) {
                
                // Check if Opt-In Node is connected to this button -> Save phone number
                if (clickedBtn.optInNodeId) {
                  try {
                    const existingOpt = await OptNumber.findOne({ userId, phoneNumber: phone });
                    if (!existingOpt) await OptNumber.create({ userId, phoneNumber: phone });
                  } catch (optErr) { 
                    console.error("⚠️ Failed to save opt-in number:", optErr); 
                  }
                }

                if (clickedBtn.nextStepId) {
                  const nextStep = wf.steps[clickedBtn.nextStepId];
                  
                  if (nextStep) {
                    
                    // Check if next step is a Conversational Form
                    if (nextStep.stepType === "form_node" && nextStep.selectedForm) {
                      const formData = await Form.findById(nextStep.selectedForm);
                      if (formData && formData.fields.length > 0) {
                        // Start form session
                        session.formId = formData._id;
                        session.formFieldIndex = 0;
                        await session.save();
                        
                        await FormResponse.create({ formId: formData._id, userId, phone, data: {}, status: "incomplete" });
                        
                        const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
                        await sendWhatsAppMessage(phone, { message: textMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                        return NextResponse.json({ success: true });
                      }
                    }

                    // Normal Step Execution
                    session.currentStepId = nextStep.id;
                    await session.save();
                    
                    await sendWhatsAppMessage(phone, nextStep, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                    await Message.create({ 
                      userId, 
                      phone, 
                      text: nextStep.message || `[${nextStep.stepType?.toUpperCase()}]`, 
                      direction: "out", 
                      messageType: "text" 
                    });
                    
                    return NextResponse.json({ success: true });
                  }
                } else {
                  // No next step connected -> End workflow
                  await Session.deleteOne({ _id: session._id });
                  return NextResponse.json({ success: true });
                }
              } else {
                // Invalid button click -> End workflow
                await Session.deleteOne({ _id: session._id });
                return NextResponse.json({ success: true });
              }
            } else {
              // Workflow was deleted -> Clear session
              await Session.deleteOne({ _id: session._id });
            }
          }
        }

        // --- F.2: Handle Workflow Triggers ---
        const workflowQuery: any = {};
        if (userId) workflowQuery.userId = userId;
        const workflows = await Workflow.find(workflowQuery);

        let matchedStepId: string | null = null;
        let matchedWorkflow: any = null;

        const checkText = isButtonReply ? (textToSave || "") : lowerText;

        // Match the incoming text against workflow triggers
        for (const wf of workflows) {
          const hasMatch = wf.triggers?.some((t: any) => {
            const triggerKeyword = t.keyword.toLowerCase().trim();
            
            // 🔴 Handle "Any Message" Wildcard Trigger (*)
            if (triggerKeyword === "*") return true;
            
            const mode = t.matchMode || "contains";
            if (mode === "exact") return checkText === triggerKeyword;
            if (mode === "contains") return checkText.includes(triggerKeyword);
            
            return false;
          });
          
          if (hasMatch) {
            matchedWorkflow = wf;
            matchedStepId = wf.rootStepId;
            break;
          }
        }

        // Execute matched workflow
        if (matchedWorkflow && matchedStepId) {
          const step = matchedWorkflow.steps?.[matchedStepId];
          
          // Ensure step is valid and has content
          if (step && (step.message || step.stepType === "template" || step.stepType === "url_action" || step.stepType === "call_action" || step.stepType === "form_node")) {
            
            // Check if the trigger starts a Conversational Form
            if (step.stepType === "form_node" && step.selectedForm) {
              const formData = await Form.findById(step.selectedForm);
              if (formData && formData.fields.length > 0) {
                await Session.findOneAndUpdate(
                  { phone, userId },
                  { formId: formData._id, formFieldIndex: 0, workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() },
                  { upsert: true, new: true }
                );
                
                await FormResponse.create({ formId: formData._id, userId, phone, data: {}, status: "incomplete" });
                
                const textMsg = `*${formData.name}*\n\n${formData.fields[0].label}`;
                await sendWhatsAppMessage(phone, { message: textMsg, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
                
                return NextResponse.json({ success: true });
              }
            }

            // Normal Trigger Execution
            await sendWhatsAppMessage(phone, step, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken);
            await Message.create({ 
              userId, 
              phone, 
              text: step.message || `[${step.stepType?.toUpperCase()}]`, 
              direction: "out", 
              messageType: "text" 
            });

            // Create/Update session to track workflow progress
            await Session.findOneAndUpdate(
              { phone, userId },
              { workflowId: matchedWorkflow._id, currentStepId: step.id, updatedAt: new Date() },
              { upsert: true, new: true }
            );
          }
        }
      } catch (workflowError) {
        console.error("⚠️ WORKFLOW CRASHED:", workflowError);
      }
    }

    // Final success response
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error("❌ WEBHOOK CRASH:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
