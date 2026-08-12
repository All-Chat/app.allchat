/* eslint-disable @typescript-eslint/no-explicit-any */

import { metaPost } from "@/lib/meta-whatsapp";

export async function registerWhatsAppNumber({
  phoneNumberId,
  accessToken,
  pin,
}: {
  phoneNumberId: string;
  accessToken: string;
  pin?: string | null;
}) {
  /*
   * Meta Cloud API phone registration.
   *
   * The phone number must already be available through the
   * WABA and the prerequisites for registration must be met.
   */

  const body: Record<string, any> = {
    messaging_product: "whatsapp",
  };

  /*
   * If your registration flow requires a PIN, pass the
   * appropriate PIN here.
   *
   * IMPORTANT:
   * Do NOT generate a random PIN and assume that it is the
   * customer's real Meta two-step verification PIN.
   */

  if (pin) {
    body.pin = pin;
  }

  console.log(
    "[WhatsApp Registration] Registering:",
    phoneNumberId
  );

  const result = await metaPost(
    `/${phoneNumberId}/register`,
    accessToken,
    body
  );

  console.log(
    "[WhatsApp Registration] Meta response:",
    result
  );

  return result;
}
