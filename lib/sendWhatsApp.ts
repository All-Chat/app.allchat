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

  // Check if it's a social media link or a media file
  const isLink = step.mediaType === "link" && step.mediaUrl;
  const hasMedia = step.mediaUrl && ["image", "video", "audio", "document"].includes(step.mediaType);
  const hasButtons = step.buttons && step.buttons.length > 0;
  
  // NEW: Check if it's a URL Action node (Opens link in browser on click)
  const isUrlAction = step.stepType === "url_action" && step.url;

  // Check if the mediaUrl is a standard URL or a Meta Media ID
  const isUrl = step.mediaUrl?.startsWith("http");
  const mediaObj = isUrl ? { link: step.mediaUrl } : { id: step.mediaUrl };

  // If it's a link, append the URL to the message text so WhatsApp can generate a preview
  let bodyText = step.message || " ";
  if (isLink) {
    bodyText = `${step.message || ""}\n${step.mediaUrl}`.trim();
  }

  // NEW: Handle URL Action (Opens link in browser on click)
  if (isUrlAction) {
    payload.type = "interactive";
    payload.interactive = {
      type: "cta_url",
      body: { text: bodyText },
      action: {
        name: "cta_url",
        parameters: {
          display_text: step.urlLabel?.substring(0, 20) || "Visit Link",
          url: step.url
        }
      }
    };
  } else if (hasButtons) {
    // Send Interactive Button Message (with optional Media Header)
    payload.type = "interactive";
    payload.interactive = {
      type: "button",
      body: { text: bodyText }, // WhatsApp requires body text
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

    // If media exists, attach it as a header (Links cannot be headers, so we only do this for files)
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
    // Send standard text message OR link message with rich preview
    payload.type = "text";
    payload.text = { 
      preview_url: true, // THIS IS CRITICAL: Enables WhatsApp previews for YT, Insta, FB links
      body: bodyText 
    };
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
