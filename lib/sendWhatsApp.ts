/* eslint-disable @typescript-eslint/no-explicit-any */

export async function sendWhatsAppMessage(
  phone: string, 
  step: any, 
  inputPhoneNumberId?: string, // ADDED: Multi-tenant Phone Number ID
  inputAccessToken?: string    // ADDED: Multi-tenant Access Token
) {
  // ADDED: Sanitize phone number (strip + sign) to prevent Meta API errors
  const sanitizedPhone = phone.replace(/\+/g, "");

  // ADDED: Use passed credentials, fallback to environment variables
  const phoneNumberId = inputPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = inputAccessToken || process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("WhatsApp credentials are missing (not provided and not in env)");
  }

  let payload: any;

  // If the step has buttons, send an Interactive Button Message
  if (step.buttons && step.buttons.length > 0) {
    payload = {
      messaging_product: "whatsapp",
      to: sanitizedPhone, // CHANGED: Use sanitized phone
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: step.message },
        action: {
          buttons: step.buttons.map((btn: any) => ({
            type: "reply",
            reply: {
              // IMPORTANT: We set the button ID to the nextStepId!
              // When clicked, WA sends this ID back to our webhook.
              id: btn.nextStepId || "END_FLOW", 
              title: btn.label.substring(0, 20), // WA limits button titles to 20 chars
            },
          })),
        },
      },
    };
  } else {
    // Otherwise, send standard text message
    payload = {
      messaging_product: "whatsapp",
      to: sanitizedPhone, // CHANGED: Use sanitized phone
      type: "text",
      text: { body: step.message },
    };
  }

  // CHANGED: Updated from v17.0 to v21.0 to match your other API routes
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json();
  
  if (!res.ok) {
    console.error("❌ WhatsApp API Error:", JSON.stringify(data, null, 2));
    throw new Error("Failed to send message");
  }

  return data;
}