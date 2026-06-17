/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function sendWhatsAppMessage(
  phone: string, 
  step: any, 
  inputPhoneNumberId?: string, // Multi-tenant Phone Number ID
  inputAccessToken?: string    // Multi-tenant Access Token
) {
  // Sanitize phone number (strip + sign) to prevent Meta API errors
  const sanitizedPhone = phone.replace(/\+/g, "");

  // Use passed credentials, fallback to environment variables
  const phoneNumberId = inputPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = inputAccessToken || process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("WhatsApp credentials are missing (not provided and not in env)");
  }

  let payload: any = {
    messaging_product: "whatsapp",
    to: sanitizedPhone, 
  };

  const hasMedia = step.mediaUrl && step.mediaType;
  const hasButtons = step.buttons && step.buttons.length > 0;

  // Check if the mediaUrl is a standard URL or a Meta Media ID
  const isUrl = step.mediaUrl?.startsWith("http");
  const mediaObj = isUrl ? { link: step.mediaUrl } : { id: step.mediaUrl };

  if (hasButtons) {
    // Send Interactive Button Message (with optional Media Header)
    payload.type = "interactive";
    payload.interactive = {
      type: "button",
      body: { text: step.message || " " }, // WhatsApp requires body text
      action: {
        buttons: step.buttons.map((btn: any) => ({
          type: "reply",
          reply: {
            id: btn.id, 
            title: btn.label.substring(0, 20), // WA limits button titles to 20 chars
          },
        })),
      },
    };

    // If media exists, attach it as a header
    if (hasMedia) {
      payload.interactive.header = {
        type: step.mediaType,
        [step.mediaType]: mediaObj // Automatically uses { link: "..." } or { id: "..." }
      };
    }
  } else if (hasMedia) {
    // Send Media Message with Caption (No buttons)
    payload.type = step.mediaType;
    payload[step.mediaType] = {
      ...mediaObj,
      caption: step.message || undefined, // Caption only works for image/video/document
    };
  } else {
    // Send standard text message
    payload.type = "text";
    payload.text = { body: step.message || " " };
  }

  // Send the API request to Meta
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
