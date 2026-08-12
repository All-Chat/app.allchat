import { metaPost } from "@/lib/meta-whatsapp";

export async function subscribeWhatsAppWaba({
  wabaId,
  accessToken,
}: {
  wabaId: string;
  accessToken: string;
}) {
  console.log(
    "[WhatsApp Subscription] Subscribing WABA:",
    wabaId
  );

  const result = await metaPost(
    `/${wabaId}/subscribed_apps`,
    accessToken,
    {}
  );

  console.log(
    "[WhatsApp Subscription] Response:",
    result
  );

  return result;
}
