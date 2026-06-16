/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

interface WhatsAppParameter {
  type: string;
  text?: string;
  image?: {
    link: string;
  };
  document?: {
    link: string;
  };
  video?: {
    link: string;
  };
}

interface WhatsAppComponent {
  type: string;
  sub_type?: string;
  index?: string;
  parameters?: WhatsAppParameter[];
}

interface SendWhatsAppTemplateProps {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: WhatsAppComponent[];
  // ADDED: Multi-tenant credentials
  phoneNumberId?: string;
  accessToken?: string;
}

export async function sendWhatsAppTemplate({
  to,
  templateName,
  languageCode = "en_US",
  components = [],
  phoneNumberId: inputPhoneNumberId, // ADDED
  accessToken: inputAccessToken,     // ADDED
}: SendWhatsAppTemplateProps) {
  // ADDED: Sanitize phone number (strip + sign) to prevent Meta API errors
  const sanitizedTo = to.replace(/\+/g, "");

  // ADDED: Use passed credentials, fallback to environment variables
  const phoneNumberId = inputPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = inputAccessToken || process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is missing (not provided and not in env)");
  }

  if (!token) {
    throw new Error("META_ACCESS_TOKEN is missing (not provided and not in env)");
  }

  // Changed v20.0 to v21.0 to match your other API routes
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: sanitizedTo, // CHANGED: Use the sanitized phone number
        type: "template",
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("WhatsApp API Error:", data);

    throw new Error(
      data?.error?.message || "Failed to send WhatsApp template"
    );
  }

  return data;
}