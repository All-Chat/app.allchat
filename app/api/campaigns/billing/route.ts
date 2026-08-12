/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
        },
        {
          status: 401,
        }
      );
    }

    /* =====================================================
       1. FETCH PRICING FIELDS
    ===================================================== */

    const user = await User.findById(session.user.id)
      .select(
        "enabledCountries priceMarketing priceUtility priceAuthentication pricePerMessage"
      )
      .lean();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
        },
        {
          status: 404,
        }
      );
    }

    /* =====================================================
       2. PRE-PROCESS COUNTRIES

       Sort country codes by length DESCENDING.

       Example:
       91
       1
       44

       This helps ensure longer country codes are checked
       before shorter ones.
    ===================================================== */

    const enabledCountries = (
      user.enabledCountries || []
    ).map((c: any) => ({
      ...c,
    }));

    enabledCountries.sort(
      (a: any, b: any) =>
        String(b.code || "").length -
        String(a.code || "").length
    );

    /* =====================================================
       3. FETCH CAMPAIGNS

       Only fetch the fields required by the billing page.

       $slice: 1 means MongoDB only returns the first
       phone number from phoneNumbers instead of loading
       the entire array.
    ===================================================== */

    const campaigns = await Campaign.find({
      userId: session.user.id,
    })
      .sort({
        createdAt: -1,
      })
      .select({
        _id: 1,
        name: 1,
        templateName: 1,
        templateCategory: 1,
        status: 1,
        totalMessages: 1,
        sentCount: 1,
        failedCount: 1,
        totalDeducted: 1,
        scheduledAt: 1,
        createdAt: 1,
        updatedAt: 1,
        startedAt: 1,
        completedAt: 1,
        liveStats: 1,

        phoneNumbers: {
          $slice: 1,
        },
      })
      .lean();

    /* =====================================================
       4. MAP CAMPAIGNS
    ===================================================== */

    const mappedCampaigns = campaigns.map(
      (c: any) => {
        let currentPrice = 0;

        let matchedCountry: any = null;

        /* -----------------------------------------------
           Get first phone number
        ------------------------------------------------ */

        const firstPhone =
          c.phoneNumbers?.[0]
            ? String(c.phoneNumbers[0]).replace(
                /\D/g,
                ""
              )
            : "";

        /* -----------------------------------------------
           Match country
        ------------------------------------------------ */

        if (firstPhone) {
          matchedCountry =
            enabledCountries.find(
              (country: any) =>
                firstPhone.startsWith(
                  String(country.code || "")
                )
            );
        }

        /* -----------------------------------------------
           Fallback to first enabled country
        ------------------------------------------------ */

        if (
          !matchedCountry &&
          enabledCountries.length > 0
        ) {
          matchedCountry =
            enabledCountries[0];
        }

        /* =================================================
           5. DETERMINE TEMPLATE CATEGORY
        ================================================= */

        const rawCategory = String(
          c.templateCategory || ""
        )
          .trim()
          .toUpperCase();

        const category =
          rawCategory === "UTILITY" ||
          rawCategory === "AUTHENTICATION"
            ? rawCategory
            : "MARKETING";

        /* =================================================
           6. DETERMINE PRICE
        ================================================= */

        if (matchedCountry) {
          /* ---------------------------------------------
             MARKETING
          --------------------------------------------- */

          if (category === "MARKETING") {
            currentPrice =
              Number(
                matchedCountry.priceMarketing
              ) ||
              Number(user.priceMarketing) ||
              0;
          }

          /* ---------------------------------------------
             UTILITY
          --------------------------------------------- */

          else if (
            category === "UTILITY"
          ) {
            currentPrice =
              Number(
                matchedCountry.priceUtility
              ) ||
              Number(user.priceUtility) ||
              0;
          }

          /* ---------------------------------------------
             AUTHENTICATION
          --------------------------------------------- */

          else if (
            category === "AUTHENTICATION"
          ) {
            currentPrice =
              Number(
                matchedCountry.priceAuthentication
              ) ||
              Number(
                user.priceAuthentication
              ) ||
              0;
          }
        } else {
          /* =================================================
             NO COUNTRY MATCH

             Use user's default pricing.
          ================================================= */

          if (
            category === "MARKETING"
          ) {
            currentPrice =
              Number(
                user.priceMarketing
              ) || 0;
          } else if (
            category === "UTILITY"
          ) {
            currentPrice =
              Number(
                user.priceUtility
              ) || 0;
          } else if (
            category === "AUTHENTICATION"
          ) {
            currentPrice =
              Number(
                user.priceAuthentication
              ) || 0;
          } else {
            currentPrice =
              Number(
                user.pricePerMessage
              ) || 0;
          }
        }

        /* =================================================
           7. RETURN CAMPAIGN
        ================================================= */

        return {
          ...c,

          currentPrice,
        };
      }
    );

    /* =====================================================
       8. RESPONSE
    ===================================================== */

    return NextResponse.json({
      success: true,
      campaigns: mappedCampaigns,
    });
  } catch (error) {
    console.error(
      "Error in campaign billing:",
      error
    );

    return NextResponse.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}
