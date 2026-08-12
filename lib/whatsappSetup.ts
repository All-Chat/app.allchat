/* eslint-disable @typescript-eslint/no-explicit-any */

import User from "@/models/User";

const META_API_VERSION = "v24.0";

async function metaPost(
  path: string,
  accessToken: string,
  body?: Record<string, any>
) {
  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}${path}`,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "Content-Type":
          "application/json",
      },

      body: body
        ? JSON.stringify(body)
        : undefined,

      cache: "no-store",
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    data?.error
  ) {
    throw new Error(
      data?.error?.message ||
        `Meta API failed: ${response.status}`
    );
  }

  return data;
}

async function pinbotPost(
  endpoint: string,
  body: Record<string, any>
) {
  const apiKey =
    process.env.PINBOT_API_KEY;

  if (!apiKey) {
    throw new Error(
      "PINBOT_API_KEY is missing."
    );
  }

  const response =
    await fetch(
      `https://consolev1.pinbot.ai${endpoint}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          apikey: apiKey,
        },

        body:
          JSON.stringify(body),

        cache: "no-store",
      }
    );

  const text =
    await response.text();

  let data: any;

  try {
    data =
      JSON.parse(text);
  } catch {
    data = {
      raw: text,
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        data?.raw ||
        `Pinbot API failed: ${response.status}`
    );
  }

  return data;
}

async function updateNumber(
  userId: string,
  phoneNumberId: string,
  fields: Record<string, any>
) {
  const setFields: Record<
    string,
    any
  > = {};

  for (
    const [key, value] of
      Object.entries(fields)
  ) {
    setFields[
      `whatsappNumbers.$.${key}`
    ] = value;
  }

  await User.updateOne(
    {
      _id: userId,

      "whatsappNumbers.whatsappPhoneNumberId":
        phoneNumberId,
    },

    {
      $set: setFields,
    }
  );
}

export async function completeWhatsAppSetup(
  data: {
    userId: string;
    phoneNumberId: string;
    wabaId: string;
    businessId: string;
  }
) {
  const {
    userId,
    phoneNumberId,
    wabaId,
    businessId,
  } = data;

  /*
   * ==========================================================
   * Get number from DB
   * ==========================================================
   */

  const user =
    await User.findById(
      userId
    );

  if (!user) {
    throw new Error(
      "User not found."
    );
  }

  const number =
    user.whatsappNumbers?.find(
      (item: any) =>
        item.whatsappPhoneNumberId ===
        phoneNumberId
    );

  if (!number) {
    throw new Error(
      "WhatsApp number not found in database."
    );
  }

  const accessToken =
    number.whatsappAccessToken;

  if (!accessToken) {
    throw new Error(
      "WhatsApp access token is missing."
    );
  }

  const configId =
    process.env.PINBOT_CONFIG_ID;

  const solutionId =
    process.env.PINBOT_SOLUTION_ID;

  if (!configId) {
    throw new Error(
      "PINBOT_CONFIG_ID is missing."
    );
  }

  if (!solutionId) {
    throw new Error(
      "PINBOT_SOLUTION_ID is missing."
    );
  }

  /*
   * ==========================================================
   * STEP 1
   *
   * Relay Embedded Signup details to Pinbot
   * ==========================================================
   */

  console.log(
    "[WhatsApp Setup] STEP 1: Relaying details..."
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      setupStatus:
        "RELAYING_DETAILS",

      setupError:
        null,
    }
  );

  await pinbotPost(
    "/api/client-embedded-detail-receiver",
    {
      waba_id:
        wabaId,

      phone_numberid:
        phoneNumberId,

      access_token:
        accessToken,

      config_id:
        configId,

      mmlite:
        1,

      business_id:
        businessId,

      solution_id:
        solutionId,
    }
  );

  console.log(
    "[WhatsApp Setup] ✓ Details relayed"
  );

  /*
   * ==========================================================
   * STEP 2
   *
   * Assign Pinbot/Solution Partner credit line
   *
   * This is the API that shares the partner's credit line
   * with the customer's WABA.
   * ==========================================================
   */

  console.log(
    "[WhatsApp Setup] STEP 2: Assigning credit line..."
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      setupStatus:
        "ASSIGNING_CREDIT_LINE",

      creditLineStatus:
        "PROCESSING",
    }
  );

  await pinbotPost(
    "/api/join-solutions-share-creditline-api",
    {
      business_id:
        businessId,

      waba_currency:
        "INR",

      waba_id:
        wabaId,
    }
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      creditLineStatus:
        "CONNECTED",
    }
  );

  console.log(
    "[WhatsApp Setup] ✓ Credit line connected"
  );

  /*
   * ==========================================================
   * STEP 3
   *
   * Subscribe WABA
   * ==========================================================
   */

  console.log(
    "[WhatsApp Setup] STEP 3: Subscribing WABA..."
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      setupStatus:
        "SUBSCRIBING_WABA",

      subscriptionStatus:
        "PROCESSING",
    }
  );

  await metaPost(
    `/${wabaId}/subscribed_apps`,
    accessToken
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      subscriptionStatus:
        "CONNECTED",
    }
  );

  console.log(
    "[WhatsApp Setup] ✓ WABA subscribed"
  );

  /*
   * ==========================================================
   * STEP 4
   *
   * Register Phone Number
   * ==========================================================
   */

  console.log(
    "[WhatsApp Setup] STEP 4: Registering phone..."
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      setupStatus:
        "REGISTERING_PHONE",

      registrationStatus:
        "PROCESSING",
    }
  );

  /*
   * Use the PIN generated during Embedded Signup.
   */

  let pin =
    (number as any).registrationPin;

  if (
    !pin ||
    !/^\d{6}$/.test(pin)
  ) {
    pin =
      Math.floor(
        100000 +
          Math.random() *
            900000
      ).toString();

    await updateNumber(
      userId,
      phoneNumberId,
      {
        registrationPin:
          pin,
      }
    );
  }

  await metaPost(
    `/${phoneNumberId}/register`,
    accessToken,
    {
      messaging_product:
        "whatsapp",

      pin,
    }
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      registrationStatus:
        "REGISTERED",
    }
  );

  console.log(
    "[WhatsApp Setup] ✓ Phone registered"
  );

  /*
   * ==========================================================
   * STEP 5
   *
   * Set Two-Step Verification PIN
   * ==========================================================
   */

  console.log(
    "[WhatsApp Setup] STEP 5: Setting 2FA PIN..."
  );

  await updateNumber(
    userId,
    phoneNumberId,
    {
      setupStatus:
        "SETTING_PIN",
    }
  );

  await metaPost(
    `/${phoneNumberId}`,
    accessToken,
    {
      pin,
    }
  );

  console.log(
    "[WhatsApp Setup] ✓ 2FA PIN configured"
  );

  /*
   * ==========================================================
   * FINISHED
   * ==========================================================
   */

  await updateNumber(
    userId,
    phoneNumberId,
    {
      setupStatus:
        "READY",

      creditLineStatus:
        "CONNECTED",

      subscriptionStatus:
        "CONNECTED",

      registrationStatus:
        "REGISTERED",

      phoneStatus:
        "CONNECTED",

      setupError:
        null,

      setupCompletedAt:
        new Date(),
    }
  );

  console.log(
    "[WhatsApp Setup] ================================="
  );

  console.log(
    "[WhatsApp Setup] 🎉 SETUP COMPLETE"
  );

  console.log(
    "[WhatsApp Setup] WABA:",
    wabaId
  );

  console.log(
    "[WhatsApp Setup] PHONE:",
    phoneNumberId
  );

  console.log(
    "[WhatsApp Setup] BUSINESS:",
    businessId
  );

  console.log(
    "[WhatsApp Setup] ================================="
  );

  return {
    success: true,

    status:
      "READY",

    wabaId,

    phoneNumberId,

    businessId,
  };
}
