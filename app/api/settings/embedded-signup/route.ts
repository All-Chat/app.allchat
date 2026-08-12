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

  console.log("[Meta GET]", url.replace(accessToken, "***"));

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
  const apiKey = process.env.PINBOT_RESELLER_API_KEY;

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

  const responseText = await response.text();

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

    /* =====================================================
       AUTHENTICATE USER
    ===================================================== */

    const session =
      await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       READ REQUEST
    ===================================================== */

    const body = await req.json();

    /*
     * Only code is required from frontend.
     *
     * Optional:
     * wabaId
     * phoneNumberId
     *
     * Business ID is NOT required from frontend.
     */

    const {
      code,
      wabaId: frontendWabaId,
      phoneNumberId: frontendPhoneNumberId,
    } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        {
          success: false,
          message:
            "No authorization code received from Meta.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       META APP CREDENTIALS
    ===================================================== */

    const appId =
      process.env.META_APP_ID;

    const appSecret =
      process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        {
          success: false,
          message:
            "META_APP_ID or META_APP_SECRET is missing.",
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       LOAD USER
    ===================================================== */

    const user =
      await User.findById(
        session.user.id
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       STEP 1
       EXCHANGE EMBEDDED SIGNUP CODE
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 1: Exchanging authorization code..."
    );

    const tokenParams =
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        code,
      });

    const tokenResponse =
      await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            tokenParams.toString(),

          cache: "no-store",
        }
      );

    const tokenData =
      await tokenResponse.json();

    if (
      !tokenResponse.ok ||
      !tokenData?.access_token
    ) {
      console.error(
        "[Embedded Signup] Token exchange failed:",
        tokenData
      );

      return NextResponse.json(
        {
          success: false,
          message:
            tokenData?.error?.message ||
            "Failed to exchange Embedded Signup authorization code.",
          metaError:
            tokenData?.error || null,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * This is the token returned from Embedded Signup.
     */

    let accessToken =
      tokenData.access_token;

    console.log(
      "[Embedded Signup] ✓ Access token received"
    );

    /* =====================================================
       STEP 2
       CHECK PERMISSIONS
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 2: Checking permissions..."
    );

    try {
      const permissions =
        await metaGet(
          "/me/permissions",
          accessToken
        );

      console.log(
        "[Embedded Signup] Permissions:",
        permissions
      );
    } catch (error) {
      console.warn(
        "[Embedded Signup] Permission check failed:",
        error
      );
    }

    /* =====================================================
       STEP 3
       OPTIONAL LONG-LIVED TOKEN
    ===================================================== */

    try {
      console.log(
        "[Embedded Signup] STEP 3: Requesting long-lived token..."
      );

      const longLivedParams =
        new URLSearchParams({
          grant_type:
            "fb_exchange_token",

          client_id:
            appId,

          client_secret:
            appSecret,

          fb_exchange_token:
            accessToken,
        });

      const longLivedResponse =
        await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
            },

            body:
              longLivedParams.toString(),

            cache: "no-store",
          }
        );

      const longLivedData =
        await longLivedResponse.json();

      if (
        longLivedResponse.ok &&
        longLivedData?.access_token
      ) {
        accessToken =
          longLivedData.access_token;

        console.log(
          "[Embedded Signup] ✓ Long-lived token obtained"
        );
      } else {
        console.warn(
          "[Embedded Signup] Long-lived token was not returned."
        );
      }
    } catch (error) {
      console.warn(
        "[Embedded Signup] Long-lived token skipped:",
        error
      );
    }

    /* =====================================================
       STEP 4
       RESOLVE WABA ID
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 4: Resolving WABA ID..."
    );

    let wabaId: string | null =
      frontendWabaId || null;

    /*
     * METHOD 1
     *
     * If frontend supplied WABA ID, use it.
     */

    if (wabaId) {
      console.log(
        "[Embedded Signup] ✓ WABA from frontend:",
        wabaId
      );
    }

    /*
     * METHOD 2
     *
     * Try /me/whatsapp_business_accounts.
     */

    if (!wabaId) {
      try {
        const wabaResponse =
          await metaGet(
            "/me/whatsapp_business_accounts",
            accessToken
          );

        if (
          wabaResponse?.data?.length
        ) {
          wabaId =
            String(
              wabaResponse.data[0].id
            );

          console.log(
            "[Embedded Signup] ✓ WABA from /me/whatsapp_business_accounts:",
            wabaId
          );
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] /me/whatsapp_business_accounts failed:",
          error
        );
      }
    }

    /*
     * METHOD 3
     *
     * Get WABA from debug_token granular scopes.
     */

    if (!wabaId) {
      try {
        const appAccessToken =
          `${appId}|${appSecret}`;

        const debugParams =
          new URLSearchParams({
            input_token:
              accessToken,

            access_token:
              appAccessToken,
          });

        const debugResponse =
          await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/debug_token?${debugParams.toString()}`,
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const debugData =
          await debugResponse.json();

        console.log(
          "[Embedded Signup] Debug token response:",
          debugData
        );

        const granularScopes =
          debugData?.data
            ?.granular_scopes || [];

        const whatsappScope =
          granularScopes.find(
            (scope: any) =>
              scope.scope ===
              "whatsapp_business_management"
          );

        if (
          whatsappScope?.target_ids?.length
        ) {
          wabaId =
            String(
              whatsappScope.target_ids[0]
            );

          console.log(
            "[Embedded Signup] ✓ WABA from debug_token:",
            wabaId
          );
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] debug_token failed:",
          error
        );
      }
    }

    /*
     * WABA is absolutely required.
     */

    if (!wabaId) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Could not determine WABA ID from Embedded Signup.",

          hint:
            "Check that whatsapp_business_management is granted and that the Embedded Signup completed successfully.",
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      "[Embedded Signup] ✓ FINAL WABA ID:",
      wabaId
    );

    /* =====================================================
       STEP 5
       GET BUSINESS PORTFOLIO FROM WABA
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 5: Getting Business Portfolio from WABA..."
    );

    let businessId: string | null = null;

    let businessName: string | null = null;

    try {
      /*
       * IMPORTANT:
       *
       * This is the important change.
       *
       * We directly ask Meta:
       *
       * WABA -> owner_business_info
       *
       * Meta returns:
       *
       * {
       *   "owner_business_info": {
       *      "name": "...",
       *      "id": "..."
       *   }
       * }
       */

      const wabaInfo =
        await metaGet(
          `/${wabaId}`,
          accessToken,
          "id,name,currency,owner_business_info"
        );

      console.log(
        "[Embedded Signup] WABA information:",
        wabaInfo
      );

      businessId =
        wabaInfo?.owner_business_info?.id
          ? String(
              wabaInfo.owner_business_info.id
            )
          : null;

      businessName =
        wabaInfo?.owner_business_info?.name
          ? String(
              wabaInfo.owner_business_info.name
            )
          : null;

      if (businessId) {
        console.log(
          "[Embedded Signup] ✓ BUSINESS PORTFOLIO ID:",
          businessId
        );

        console.log(
          "[Embedded Signup] ✓ BUSINESS NAME:",
          businessName
        );
      }
    } catch (error: any) {
      console.error(
        "[Embedded Signup] Failed to get owner_business_info:",
        error
      );

      return NextResponse.json(
        {
          success: false,

          message:
            "WABA was found, but Meta did not return owner_business_info.",

          wabaId,

          error:
            error?.message || String(error),
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Business Portfolio ID is required for Pinbot.
     */

    if (!businessId) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Could not determine the customer's Business Portfolio ID from the WABA.",

          wabaId,

          hint:
            "The WABA access token does not have access to owner_business_info, or this WABA does not expose an owner business.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       STEP 6
       RESOLVE PHONE NUMBER
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 6: Resolving phone number..."
    );

    let phoneNumberId: string | null =
      frontendPhoneNumberId ||
      null;

    let displayPhone =
      "Unknown";

    let verifiedName =
      "";

    let phoneStatus =
      "UNKNOWN";

    /*
     * METHOD 1
     *
     * Frontend supplied Phone Number ID.
     */

    if (phoneNumberId) {
      try {
        const phone =
          await metaGet(
            `/${phoneNumberId}`,
            accessToken,
            "id,display_phone_number,verified_name,status"
          );

        if (phone?.id) {
          phoneNumberId =
            String(phone.id);

          displayPhone =
            phone.display_phone_number ||
            "Unknown";

          verifiedName =
            phone.verified_name ||
            "";

          phoneStatus =
            phone.status ||
            "UNKNOWN";
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] Frontend phone lookup failed:",
          error
        );

        phoneNumberId = null;
      }
    }

    /*
     * METHOD 2
     *
     * Get phone numbers from WABA.
     */

    if (!phoneNumberId) {
      try {
        const phones =
          await metaGet(
            `/${wabaId}/phone_numbers`,
            accessToken,
            "id,display_phone_number,verified_name,status"
          );

        if (
          !phones?.data?.length
        ) {
          return NextResponse.json(
            {
              success: false,

              message:
                "WABA was found, but no phone number was found.",

              wabaId,

              businessId,
            },
            {
              status: 400,
            }
          );
        }

        const selectedPhone =
          phones.data[0];

        phoneNumberId =
          String(selectedPhone.id);

        displayPhone =
          selectedPhone.display_phone_number ||
          "Unknown";

        verifiedName =
          selectedPhone.verified_name ||
          "";

        phoneStatus =
          selectedPhone.status ||
          "UNKNOWN";
      } catch (error: any) {
        return NextResponse.json(
          {
            success: false,

            message:
              "Could not retrieve the phone number from the WABA.",

            wabaId,

            businessId,

            error:
              error?.message || String(error),
          },
          {
            status: 400,
          }
        );
      }
    }

    console.log(
      "[Embedded Signup] ✓ Phone Number ID:",
      phoneNumberId
    );

    console.log(
      "[Embedded Signup] ✓ Display Phone:",
      displayPhone
    );

    /* =====================================================
       STEP 7
       CHECK DUPLICATE
    ===================================================== */

    const existingNumbers: any[] =
      Array.isArray(
        user.whatsappNumbers
      )
        ? user.whatsappNumbers
        : [];

    const duplicate =
      existingNumbers.some(
        (number: any) =>
          String(
            number.whatsappPhoneNumberId || ""
          ) === String(phoneNumberId)
      );

    if (duplicate) {
      return NextResponse.json(
        {
          success: false,

          message:
            `Number ${displayPhone} is already connected.`,

          wabaId,

          phoneNumberId,

          businessId,
        },
        {
          status: 409,
        }
      );
    }

    /* =====================================================
       STEP 8
       CREATE WHATSAPP NUMBER RECORD
    ===================================================== */

    const setupStart =
      new Date();

    const nextSetupAttempt =
      new Date(
        Date.now() +
          4 * 60 * 1000
      );

    const isFirstNumber =
      existingNumbers.length === 0;

    const newNumber: any = {
      name:
        verifiedName ||
        `WhatsApp ${displayPhone}`,

      wabaId,

      whatsappPhoneNumberId:
        phoneNumberId,

      whatsappAccessToken:
        accessToken,

      displayPhoneNumber:
        displayPhone,

      verifiedName,

      phoneStatus,

      isActive:
        isFirstNumber,

      source:
        "embedded_signup",

      addedAt:
        setupStart,

      /*
       * CUSTOMER BUSINESS PORTFOLIO
       */

      businessId,

      /*
       * SETUP
       */

      setupStatus:
        "WAITING_CREDIT_LINE",

      /*
       * CREDIT LINE
       */

      creditLineStatus:
        "PENDING",

      creditLineId:
        null,

      creditLineError:
        null,

      /*
       * SUBSCRIPTION
       */

      subscriptionStatus:
        "PENDING",

      subscriptionError:
        null,

      /*
       * REGISTRATION
       */

      registrationStatus:
        "PENDING",

      registrationError:
        null,

      registrationPin:
        null,

      /*
       * PINBOT
       */

      pinbotEmbeddedDetailStatus:
        "PENDING",

      pinbotEmbeddedDetailResponse:
        null,

      pinbotEmbeddedDetailError:
        null,

      pinbotEmbeddedDetailAt:
        null,

      /*
       * SETUP ERRORS
       */

      setupError:
        null,

      /*
       * TIMING
       */

      setupStartedAt:
        setupStart,

      nextSetupAttemptAt:
        nextSetupAttempt,

      setupCompletedAt:
        null,
    };

    /* =====================================================
       STEP 9
       SAVE TO MONGODB
    ===================================================== */

    user.whatsappNumbers =
      Array.isArray(
        user.whatsappNumbers
      )
        ? user.whatsappNumbers
        : [];

    user.whatsappNumbers.push(
      newNumber
    );

    /*
     * Keep existing main WhatsApp fields
     * for the first connected number.
     */

    if (isFirstNumber) {
      user.wabaId =
        wabaId;

      user.whatsappPhoneNumberId =
        phoneNumberId;

      user.whatsappAccessToken =
        accessToken;
    }

    await user.save();

    console.log(
      "[Embedded Signup] ✓ Number saved to MongoDB"
    );

    /* =====================================================
       STEP 10
       CALL PINBOT
    ===================================================== */

    let pinbotResponse: any = null;

    try {
      console.log(
        "[Embedded Signup] STEP 10: Calling Pinbot..."
      );

      pinbotResponse =
        await sendToPinbot(
          wabaId,
          businessId
        );

      /*
       * Find the newly inserted number again.
       */

      const savedNumber =
        user.whatsappNumbers[
          user.whatsappNumbers.length - 1
        ] as any;

      if (savedNumber) {
        savedNumber.pinbotEmbeddedDetailStatus =
          "SUCCESS";

        savedNumber.pinbotEmbeddedDetailResponse =
          pinbotResponse;

        savedNumber.pinbotEmbeddedDetailError =
          null;

        savedNumber.pinbotEmbeddedDetailAt =
          new Date();

        /*
         * Pinbot accepted the embedded
         * detail notification.
         */

        savedNumber.setupStatus =
          "WAITING_CREDIT_LINE";
      }

      await user.save();

      console.log(
        "[Embedded Signup] ✓ Pinbot embedded detail API successful"
      );
    } catch (pinbotError: any) {
      console.error(
        "[Embedded Signup] Pinbot API failed:",
        pinbotError
      );

      const savedNumber =
        user.whatsappNumbers[
          user.whatsappNumbers.length - 1
        ] as any;

      if (savedNumber) {
        savedNumber.pinbotEmbeddedDetailStatus =
          "FAILED";

        savedNumber.pinbotEmbeddedDetailError =
          pinbotError?.message ||
          String(pinbotError);

        savedNumber.pinbotEmbeddedDetailAt =
          new Date();

        /*
         * Do NOT mark the entire WhatsApp
         * setup as failed just because the
         * Pinbot notification failed.
         *
         * It can be retried later.
         */

        savedNumber.setupStatus =
          "WAITING_CREDIT_LINE";
      }

      await user.save();

      /*
       * We return success for the Meta connection,
       * but tell the frontend that Pinbot needs retry.
       */

      return NextResponse.json(
        {
          success: true,

          message:
            `WhatsApp number ${displayPhone} connected, but the Pinbot synchronization failed and needs to be retried.`,

          data: {
            wabaId,

            businessId,

            businessName,

            phoneNumberId,

            displayPhone,

            setupStatus:
              "WAITING_CREDIT_LINE",

            pinbotStatus:
              "FAILED",

            pinbotError:
              pinbotError?.message ||
              String(pinbotError),
          },
        },
        {
          status: 200,
        }
      );
    }

    /* =====================================================
       SUCCESS
    ===================================================== */

    console.log(
      "[Embedded Signup] ========================================"
    );

    console.log(
      "[Embedded Signup] ✓ EMBEDDED SIGNUP COMPLETE"
    );

    console.log(
      "[Embedded Signup] WABA:",
      wabaId
    );

    console.log(
      "[Embedded Signup] BUSINESS:",
      businessId
    );

    console.log(
      "[Embedded Signup] PHONE:",
      phoneNumberId
    );

    console.log(
      "[Embedded Signup] PINBOT: SUCCESS"
    );

    console.log(
      "[Embedded Signup] ========================================"
    );

    return NextResponse.json({
      success: true,

      message:
        `WhatsApp number ${displayPhone} connected successfully.`,

      data: {
        wabaId,

        businessId,

        businessName,

        phoneNumberId,

        displayPhone,

        verifiedName,

        phoneStatus,

        setupStatus:
          "WAITING_CREDIT_LINE",

        pinbotStatus:
          "SUCCESS",
      },
    });
  } catch (error: any) {
    console.error(
      "[Embedded Signup] FATAL ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error?.message ||
          "Unexpected error occurred.",

        error:
          error?.response ||
          null,
      },
      {
        status: 500,
      }
    );
  }
}
