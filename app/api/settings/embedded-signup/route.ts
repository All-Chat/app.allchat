/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const META_API_VERSION = "v24.0";

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

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

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

    const body = await req.json();

    /*
     * Your frontend can send:
     *
     * code
     * wabaId
     * phoneNumberId
     * businessId
     *
     * Only code is mandatory.
     */

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

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

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

    /*
     * =========================================================
     * STEP 1
     * Exchange Embedded Signup code for access token
     * =========================================================
     */

    console.log(
      "[Embedded Signup] Step 1: Exchanging code..."
    );

    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
    });

    const tokenResponse = await fetch(
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

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
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

    /*
     * =========================================================
     * STEP 2
     * Verify permissions
     * =========================================================
     */

    console.log(
      "[Embedded Signup] Step 2: Checking permissions..."
    );

    try {
      const permissions = await metaGet(
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

    /*
     * =========================================================
     * STEP 3
     * Try long-lived token
     *
     * Keep this because your existing implementation already
     * uses this flow.
     * =========================================================
     */

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

    /*
     * =========================================================
     * STEP 4
     * Resolve WABA ID
     * =========================================================
     */

    console.log(
      "[Embedded Signup] Step 4: Resolving WABA..."
    );

    let wabaId: string | null =
      frontendWabaId || null;

    /*
     * METHOD 1
     * Frontend provided WABA ID
     */

    if (wabaId) {
      console.log(
        "[Embedded Signup] ✓ WABA from frontend:",
        wabaId
      );
    }

    /*
     * METHOD 2
     * /me/whatsapp_business_accounts
     */

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

    /*
     * METHOD 3
     * debug_token granular scope
     */

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

    /*
     * METHOD 4
     * /me/businesses
     */

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
            // Continue to next business
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

    /*
     * =========================================================
     * STEP 5
     * Resolve phone number
     * =========================================================
     */

    console.log(
      "[Embedded Signup] Step 5: Resolving phone number..."
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
     * Frontend provided Phone Number ID
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

    /*
     * METHOD 2
     * Get phone numbers from WABA
     */

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

    /*
     * =========================================================
     * STEP 6
     * Resolve Business Portfolio ID
     * =========================================================
     *
     * IMPORTANT:
     * We are NOT using PINBOT_SYSTEM_USER_TOKEN.
     *
     * First use businessId supplied by frontend.
     * Otherwise try /me/businesses with the Embedded Signup
     * access token.
     * =========================================================
     */

    console.log(
      "[Embedded Signup] Step 6: Resolving Business Portfolio..."
    );

    let businessId: string | null =
      frontendBusinessId ||
      null;

    if (businessId) {
      console.log(
        "[Embedded Signup] ✓ Business ID from frontend:",
        businessId
      );
    }

    /*
     * Try /me/businesses.
     */

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
          /*
           * Try to identify the business which owns
           * the WABA.
           */

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
              // Continue
            }
          }

          /*
           * If exact WABA match failed but only one business
           * is available, use it.
           */

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

    /*
     * We need businessId because Pinbot's credit-line API
     * requires it.
     */

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

    /*
     * =========================================================
     * STEP 7
     * Load User
     * =========================================================
     */

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

    /*
     * =========================================================
     * STEP 8
     * Prevent duplicate
     * =========================================================
     */

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

    /*
     * =========================================================
     * STEP 9
     * Generate registration PIN
     * =========================================================
     */

    const registrationPin =
      Math.floor(
        100000 +
          Math.random() *
            900000
      ).toString();

    /*
     * =========================================================
     * STEP 10
     * Save number
     *
     * We wait 4 minutes before credit-line API.
     * Pinbot specifically asks for 3-4 minutes sync time.
     * =========================================================
     */

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

      addedAt:
        setupStart,

      source:
        "embedded_signup",

      /*
       * Business Portfolio
       */

      businessId,

      /*
       * Automatic setup state
       */

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

      /*
       * PIN used for Meta registration / 2FA.
       */

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

    /*
     * Keep your existing main WhatsApp fields.
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
      "[Embedded Signup] Status: WAITING_CREDIT_LINE"
    );

    console.log(
      "[Embedded Signup] Next attempt:",
      nextSetupAttempt
    );

    console.log(
      "[Embedded Signup] ========================================"
    );

    /*
     * IMPORTANT:
     *
     * Do NOT wait here.
     *
     * The worker will continue the process.
     */

    return NextResponse.json({
      success: true,

      message:
        `WhatsApp number ${displayPhone} connected. Automatic setup will continue after the partner synchronization period.`,

      data: {
        wabaId,

        phoneNumberId,

        businessId,

        setupStatus:
          "WAITING_CREDIT_LINE",
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
