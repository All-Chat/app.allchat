/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function sendWhatsAppMessage(
  phone: string, 
  step: any, 
  inputPhoneNumberId?: string, 
  inputAccessToken?: string
) {
  const sanitizedPhone = phone.replace(/\+/g, "");
  const phoneNumberId = inputPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = inputAccessToken || process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("WhatsApp credentials are missing");
  }

  let payload: any = { messaging_product: "whatsapp", to: sanitizedPhone };

  const isLink = step.mediaType === "link" && step.mediaUrl;
  const hasMedia = step.mediaUrl && ["image", "video", "audio", "document"].includes(step.mediaType);
  const hasButtons = step.buttons && step.buttons.length > 0;
  const isUrlAction = step.stepType === "url_action" && step.url;
  const isCallAction = step.stepType === "call_action" && step.phoneNumber;

  const isUrl = step.mediaUrl?.startsWith("http");
  const mediaObj = isUrl ? { link: step.mediaUrl } : { id: step.mediaUrl };

  let bodyText = step.message || " ";
  if (isLink) {
    bodyText = `${step.message || ""}\n${step.mediaUrl}`.trim();
  }

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
  } else if (isCallAction) {
    // BYPASS: Meta blocks tel: links. We use our own Next.js API route to redirect to tel:
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const dialUrl = `${baseUrl}/api/dial?num=${encodeURIComponent(step.phoneNumber)}`;
    
    payload.type = "interactive";
    payload.interactive = {
      type: "cta_url",
      body: { text: bodyText },
      action: {
        name: "cta_url",
        parameters: {
          display_text: step.urlLabel?.substring(0, 20) || "Call Now",
          url: dialUrl
        }
      }
    };
  } else if (hasButtons) {
    payload.type = "interactive";
    payload.interactive = {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: step.buttons.map((btn: any) => ({
          type: "reply",
          reply: { id: btn.id, title: btn.label.substring(0, 20) },
        })),
      },
    };

    if (hasMedia) {
      payload.interactive.header = {
        type: step.mediaType,
        [step.mediaType]: mediaObj
      };
    }
  } else if (hasMedia) {
    payload.type = step.mediaType;
    payload[step.mediaType] = {
      ...mediaObj,
      caption: step.message || undefined,
    };
  } else {
    payload.type = "text";
    payload.text = { 
      preview_url: true, 
      body: bodyText 
    };
  }

  // Send the main API request to Meta
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
