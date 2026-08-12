/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/* =========================================================
   CONFIG
========================================================= */

const META_API_VERSION = "v24.0";

const PINBOT_URL =
  "https://consolev1.pinbot.ai/api/client-embedded-detail-receiver";

/* =========================================================
   META GET HELPER
========================================================= */

async function metaGet(
  path: string,
  accessToken: string,
  fields?: string
) {
  const params = new URLSearchParams();

  params.set("access_token", accessToken);

  if (fields) {
    params.set("fields", fields);
  }

  const url =
    `https://graph.facebook.com/${META_API_VERSION}${path}` +
    `?${params.toString()}`;

  console.log(
    "[Meta GET]",
    url.replace(accessToken, "***")
  );

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error?.message ||
        `Meta GET request failed: ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   PINBOT EMBEDDED DETAIL API
========================================================= */

async function sendToPinbot(
  wabaId: string,
  businessId: string
) {
  const apiKey =
    process.env.PINBOT_RESELLER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "PINBOT_RESELLER_API_KEY is missing from .env.local"
    );
  }

  const payload = {
    waba_id: wabaId,
    mmlite: 1,
    business_id: businessId,
  };

  console.log(
    "[Pinbot] Sending client embedded details:",
    {
      waba_id: wabaId,
      business_id: businessId,
      mmlite: 1,
    }
  );

  const response = await fetch(PINBOT_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },

    body: JSON.stringify(payload),

    cache: "no-store",
  });

  const responseText =
    await response.text();

  let data: any = null;

  try {
    data = responseText
      ? JSON.parse(responseText)
      : null;
  } catch {
    data = responseText;
  }

  console.log(
    "[Pinbot] Response status:",
    response.status
  );

  console.log(
    "[Pinbot] Response:",
    data
  );

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Pinbot API failed with status ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   POST
========================================================= */

export async function POST(req: Request) {
  try {
    await connectDB();

    const session =
      await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      code,
      wabaId,
      phoneNumberId,
      businessId,
    } = body;

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Embedded Signup authorization code missing.",
        },
        { status: 400 }
      );
    }

    if (!wabaId) {
      return NextResponse.json(
        {
          success: false,
          message: "WABA ID missing.",
        },
        { status: 400 }
      );
    }

    const appId =
      process.env.META_APP_ID;

    const appSecret =
      process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        "META_APP_ID or META_APP_SECRET missing."
      );
    }

    /*
     * =====================================================
     * 1. EXCHANGE EMBEDDED SIGNUP CODE
     * =====================================================
     */

    const tokenResponse =
      await fetch(
        `${GRAPH_URL}/oauth/access_token`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            new URLSearchParams({
              client_id: appId,
              client_secret: appSecret,
              code,
            }).toString(),
        }
      );

    const tokenData =
      await tokenResponse.json();

    if (
      !tokenResponse.ok ||
      !tokenData?.access_token
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            tokenData?.error?.message ||
            "Could not exchange Embedded Signup code.",
          metaError:
            tokenData?.error || null,
        },
        { status: 400 }
      );
    }

    const customerAccessToken =
      tokenData.access_token;

    /*
     * =====================================================
     * 2. VERIFY WABA
     * =====================================================
     */

    const waba = await metaRequest(
      `/${wabaId}?fields=id,name,currency,owner_business_info,primary_funding_id`,
      customerAccessToken
    );

    /*
     * =====================================================
     * 3. GET PHONE NUMBER
     * =====================================================
     */

    let phoneId = phoneNumberId;

    let phone: any = null;

    if (phoneId) {
      phone =
        await metaRequest(
          `/${phoneId}?fields=id,display_phone_number,verified_name,status`,
          customerAccessToken
        );
    } else {
      const phones =
        await metaRequest(
          `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status`,
          customerAccessToken
        );

      phone =
        phones?.data?.[0] || null;

      phoneId =
        phone?.id || null;
    }

    if (!phoneId) {
      throw new Error(
        "Phone Number ID could not be resolved."
      );
    }

    /*
     * =====================================================
     * 4. REGISTER PHONE
     * =====================================================
     *
     * Do not blindly register if Meta says that
     * verification is still required.
     */

    let registrationResult = null;

    const registrationPin =
      process.env.WHATSAPP_REGISTRATION_PIN;

    if (registrationPin) {
      try {
        registrationResult =
          await metaRequest(
            `/${phoneId}/register`,
            customerAccessToken,
            {
              method: "POST",

              body: JSON.stringify({
                messaging_product:
                  "whatsapp",

                pin:
                  registrationPin,
              }),
            }
          );
      } catch (error: any) {
        /*
         * Do not destroy the onboarding record.
         *
         * 133006 means Meta wants the number
         * re-verified.
         */
        if (
          error?.message?.includes(
            "133006"
          ) ||
          error?.message?.toLowerCase()
            .includes(
              "re-verification"
            )
        ) {
          console.warn(
            "Phone requires Meta re-verification."
          );
        } else {
          throw error;
        }
      }
    }

    /*
     * =====================================================
     * 5. SAVE TO DATABASE
     * =====================================================
     */

    const user =
      await User.findById(
        session.user.id
      );

    if (!user) {
      throw new Error(
        "User not found."
      );
    }

    if (
      !Array.isArray(
        user.whatsappNumbers
      )
    ) {
      user.whatsappNumbers = [];
    }

    const duplicate =
      user.whatsappNumbers.some(
        (item: any) =>
          String(
            item.whatsappPhoneNumberId ||
              ""
          ) === String(phoneId)
      );

    if (duplicate) {
      return NextResponse.json({
        success: true,

        message:
          "WhatsApp number already connected.",

        data: {
          wabaId,
          phoneNumberId: phoneId,
        },
      });
    }

    const newNumber = {
      name:
        phone?.verified_name ||
        `WhatsApp ${
          phone?.display_phone_number ||
          ""
        }`,

      wabaId,

      whatsappPhoneNumberId:
        phoneId,

      whatsappAccessToken:
        customerAccessToken,

      displayPhoneNumber:
        phone?.display_phone_number ||
        "",

      verifiedName:
        phone?.verified_name ||
        "",

      phoneStatus:
        phone?.status ||
        "UNKNOWN",

      businessId:
        businessId ||
        waba?.owner_business_info?.id ||
        null,

      source:
        "embedded_signup",

      setupStatus:
        "PENDING_COMPLETION",

      creditLineStatus:
        "PENDING",

      registrationStatus:
        registrationResult
          ? "REGISTERED"
          : "PENDING",

      registrationError:
        null,

      pinbotEmbeddedDetailStatus:
        "PENDING",

      addedAt:
        new Date(),
    };

    user.whatsappNumbers.push(
      newNumber
    );

    await user.save();

    /*
     * =====================================================
     * 6. PINBOT
     * =====================================================
     */

    let pinbotResult = null;

    try {
      const apiKey =
        process.env
          .PINBOT_RESELLER_API_KEY;

      if (!apiKey) {
        throw new Error(
          "PINBOT_RESELLER_API_KEY missing."
        );
      }

      const pinbotResponse =
        await fetch(
          "https://consolev1.pinbot.ai/api/client-embedded-detail-receiver",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              apikey: apiKey,
            },

            body: JSON.stringify({
              waba_id:
                wabaId,

              business_id:
                businessId ||
                waba?.owner_business_info
                  ?.id,

              mmlite: 1,
            }),
          }
        );

      pinbotResult =
        await pinbotResponse.json();

      if (!pinbotResponse.ok) {
        throw new Error(
          pinbotResult?.message ||
            "Pinbot API failed."
        );
      }
    } catch (error: any) {
      console.error(
        "Pinbot sync failed:",
        error
      );

      return NextResponse.json({
        success: true,

        message:
          "Meta signup completed, but Pinbot sync is pending.",

        data: {
          wabaId,
          phoneNumberId: phoneId,

          metaStatus:
            registrationResult
              ? "REGISTERED"
              : "PENDING",

          pinbotStatus:
            "FAILED",

          error:
            error?.message,
        },
      });
    }

    return NextResponse.json({
      success: true,

      message:
        "WhatsApp Embedded Signup completed.",

      data: {
        wabaId,

        phoneNumberId:
          phoneId,

        businessId:
          businessId ||
          waba?.owner_business_info
            ?.id,

        displayPhoneNumber:
          phone?.display_phone_number,

        registration:
          registrationResult,

        pinbot:
          pinbotResult,
      },
    });
  } catch (error: any) {
    console.error(
      "Embedded Signup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error?.message ||
          "Embedded Signup failed.",
      },
      { status: 500 }
    );
  }
}
