/* ============================================================================
   WHATSAPP MESSAGE SENDER
   ----------------------------------------------------------------------------
   Sends messages via the WhatsApp Cloud API.
   
   Key Logic:
   - ≤3 buttons  → Sent as Interactive Button Message
   - >3 buttons  → Sent as Interactive List Message (auto-converted)
   - Media + >3  → Media sent first as separate message, then List follows
   - URL Action   → CTA URL Interactive
   - Call Action  → CTA URL redirecting to /api/dial (bypasses Meta tel: block)
   ============================================================================ */

/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

export async function sendWhatsAppMessage(
  phone: string,
  step: any,
  inputPhoneNumberId?: string,
  inputAccessToken?: string
) {
  const sanitizedPhone = phone.replace(/\+/g, "");
  const phoneNumberId =
    inputPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = inputAccessToken || process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("WhatsApp credentials are missing");
  }

  const API_URL = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const HEADERS = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  /* ── Extract step properties ── */
  const {
    stepType,
    message,
    buttons,
    mediaType,
    mediaUrl,
    url: stepUrl,
    urlLabel,
    phoneNumber: callNumber,
    listButtonText,
  } = step || {};

  /* ── Determine message characteristics ── */
  const isLink = mediaType === "link" && mediaUrl;
  const hasMedia =
    mediaUrl &&
    ["image", "video", "audio", "document"].includes(mediaType) &&
    mediaUrl !== "UPLOADING...";
  const hasButtons = buttons && buttons.length > 0;
  const buttonCount = buttons?.length || 0;
  const isUrlAction = stepType === "url_action" && stepUrl;
  const isCallAction = stepType === "call_action" && callNumber;
  const isListMode = hasButtons && buttonCount > 3;

  const isUrl = mediaUrl?.startsWith("http");
  const mediaObj = isUrl ? { link: mediaUrl } : { id: mediaUrl };

  /* ── Build body text (links get appended) ── */
  let bodyText = message || " ";
  if (isLink) {
    bodyText = `${message || ""}\n${mediaUrl}`.trim();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HELPER: Send a raw payload to the WhatsApp API
     ══════════════════════════════════════════════════════════════════════════ */
  const sendPayload = async (payload: any) => {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(
        "❌ WhatsApp API Error:",
        JSON.stringify(data, null, 2),
        "| Payload:",
        JSON.stringify(payload, null, 2)
      );
      throw new Error("Failed to send message");
    }

    return data;
  };

  /* ══════════════════════════════════════════════════════════════════════════
     HELPER: Build and send a media-only message
     Used when we need to send media separately before a List Message
     (because List Messages don't support media headers).
     ══════════════════════════════════════════════════════════════════════════ */
  const sendMediaMessage = async () => {
    const payload: any = {
      messaging_product: "whatsapp",
      to: sanitizedPhone,
      type: mediaType,
      [mediaType]: {
        ...mediaObj,
      },
    };

    // Audio doesn't support caption; document uses filename
    if (bodyText && bodyText.trim() !== "" && mediaType !== "audio") {
      if (mediaType === "document") {
        payload[mediaType].filename = bodyText;
      } else {
        payload[mediaType].caption = bodyText;
      }
    }

    return sendPayload(payload);
  };

  /* ══════════════════════════════════════════════════════════════════════════
     CASE 1: URL Action → CTA URL Interactive Message
     ══════════════════════════════════════════════════════════════════════════ */
  if (isUrlAction) {
    const payload: any = {
      messaging_product: "whatsapp",
      to: sanitizedPhone,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: {
          name: "cta_url",
          parameters: {
            display_text: urlLabel?.substring(0, 20) || "Visit Link",
            url: stepUrl,
          },
        },
      },
    };

    return sendPayload(payload);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CASE 2: Call Action → CTA URL redirecting to /api/dial
     Bypass: Meta blocks tel: links, so we use our own Next.js API route
     to redirect to tel: on the user's device.
     ══════════════════════════════════════════════════════════════════════════ */
  if (isCallAction) {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const dialUrl = `${baseUrl}/api/dial?num=${encodeURIComponent(callNumber)}`;

    const payload: any = {
      messaging_product: "whatsapp",
      to: sanitizedPhone,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: {
          name: "cta_url",
          parameters: {
            display_text: urlLabel?.substring(0, 20) || "Call Now",
            url: dialUrl,
          },
        },
      },
    };

    return sendPayload(payload);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CASE 3: >3 Buttons → Interactive LIST Message
     
     WhatsApp only supports up to 3 buttons in a Button Message.
     When there are more than 3 buttons, we automatically convert
     them into a List Message with all buttons as selectable rows.
     
     If media is also attached, it's sent as a separate message first,
     followed by the List Message (lists don't support media headers).
     ══════════════════════════════════════════════════════════════════════════ */
  if (isListMode) {
    // Step 1: If media is present, send it as a separate message first
    if (hasMedia) {
      try {
        await sendMediaMessage();
        console.log(`✅ Media sent separately before list to ${sanitizedPhone}`);
      } catch (mediaErr) {
        console.error("⚠️ Failed to send media before list:", mediaErr);
        // Continue and send the list message anyway
      }
    }

    // Step 2: Build the List Message
    // WhatsApp allows up to 10 rows per section, so we chunk if needed
    const MAX_ROWS_PER_SECTION = 10;
    const sections: any[] = [];

    for (let i = 0; i < buttonCount; i += MAX_ROWS_PER_SECTION) {
      const chunk = buttons.slice(i, i + MAX_ROWS_PER_SECTION);
      sections.push({
        title:
          sections.length === 0
            ? "Choose an option"
            : `More options (${sections.length + 1})`,
        rows: chunk.map((btn: any, idx: number) => ({
          id: btn.id || `list_btn_${i + idx}`,
          title: (btn.label || `Option ${i + idx + 1}`).substring(0, 24),
        })),
      });
    }

    const payload: any = {
      messaging_product: "whatsapp",
      to: sanitizedPhone,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: hasMedia
            ? "👆 See media above. Please select an option below:"
            : bodyText,
        },
        action: {
          button: (listButtonText || "Options").substring(0, 20),
          sections: sections,
        },
      },
    };

    console.log(
      `📋 Sending LIST message to ${sanitizedPhone} with ${buttonCount} options`
    );

    return sendPayload(payload);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CASE 4: ≤3 Buttons → Interactive BUTTON Message
     
     Supports optional media header (image, video, or document).
     ══════════════════════════════════════════════════════════════════════════ */
  if (hasButtons && buttonCount <= 3) {
    const payload: any = {
      messaging_product: "whatsapp",
      to: sanitizedPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((btn: any) => ({
            type: "reply",
            reply: { id: btn.id, title: btn.label.substring(0, 20) },
          })),
        },
      },
    };

    // Add media header if present (image, video, or document only)
    if (hasMedia && ["image", "video", "document"].includes(mediaType)) {
      payload.interactive.header = {
        type: mediaType,
        [mediaType]: mediaObj,
      };
    }

    return sendPayload(payload);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CASE 5: Media Only (No Buttons) → Media Message with Caption
     ══════════════════════════════════════════════════════════════════════════ */
  if (hasMedia) {
    return sendMediaMessage();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CASE 6: Simple Text Message (Fallback)
     ══════════════════════════════════════════════════════════════════════════ */
  const payload: any = {
    messaging_product: "whatsapp",
    to: sanitizedPhone,
    type: "text",
    text: {
      preview_url: true,
      body: bodyText,
    },
  };

  return sendPayload(payload);
}
