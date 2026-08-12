/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const META_API_VERSION = "v24.0";

/*
 * ============================================================
 * META GET HELPER
 * ============================================================
 */

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
    `https://graph.facebook.com/${META_API_VERSION}` +
    `${path}?${params.toString()}`;

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

/*
 * ============================================================
 * POST
 * ============================================================
 */

export async function POST(req: Request) {
  try {
    await connectDB();

    /*
     * ----------------------------------------------------------
     * AUTHENTICATION
     * ----------------------------------------------------------
     */

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

    /*
     * ----------------------------------------------------------
     * REQUEST BODY
     * ----------------------------------------------------------
     *
     * Expected:
     *
     * {
     *   code: "...",
     *   wabaId?: "...",
     *   phoneNumberId?: "...",
     *   businessId?: "..."
     * }
     */

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

    /*
     * ----------------------------------------------------------
     * META APP CREDENTIALS
     * ----------------------------------------------------------
     */

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
     * ==========================================================
     * STEP 1
     * Exchange Embedded Signup code
     * ==========================================================
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

    if (!tokenResponse.ok || !tokenData?.access_token) {
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
     * ==========================================================
     * STEP 2
     * Check permissions
     * ==========================================================
     */

    console.log(
      "[Embedded Signup] Step 2: Checking permissions..."
    );

    try {
      const permissions = await metaGet(
        "/me/permissions",
        accessToken
      );

      const grantedPermissions =
        permissions?.data || [];

      const whatsappManagement =
        grantedPermissions.find(
          (permission: any) =>
            permission.permission ===
              "whatsapp_business_management" &&
            permission.status === "granted"
        );

      if (!whatsappManagement) {
        console.warn(
          "[Embedded Signup] whatsapp_business_management permission not confirmed."
        );
      } else {
        console.log(
          "[Embedded Signup] ✓ WhatsApp Business Management permission granted"
        );
      }
    } catch (error) {
      /*
       * Permission inspection should not unnecessarily kill
       * the Embedded Signup callback.
       */

      console.warn(
        "[Embedded Signup] Permission check failed:",
        error
      );
    }

    /*
     * ==========================================================
     * STEP 3
     * Resolve WABA
     * ==========================================================
     */

    console.log(
      "[Embedded Signup] Step 3: Resolving WABA..."
    );

    let wabaId: string | null =
      frontendWabaId || null;

    /*
     * METHOD 1
     * Frontend supplied WABA ID
     */

    if (wabaId) {
      console.log(
        "[Embedded Signup] ✓ WABA supplied by frontend:",
        wabaId
      );
    }

    /*
     * METHOD 2
     * /me/whatsapp_business_accounts
     */

    if (!wabaId) {
      try {
        const response = await metaGet(
          "/me/whatsapp_business_accounts",
          accessToken
        );

        if (response?.data?.length) {
          wabaId = response.data[0].id;

          console.log(
            "[Embedded Signup] ✓ WABA from /me/whatsapp_business_accounts:",
            wabaId
          );
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] WABA lookup failed:",
          error
        );
      }
    }

    /*
     * METHOD 3
     * debug_token granular scopes
     */

    if (!wabaId) {
      try {
        const appAccessToken =
          `${appId}|${appSecret}`;

        const debugParams =
          new URLSearchParams({
            input_token: accessToken,
            access_token: appAccessToken,
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

        const granularScopes =
          debugData?.data?.granular_scopes || [];

        const wabaScope =
          granularScopes.find(
            (scope: any) =>
              scope.scope ===
              "whatsapp_business_management"
          );

        if (wabaScope?.target_ids?.length) {
          wabaId =
            wabaScope.target_ids[0];

          console.log(
            "[Embedded Signup] ✓ WABA from debug_token:",
            wabaId
          );
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] debug_token lookup failed:",
          error
        );
      }
    }

    /*
     * METHOD 4
     * Search businesses
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
              const matchingWaba =
                businessWabas.data.find(
                  (waba: any) =>
                    waba.id ===
                    frontendWabaId
                );

              if (matchingWaba) {
                wabaId =
                  matchingWaba.id;

                console.log(
                  "[Embedded Signup] ✓ Matching WABA found:",
                  wabaId
                );

                break;
              }
            }
          } catch {
            /*
             * Continue with next business.
             */
          }
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] Business search failed:",
          error
        );
      }
    }

    if (!wabaId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Could not determine WABA ID. Make sure Embedded Signup completed successfully.",
        },
        {
          status: 400,
        }
      );
    }

    console.log(
      "[Embedded Signup] ✓ Final WABA:",
      wabaId
    );

    /*
     * ==========================================================
     * STEP 4
     * Resolve Phone Number
     * ==========================================================
     */

    console.log(
      "[Embedded Signup] Step 4: Resolving phone number..."
    );

    let phoneNumberId: string | null =
      frontendPhoneNumberId || null;

    let displayPhone = "Unknown";
    let verifiedName = "";
    let phoneStatus = "UNKNOWN";

    /*
     * METHOD 1
     * Frontend phone number ID
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
          phoneNumberId = phone.id;

          displayPhone =
            phone.display_phone_number ||
            "Unknown";

          verifiedName =
            phone.verified_name || "";

          phoneStatus =
            phone.status || "UNKNOWN";
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] Phone lookup failed:",
          error
        );
      }
    }

    /*
     * METHOD 2
     * WABA phone numbers
     */

    if (!phoneNumberId) {
      try {
        const phones =
          await metaGet(
            `/${wabaId}/phone_numbers`,
            accessToken,
            "id,display_phone_number,verified_name,status"
          );

        if (!phones?.data?.length) {
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
          phones.data[0];

        phoneNumberId =
          selectedPhone.id;

        displayPhone =
          selectedPhone.display_phone_number ||
          "Unknown";

        verifiedName =
          selectedPhone.verified_name || "";

        phoneStatus =
          selectedPhone.status ||
          "UNKNOWN";
      } catch (error: any) {
        console.error(
          "[Embedded Signup] Phone lookup failed:",
          error
        );

        return NextResponse.json(
          {
            success: false,
            message:
              error?.message ||
              "Could not retrieve WhatsApp phone number.",
          },
          {
            status: 400,
          }
        );
      }
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
      displayPhone
    );

    console.log(
      "[Embedded Signup] ✓ Phone Number ID:",
      phoneNumberId
    );

    /*
     * ==========================================================
     * STEP 5
     * Resolve Business Portfolio ID
     * ==========================================================
     *
     * IMPORTANT:
     *
     * Business ID is OPTIONAL here.
     *
     * Embedded Signup should not fail merely because this
     * information wasn't returned.
     *
     * The later partner/credit-line process can resolve it.
     * ==========================================================
     */

    console.log(
      "[Embedded Signup] Step 5: Resolving Business Portfolio..."
    );

    let businessId: string | null =
      frontendBusinessId || null;

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

        if (businesses?.data?.length) {
          /*
           * If only one business is visible,
           * use it as the best available match.
           */

          if (
            businesses.data.length === 1
          ) {
            businessId =
              businesses.data[0].id;

            console.log(
              "[Embedded Signup] ✓ Business Portfolio:",
              businessId
            );
          } else {
            /*
             * Try matching the WABA.
             */

            for (
              const business of
                businesses.data
            ) {
              try {
                const businessWabas =
                  await metaGet(
                    `/${business.id}/whatsapp_business_accounts`,
                    accessToken
                  );

                const match =
                  businessWabas?.data?.some(
                    (waba: any) =>
                      waba.id === wabaId
                  );

                if (match) {
                  businessId =
                    business.id;

                  console.log(
                    "[Embedded Signup] ✓ Business Portfolio matched to WABA:",
                    businessId
                  );

                  break;
                }
              } catch {
                /*
                 * Continue.
                 */
              }
            }
          }
        }
      } catch (error) {
        console.warn(
          "[Embedded Signup] Business Portfolio lookup unavailable:",
          error
        );
      }
    }

    /*
     * IMPORTANT:
     *
     * DO NOT RETURN 400 HERE.
     *
     * businessId is allowed to remain null.
     */

    if (!businessId) {
      console.warn(
        "[Embedded Signup] ⚠ Business Portfolio ID not available yet."
      );

      console.warn(
        "[Embedded Signup] Signup will continue without it."
      );
    }

    /*
     * ==========================================================
     * STEP 6
     * Load User
     * ==========================================================
     */

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

    /*
     * ==========================================================
     * STEP 7
     * Existing numbers
     * ==========================================================
     */

    const existingNumbers: any[] =
      Array.isArray(
        user.whatsappNumbers
      )
        ? user.whatsappNumbers
        : [];

    /*
     * ==========================================================
     * STEP 8
     * Duplicate check
     * ==========================================================
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
     * ==========================================================
     * STEP 9
     * Setup timing
     * ==========================================================
     *
     * We don't call the partner process directly from the
     * user's signup request.
     *
     * We save the state and let the setup worker/process
     * continue it.
     *
     * NO REDIS REQUIRED.
     */

    const setupStartedAt =
      new Date();

    const nextSetupAttemptAt =
      new Date(
        Date.now() +
          4 * 60 * 1000
      );

    /*
     * ==========================================================
     * STEP 10
     * Create WhatsApp Number object
     * ==========================================================
     */

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

      /*
       * Business Portfolio.
       *
       * Can be null.
       */

      businessId:
        businessId || null,

      /*
       * Setup status.
       */

      setupStatus:
        businessId
          ? "WAITING_CREDIT_LINE"
          : "PROCESSING",

      creditLineStatus:
        "PENDING",

      subscriptionStatus:
        "PENDING",

      registrationStatus:
        "PENDING",

      /*
       * IMPORTANT:
       *
       * Do not generate a fake registration PIN here.
       *
       * The actual Meta registration flow must use the
       * appropriate registration/verification process.
       */

      registrationPin:
        null,

      setupError:
        null,

      setupStartedAt,

      nextSetupAttemptAt,

      setupCompletedAt:
        null,
    };

    /*
     * ==========================================================
     * STEP 11
     * Save number
     * ==========================================================
     */

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
     * Keep your existing primary-number fields.
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

    /*
     * ==========================================================
     * LOG
     * ==========================================================
     */

    console.log(
      "=================================================="
    );

    console.log(
      "[Embedded Signup] ✓ SUCCESS"
    );

    console.log(
      "[Embedded Signup] User:",
      session.user.id
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
      "[Embedded Signup] Display Phone:",
      displayPhone
    );

    console.log(
      "[Embedded Signup] Business:",
      businessId || "NOT AVAILABLE"
    );

    console.log(
      "[Embedded Signup] Setup Status:",
      newNumber.setupStatus
    );

    console.log(
      "[Embedded Signup] Next Attempt:",
      nextSetupAttemptAt
    );

    console.log(
      "=================================================="
    );

    /*
     * ==========================================================
     * RESPONSE
     * ==========================================================
     */

    return NextResponse.json({
      success: true,

      message:
        `WhatsApp number ${displayPhone} connected successfully.`,

      data: {
        wabaId,

        phoneNumberId,

        displayPhoneNumber:
          displayPhone,

        businessId:
          businessId || null,

        setupStatus:
          newNumber.setupStatus,

        creditLineStatus:
          "PENDING",

        subscriptionStatus:
          "PENDING",

        registrationStatus:
          "PENDING",
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
