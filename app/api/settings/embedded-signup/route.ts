/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const META_API_VERSION = "v24.0";

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

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}${path}?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message ||
        `Meta GET request failed: ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   PINBOT EMBEDDED DETAIL RECEIVER

   IMPORTANT:
   wabaId and businessId are passed here ONLY after they
   have been read from the database.

   Frontend values are NOT used here.
========================================================= */

async function sendEmbeddedDetailToPinbot(
  wabaId: string,
  businessId: string
) {
  const resellerApiKey =
    process.env.PINBOT_RESELLER_API_KEY;

  if (!resellerApiKey) {
    throw new Error(
      "PINBOT_RESELLER_API_KEY is missing from .env.local"
    );
  }

  console.log(
    "[Pinbot] Calling client-embedded-detail-receiver..."
  );

  console.log(
    "[Pinbot] WABA ID:",
    wabaId
  );

  console.log(
    "[Pinbot] Business ID:",
    businessId
  );

  const response = await fetch(
    "https://consolev1.pinbot.ai/api/client-embedded-detail-receiver",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        apikey: resellerApiKey,
      },

      body: JSON.stringify({
        waba_id: wabaId,
        mmlite: 1,
        business_id: businessId,
      }),

      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "[Pinbot] API failed:",
      data
    );

    throw new Error(
      data?.message ||
        data?.error ||
        `Pinbot API failed with status ${response.status}`
    );
  }

  console.log(
    "[Pinbot] ✓ client-embedded-detail-receiver successful"
  );

  console.log(
    "[Pinbot] Response:",
    data
  );

  return data;
}

/* =========================================================
   POST
========================================================= */

export async function POST(req: Request) {
  try {
    await connectDB();

    /* =====================================================
       SESSION
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
       REQUEST BODY

       code is mandatory.

       wabaId / phoneNumberId / businessId may be sent
       by frontend, but Pinbot will NOT use those frontend
       values.

       They are only used as optional ways to resolve data.
    ===================================================== */

    const body = await req.json();

    const {
      code,
      wabaId: frontendWabaId,
      phoneNumberId: frontendPhoneNumberId,
      businessId: frontendBusinessId,
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
       STEP 1
       EXCHANGE EMBEDDED SIGNUP CODE
    ===================================================== */

    console.log(
      "[Embedded Signup] Step 1: Exchanging code..."
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

          body: tokenParams.toString(),

          cache: "no-store",
        }
      );

    const tokenData =
      await tokenResponse.json();

    if (
      !tokenResponse.ok ||
      !tokenData.access_token
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
            "Failed to exchange authorization code.",
        },
        {
          status: 400,
        }
      );
    }

    let accessToken: string =
      tokenData.access_token;

    console.log(
      "[Embedded Signup] ✓ Access token received"
    );

    /* =====================================================
       STEP 2
       CHECK PERMISSIONS
    ===================================================== */

    console.log(
      "[Embedded Signup] Step 2: Checking permissions..."
    );

    try {
      const permissions =
        await metaGet(
          "/me/permissions",
          accessToken
        );

      const wabaPermission =
        permissions?.data?.find(
          (permission: any) =>
            permission.permission ===
            "whatsapp_business_management"
        );

      if (
        !wabaPermission ||
        wabaPermission.status !== "granted"
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "whatsapp_business_management permission was not granted.",
          },
          {
            status: 400,
          }
        );
      }
    } catch (error) {
      console.warn(
        "[Embedded Signup] Permission check failed:",
        error
      );
    }

    /* =====================================================
       STEP 3
       REQUEST LONG-LIVED TOKEN
    ===================================================== */

    try {
      console.log(
        "[Embedded Signup] Step 3: Requesting long-lived token..."
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
        longLivedData.access_token
      ) {
        accessToken =
          longLivedData.access_token;

        console.log(
          "[Embedded Signup] ✓ Long-lived token obtained"
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
      "[Embedded Signup] Step 4: Resolving WABA..."
    );

    let wabaId: string | null =
      frontendWabaId || null;

    /* -----------------------------------------------------
       METHOD 1
       FRONTEND WABA
    ----------------------------------------------------- */

    if (wabaId) {
      console.log(
        "[Embedded Signup] WABA from frontend:",
        wabaId
      );
    }

    /* -----------------------------------------------------
       METHOD 2
       /me/whatsapp_business_accounts
    ----------------------------------------------------- */

    if (!wabaId) {
      try {
        const response =
          await metaGet(
            "/me/whatsapp_business_accounts",
            accessToken
          );

        if (
          response?.data?.length
        ) {
          wabaId =
            response.data[0].id;

          console.log(
            "[Embedded Signup] ✓ WABA from /me/whatsapp_business_accounts:",
            wabaId
          );
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] WABA lookup method 1 failed:",
          error
        );
      }
    }

    /* -----------------------------------------------------
       METHOD 3
       DEBUG TOKEN GRANULAR SCOPE
    ----------------------------------------------------- */

    if (!wabaId) {
      try {
        const debugResponse =
          await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${encodeURIComponent(
              accessToken
            )}&access_token=${encodeURIComponent(
              `${appId}|${appSecret}`
            )}`,
            {
              cache: "no-store",
            }
          );

        const debugData =
          await debugResponse.json();

        const granularScopes =
          debugData?.data
            ?.granular_scopes || [];

        const wabaScope =
          granularScopes.find(
            (scope: any) =>
              scope.scope ===
              "whatsapp_business_management"
          );

        if (
          wabaScope?.target_ids?.length
        ) {
          wabaId =
            wabaScope.target_ids[0];

          console.log(
            "[Embedded Signup] ✓ WABA from debug_token:",
            wabaId
          );
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] debug_token WABA lookup failed:",
          error
        );
      }
    }

    /* -----------------------------------------------------
       METHOD 4
       /me/businesses
    ----------------------------------------------------- */

    if (!wabaId) {
      try {
        const businesses =
          await metaGet(
            "/me/businesses",
            accessToken
          );

        for (
          const business of
            businesses?.data || []
        ) {
          try {
            const businessWabas =
              await metaGet(
                `/${business.id}/whatsapp_business_accounts`,
                accessToken
              );

            if (
              businessWabas?.data?.length
            ) {
              wabaId =
                businessWabas.data[0].id;

              console.log(
                "[Embedded Signup] ✓ WABA found from business:",
                business.id,
                wabaId
              );

              break;
            }
          } catch {
            /* Continue */
          }
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] Business WABA lookup failed:",
          error
        );
      }
    }

    if (!wabaId) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Could not determine WABA ID. Make sure the Embedded Signup flow completed successfully and whatsapp_business_management is granted.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       STEP 5
       RESOLVE PHONE NUMBER
    ===================================================== */

    console.log(
      "[Embedded Signup] Step 5: Resolving phone number..."
    );

    let phoneNumberId: string | null =
      frontendPhoneNumberId || null;

    let displayPhone =
      "Unknown";

    let verifiedName =
      "";

    let phoneStatus =
      "UNKNOWN";

    /* -----------------------------------------------------
       METHOD 1
       FRONTEND PHONE NUMBER ID
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
            phone.id;

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
      }
    }

    /* -----------------------------------------------------
       METHOD 2
       GET PHONE NUMBERS FROM WABA
    ----------------------------------------------------- */

    if (!phoneNumberId) {
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
          },
          {
            status: 400,
          }
        );
      }

      const selectedPhone =
        phones.data.find(
          (phone: any) =>
            phone.verified_name
        ) ||
        phones.data[0];

      phoneNumberId =
        selectedPhone.id;

      displayPhone =
        selectedPhone.display_phone_number ||
        "Unknown";

      verifiedName =
        selectedPhone.verified_name ||
        "";

      phoneStatus =
        selectedPhone.status ||
        "UNKNOWN";
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Could not determine Phone Number ID.",
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      "[Embedded Signup] ✓ Phone:",
      displayPhone,
      "| ID:",
      phoneNumberId
    );

    /* =====================================================
       STEP 6
       RESOLVE BUSINESS PORTFOLIO ID
    ===================================================== */

    console.log(
      "[Embedded Signup] Step 6: Resolving Business Portfolio..."
    );

    let businessId: string | null =
      frontendBusinessId || null;

    if (businessId) {
      console.log(
        "[Embedded Signup] Business ID from frontend:",
        businessId
      );
    }

    /* -----------------------------------------------------
       TRY /me/businesses
    ----------------------------------------------------- */

    if (!businessId) {
      try {
        const businesses =
          await metaGet(
            "/me/businesses",
            accessToken
          );

        if (
          businesses?.data?.length
        ) {
          /* -----------------------------------------------
             Find business owning the WABA
          ----------------------------------------------- */

          for (
            const business of
              businesses.data
          ) {
            try {
              const wabas =
                await metaGet(
                  `/${business.id}/whatsapp_business_accounts`,
                  accessToken
                );

              const ownsWaba =
                wabas?.data?.some(
                  (waba: any) =>
                    waba.id ===
                    wabaId
                );

              if (ownsWaba) {
                businessId =
                  business.id;

                console.log(
                  "[Embedded Signup] ✓ Business Portfolio found:",
                  businessId
                );

                break;
              }
            } catch {
              /* Continue */
            }
          }

          /* -----------------------------------------------
             If only one business exists
          ----------------------------------------------- */

          if (
            !businessId &&
            businesses.data.length === 1
          ) {
            businessId =
              businesses.data[0].id;

            console.log(
              "[Embedded Signup] ✓ Using only available Business Portfolio:",
              businessId
            );
          }
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] Business Portfolio lookup failed:",
          error
        );
      }
    }

    /* =====================================================
       BUSINESS ID REQUIRED
    ===================================================== */

    if (!businessId) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Could not determine the customer's Business Portfolio ID. Send businessId from the Embedded Signup frontend event, or make sure the Embedded Signup access token has permission to access /me/businesses.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       STEP 7
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

    const existingNumbers: any[] =
      Array.isArray(
        user.whatsappNumbers
      )
        ? user.whatsappNumbers
        : [];

    /* =====================================================
       STEP 8
       PREVENT DUPLICATE
    ===================================================== */

    const duplicate =
      existingNumbers.some(
        (number: any) =>
          number.whatsappPhoneNumberId ===
          phoneNumberId
      );

    if (duplicate) {
      return NextResponse.json(
        {
          success: false,

          message:
            `Number ${displayPhone} is already connected.`,
        },
        {
          status: 409,
        }
      );
    }

    /* =====================================================
       STEP 9
       GENERATE REGISTRATION PIN
    ===================================================== */

    const registrationPin =
      Math.floor(
        100000 +
          Math.random() *
            900000
      ).toString();

    /* =====================================================
       STEP 10
       SETUP TIMINGS
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

    /* =====================================================
       STEP 11
       CREATE NUMBER OBJECT
    ===================================================== */

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

      addedAt:
        setupStart,

      source:
        "embedded_signup",

      /* -----------------------------------------------
         Business Portfolio
      ----------------------------------------------- */

      businessId,

      /* -----------------------------------------------
         Automatic setup state
      ----------------------------------------------- */

      setupStatus:
        "WAITING_CREDIT_LINE",

      creditLineStatus:
        "PENDING",

      subscriptionStatus:
        "PENDING",

      registrationStatus:
        "PENDING",

      setupError:
        null,

      /* -----------------------------------------------
         Registration PIN
      ----------------------------------------------- */

      registrationPin,

      setupStartedAt:
        setupStart,

      nextSetupAttemptAt:
        nextSetupAttempt,

      setupCompletedAt:
        null,
    };

    if (
      !Array.isArray(
        user.whatsappNumbers
      )
    ) {
      user.whatsappNumbers =
        [] as any;
    }

    user.whatsappNumbers.push(
      newNumber
    );

    /* =====================================================
       KEEP MAIN WHATSAPP FIELDS
    ===================================================== */

    if (isFirstNumber) {
      user.wabaId =
        wabaId;

      user.whatsappPhoneNumberId =
        phoneNumberId;

      user.whatsappAccessToken =
        accessToken;
    }

    /* =====================================================
       SAVE TO DATABASE
    ===================================================== */

    await user.save();

    console.log(
      "[Embedded Signup] ✓ Number saved to database"
    );

    /* =====================================================
       STEP 12
       READ WABA + BUSINESS ID FROM DATABASE

       IMPORTANT:
       Pinbot does NOT receive the frontend values.

       We fetch the user again from MongoDB and read the
       values that were actually persisted.
    ===================================================== */

    let pinbotSuccess = false;
    let pinbotResponse: any = null;
    let pinbotErrorMessage: string | null = null;

    try {
      console.log(
        "[Embedded Signup] Reading saved number from database..."
      );

      const savedUser =
        await User.findById(
          session.user.id
        ).lean();

      if (!savedUser) {
        throw new Error(
          "Could not reload user from database."
        );
      }

      const savedNumbers: any[] =
        Array.isArray(
          savedUser.whatsappNumbers
        )
          ? savedUser.whatsappNumbers
          : [];

      /* -----------------------------------------------
         Find the exact number that was just saved
      ----------------------------------------------- */

      const savedNumber =
        savedNumbers.find(
          (number: any) =>
            String(
              number.whatsappPhoneNumberId
            ) ===
            String(phoneNumberId)
        );

      if (!savedNumber) {
        throw new Error(
          "Saved WhatsApp number could not be found in database."
        );
      }

      /* -----------------------------------------------
         READ ONLY FROM DATABASE
      ----------------------------------------------- */

      const dbWabaId =
        savedNumber.wabaId;

      const dbBusinessId =
        savedNumber.businessId;

      if (!dbWabaId) {
        throw new Error(
          "WABA ID was not found in the database."
        );
      }

      if (!dbBusinessId) {
        throw new Error(
          "Business Portfolio ID was not found in the database."
        );
      }

      console.log(
        "[Pinbot] ✓ WABA ID read from DB:",
        dbWabaId
      );

      console.log(
        "[Pinbot] ✓ Business ID read from DB:",
        dbBusinessId
      );

      /* =================================================
         CALL PINBOT
      ================================================= */

      pinbotResponse =
        await sendEmbeddedDetailToPinbot(
          String(dbWabaId),
          String(dbBusinessId)
        );

      pinbotSuccess = true;

      console.log(
        "[Pinbot] ✓ Embedded details sent successfully"
      );

      /* -----------------------------------------------
         Update DB status
      ----------------------------------------------- */

      await User.updateOne(
        {
          _id: session.user.id,
          "whatsappNumbers.whatsappPhoneNumberId":
            phoneNumberId,
        },
        {
          $set: {
            "whatsappNumbers.$.pinbotEmbeddedDetailStatus":
              "SUCCESS",

            "whatsappNumbers.$.pinbotEmbeddedDetailResponse":
              pinbotResponse,

            "whatsappNumbers.$.pinbotEmbeddedDetailAt":
              new Date(),

            "whatsappNumbers.$.setupStatus":
              "WAITING_CREDIT_LINE",
          },
        }
      );
    } catch (pinbotError: any) {
      pinbotSuccess = false;

      pinbotErrorMessage =
        pinbotError?.message ||
        "Pinbot embedded detail API failed.";

      console.error(
        "[Pinbot] ✗ Embedded detail receiver failed:",
        pinbotError
      );

      /* -----------------------------------------------
         Save Pinbot failure to DB.

         We DO NOT delete the WhatsApp number because
         Meta Embedded Signup itself already succeeded.
      ----------------------------------------------- */

      try {
        await User.updateOne(
          {
            _id: session.user.id,
            "whatsappNumbers.whatsappPhoneNumberId":
              phoneNumberId,
          },
          {
            $set: {
              "whatsappNumbers.$.pinbotEmbeddedDetailStatus":
                "FAILED",

              "whatsappNumbers.$.pinbotEmbeddedDetailError":
                pinbotErrorMessage,

              "whatsappNumbers.$.pinbotEmbeddedDetailAt":
                new Date(),
            },
          }
        );
      } catch (dbError) {
        console.error(
          "[Pinbot] Failed to save Pinbot error:",
          dbError
        );
      }
    }

    /* =====================================================
       FINAL LOGS
    ===================================================== */

    console.log(
      "[Embedded Signup] ========================================"
    );

    console.log(
      "[Embedded Signup] ✓ Number saved"
    );

    console.log(
      "[Embedded Signup] WABA:",
      wabaId
    );

    console.log(
      "[Embedded Signup] Phone:",
      phoneNumberId
    );

    console.log(
      "[Embedded Signup] Business:",
      businessId
    );

    console.log(
      "[Embedded Signup] Pinbot:",
      pinbotSuccess
        ? "SUCCESS"
        : "FAILED"
    );

    console.log(
      "[Embedded Signup] Status: WAITING_CREDIT_LINE"
    );

    console.log(
      "[Embedded Signup] Next attempt:",
      nextSetupAttempt
    );

    console.log(
      "[Embedded Signup] ========================================"
    );

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,

      message:
        pinbotSuccess
          ? `WhatsApp number ${displayPhone} connected and Embedded Signup details were successfully sent to Pinbot.`
          : `WhatsApp number ${displayPhone} was connected, but the Pinbot embedded detail API call failed. The number remains saved for retry.`,

      data: {
        wabaId,
        phoneNumberId,
        businessId,

        setupStatus:
          "WAITING_CREDIT_LINE",

        pinbotEmbeddedDetailStatus:
          pinbotSuccess
            ? "SUCCESS"
            : "FAILED",

        pinbotError:
          pinbotErrorMessage,

        nextSetupAttemptAt:
          nextSetupAttempt,
      },
    });
  } catch (error: any) {
    console.error(
      "[Embedded Signup] ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          error?.message ||
          "Unexpected error occurred.",
      },
      {
        status: 500,
      }
    );
  }
}
