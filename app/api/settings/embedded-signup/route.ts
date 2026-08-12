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

    /* =====================================================
       STEP 0
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
       STEP 1
       READ REQUEST
    ===================================================== */

    const body = await req.json();

    /*
     * Frontend should normally send only:
     *
     * {
     *   code: "..."
     * }
     *
     * We also accept wabaId and phoneNumberId
     * if your frontend already provides them.
     */

    const {
      code,
      wabaId: frontendWabaId,
      phoneNumberId:
        frontendPhoneNumberId,
    } = body;

    if (
      !code ||
      typeof code !== "string"
    ) {
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
       STEP 2
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
       STEP 3
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
          message:
            "User not found.",
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       STEP 4
       EXCHANGE EMBEDDED SIGNUP CODE
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 4: Exchanging authorization code..."
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

    let accessToken =
      tokenData.access_token;

    console.log(
      "[Embedded Signup] ✓ Access token received"
    );

    /* =====================================================
       STEP 5
       CHECK PERMISSIONS
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 5: Checking permissions..."
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
       STEP 6
       OPTIONAL LONG-LIVED TOKEN
    ===================================================== */

    try {
      console.log(
        "[Embedded Signup] STEP 6: Requesting long-lived token..."
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
       STEP 7
       RESOLVE WABA ID
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 7: Resolving WABA ID..."
    );

    let wabaId: string | null =
      frontendWabaId
        ? String(frontendWabaId)
        : null;

    /* -----------------------------------------------------
       METHOD 1
       Frontend WABA ID
    ----------------------------------------------------- */

    if (wabaId) {
      console.log(
        "[Embedded Signup] ✓ WABA from frontend:",
        wabaId
      );
    }

    /* -----------------------------------------------------
       METHOD 2
       /me/whatsapp_business_accounts
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       METHOD 3
       debug_token granular scopes
    ----------------------------------------------------- */

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
          whatsappScope?.target_ids
            ?.length
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

    /* -----------------------------------------------------
       WABA REQUIRED
    ----------------------------------------------------- */

    if (!wabaId) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Could not determine WABA ID from Embedded Signup.",

          hint:
            "Check that the Embedded Signup completed successfully and whatsapp_business_management is granted.",
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
       STEP 8
       GET BUSINESS PORTFOLIO FROM WABA
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 8: Getting Business Portfolio from WABA..."
    );

    let businessId:
      string | null = null;

    let businessName:
      string | null = null;

    try {
      /*
       * Ask Meta for the WABA's owner business information.
       */

      const wabaInfo =
        await metaGet(
          `/${wabaId}`,
          accessToken,
          "id,name,currency,owner_business_info,business"
        );

      console.log(
        "[Embedded Signup] WABA information:",
        wabaInfo
      );

      /* ---------------------------------------------------
         METHOD 1
         owner_business_info.id
      --------------------------------------------------- */

      if (
        wabaInfo?.owner_business_info
          ?.id
      ) {
        businessId =
          String(
            wabaInfo
              .owner_business_info.id
          );

        businessName =
          wabaInfo
            .owner_business_info.name
            ? String(
                wabaInfo
                  .owner_business_info.name
              )
            : null;
      }

      /* ---------------------------------------------------
         METHOD 2
         business.id
      --------------------------------------------------- */

      if (
        !businessId &&
        wabaInfo?.business?.id
      ) {
        businessId =
          String(
            wabaInfo.business.id
          );

        businessName =
          wabaInfo.business.name
            ? String(
                wabaInfo.business.name
              )
            : null;
      }

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
        "[Embedded Signup] Failed to get business from WABA:",
        error
      );

      return NextResponse.json(
        {
          success: false,

          message:
            "WABA was found, but Meta did not return the Business Portfolio information.",

          wabaId,

          error:
            error?.message ||
            String(error),
        },
        {
          status: 400,
        }
      );
    }

    /* -----------------------------------------------------
       BUSINESS ID REQUIRED FOR PINBOT
    ----------------------------------------------------- */

    if (!businessId) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Could not determine the customer's Business Portfolio ID from the WABA.",

          wabaId,

          hint:
            "The token may not have access to the WABA's business information, or Meta did not expose the owner business for this WABA.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       STEP 9
       RESOLVE PHONE NUMBER
    ===================================================== */

    console.log(
      "[Embedded Signup] STEP 9: Resolving phone number..."
    );

    let phoneNumberId:
      string | null =
        frontendPhoneNumberId
          ? String(
              frontendPhoneNumberId
            )
          : null;

    let displayPhone =
      "Unknown";

    let verifiedName =
      "";

    let phoneStatus =
      "UNKNOWN";

    /* -----------------------------------------------------
       METHOD 1
       Frontend supplied phone ID
    ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       METHOD 2
       Get phone numbers from WABA
    ----------------------------------------------------- */

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
          String(
            selectedPhone.id
          );

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
              error?.message ||
              String(error),
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
       STEP 10
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
            number.whatsappPhoneNumberId ||
              ""
          ) ===
          String(
            phoneNumberId
          )
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
       STEP 11
       CREATE NUMBER RECORD
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

      businessId,

      setupStatus:
        "WAITING_CREDIT_LINE",

      creditLineStatus:
        "PENDING",

      creditLineId:
        null,

      creditLineError:
        null,

      subscriptionStatus:
        "PENDING",

      subscriptionError:
        null,

      registrationStatus:
        "PENDING",

      registrationError:
        null,

      registrationPin:
        null,

      pinbotEmbeddedDetailStatus:
        "PENDING",

      pinbotEmbeddedDetailResponse:
        null,

      pinbotEmbeddedDetailError:
        null,

      pinbotEmbeddedDetailAt:
        null,

      setupError:
        null,

      setupStartedAt:
        setupStart,

      nextSetupAttemptAt:
        nextSetupAttempt,

      setupCompletedAt:
        null,
    };

    /* =====================================================
       STEP 12
       SAVE NUMBER TO MONGODB
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
     * Keep the old main WhatsApp fields
     * for compatibility with your existing CRM.
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
       STEP 13
       CALL PINBOT
    ===================================================== */

    let pinbotResponse:
      any = null;

    try {
      console.log(
        "[Embedded Signup] STEP 13: Calling Pinbot..."
      );

      /*
       * IMPORTANT:
       *
       * We use ONLY the values resolved above:
       *
       * wabaId    -> from Meta/WABA
       * businessId -> from Meta/WABA
       *
       * Nothing is taken from frontend for business_id.
       */

      pinbotResponse =
        await sendToPinbot(
          wabaId,
          businessId
        );

      /*
       * Get the newly-created number.
       */

      const savedNumber =
        user.whatsappNumbers[
          user.whatsappNumbers
            .length - 1
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

        savedNumber.setupStatus =
          "WAITING_CREDIT_LINE";
      }

      await user.save();

      console.log(
        "[Embedded Signup] ✓ Pinbot embedded detail API successful"
      );
    } catch (
      pinbotError: any
    ) {
      console.error(
        "[Embedded Signup] Pinbot API failed:",
        pinbotError
      );

      const savedNumber =
        user.whatsappNumbers[
          user.whatsappNumbers
            .length - 1
        ] as any;

      if (savedNumber) {
        savedNumber.pinbotEmbeddedDetailStatus =
          "FAILED";

        savedNumber.pinbotEmbeddedDetailError =
          pinbotError?.message ||
          String(pinbotError);

        savedNumber.pinbotEmbeddedDetailAt =
          new Date();

        savedNumber.setupStatus =
          "WAITING_CREDIT_LINE";
      }

      await user.save();

      /*
       * Meta connection itself succeeded.
       * Therefore return success but report
       * the Pinbot synchronization failure.
       */

      return NextResponse.json(
        {
          success: true,

          message:
            `WhatsApp number ${displayPhone} connected, but Pinbot synchronization failed.`,

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
