/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const META_API_VERSION = "v19.0";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    // ✅ Accept both `code` and optional `wabaId` / `phoneNumberId` from the frontend extras
    const { code, wabaId: frontendWabaId, phoneNumberId: frontendPhoneNumberId } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, message: "No authorization code received from Meta." },
        { status: 400 }
      );
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      console.error("[Embedded Signup] META_APP_ID or META_APP_SECRET missing");
      return NextResponse.json(
        { success: false, message: "Meta credentials not configured on server." },
        { status: 500 }
      );
    }

    // ─── STEP 1: Exchange code for token ──────────────────────────
    console.log("[Embedded Signup] Step 1: Exchanging code for token...");

    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code: code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      }
    );

    const tokenData = await tokenRes.json();
    console.log("[Embedded Signup] Token exchange response:", JSON.stringify(tokenData, null, 2));

    if (!tokenData.access_token) {
      console.error("[Embedded Signup] Token exchange failed:", JSON.stringify(tokenData));
      return NextResponse.json(
        {
          success: false,
          message: tokenData.error?.message || "Failed to exchange authorization code.",
        },
        { status: 400 }
      );
    }

    let accessToken: string = tokenData.access_token;
    console.log("[Embedded Signup] ✓ Token obtained");

    // ─── STEP 1.5: Verify permissions ─────────────────────────────
    console.log("[Embedded Signup] Step 1.5: Checking permissions...");

    const permsRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/permissions?access_token=${accessToken}`
    );
    const permsData = await permsRes.json();
    console.log("[Embedded Signup] Permissions:", JSON.stringify(permsData.data, null, 2));

    const wabaPerm = permsData.data?.find(
      (p: any) => p.permission === "whatsapp_business_management"
    );

    if (!wabaPerm || wabaPerm.status !== "granted") {
      console.error("[Embedded Signup] Missing whatsapp_business_management permission");
      return NextResponse.json(
        {
          success: false,
          message:
            "Permission denied: whatsapp_business_management not granted. Please re-run the Meta signup and accept ALL permissions.",
        },
        { status: 400 }
      );
    }

    // ─── STEP 2: Upgrade to long-lived token ──────────────────────
    console.log("[Embedded Signup] Step 2: Upgrading to long-lived token...");

    try {
      const llParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: accessToken,
      });

      const llRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: llParams.toString(),
        }
      );
      const llData = await llRes.json();

      if (llData.access_token) {
        accessToken = llData.access_token;
        console.log("[Embedded Signup] ✓ Long-lived token obtained");
      }
    } catch (e) {
      console.warn("[Embedded Signup] Long-lived upgrade skipped:", e);
    }

    // ─── STEP 3: Resolve WABA ID ───────────────────────────────────
    // ✅ Priority 1: Use WABA ID sent from the frontend (captured from FB.login extras)
    console.log("[Embedded Signup] Step 3: Resolving WABA ID...");
    console.log("[Embedded Signup] Frontend-provided wabaId:", frontendWabaId);
    console.log("[Embedded Signup] Frontend-provided phoneNumberId:", frontendPhoneNumberId);

    let wabaId: string | null = frontendWabaId || null;

    // ✅ Priority 2: Try /me/whatsapp_business_accounts
    if (!wabaId) {
      console.log("[Embedded Signup] Trying /me/whatsapp_business_accounts...");
      const wabaRes1 = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/me/whatsapp_business_accounts?access_token=${accessToken}`
      );
      const wabaData1 = await wabaRes1.json();
      console.log("[Embedded Signup] /me/whatsapp_business_accounts:", JSON.stringify(wabaData1, null, 2));

      if (wabaData1.data && wabaData1.data.length > 0) {
        wabaId = wabaData1.data[0].id;
        console.log("[Embedded Signup] ✓ WABA found via /me/whatsapp_business_accounts:", wabaId);
      }
    }

    // ✅ Priority 3: Try /me/businesses then check each business's WABAs
    if (!wabaId) {
      console.log("[Embedded Signup] Trying /me/businesses...");
      const bizRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/me/businesses?access_token=${accessToken}`
      );
      const bizData = await bizRes.json();
      console.log("[Embedded Signup] /me/businesses:", JSON.stringify(bizData, null, 2));

      if (bizData.data && bizData.data.length > 0) {
        for (const biz of bizData.data) {
          console.log(`[Embedded Signup] Checking business ${biz.id} for WABAs...`);
          const bizWabaRes = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}`
          );
          const bizWabaData = await bizWabaRes.json();
          console.log(`[Embedded Signup] Business ${biz.id} WABAs:`, JSON.stringify(bizWabaData, null, 2));

          if (bizWabaData.data && bizWabaData.data.length > 0) {
            wabaId = bizWabaData.data[0].id;
            console.log("[Embedded Signup] ✓ WABA found via /me/businesses:", wabaId);
            break;
          }
        }
      }
    }

    // ✅ Priority 4: Try /me/accounts (pages/apps linked to the user)
    if (!wabaId) {
      console.log("[Embedded Signup] Trying /me/accounts...");
      const acctRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
      );
      const acctData = await acctRes.json();
      console.log("[Embedded Signup] /me/accounts:", JSON.stringify(acctData, null, 2));

      if (acctData.data && acctData.data.length > 0) {
        for (const account of acctData.data) {
          const bizWabaRes = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${account.id}/whatsapp_business_accounts?access_token=${account.access_token || accessToken}`
          );
          const bizWabaData = await bizWabaRes.json();
          console.log(`[Embedded Signup] Account ${account.id} WABAs:`, JSON.stringify(bizWabaData, null, 2));

          if (bizWabaData.data && bizWabaData.data.length > 0) {
            wabaId = bizWabaData.data[0].id;
            if (account.access_token) accessToken = account.access_token;
            console.log("[Embedded Signup] ✓ WABA found via /me/accounts:", wabaId);
            break;
          }
        }
      }
    }

    // ✅ Priority 5: If frontendPhoneNumberId is provided, try to get WABA from it directly
    if (!wabaId && frontendPhoneNumberId) {
      console.log("[Embedded Signup] Trying to get WABA from phone number ID:", frontendPhoneNumberId);
      const phoneRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${frontendPhoneNumberId}?fields=id,display_phone_number,verified_name,status,certificate&access_token=${accessToken}`
      );
      const phoneData = await phoneRes.json();
      console.log("[Embedded Signup] Phone lookup:", JSON.stringify(phoneData, null, 2));
    }

    if (!wabaId) {
      console.error("[Embedded Signup] ❌ No WABA found with any method!");

      // Log debug token info for diagnosis
      const debugRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      console.log("[Embedded Signup] Debug token:", JSON.stringify(debugData, null, 2));

      return NextResponse.json(
        {
          success: false,
          message:
            "No WhatsApp Business Account found.\n\nMost likely causes:\n1. The Meta embedded signup popup was closed before completing WABA setup\n2. Your Meta App is missing the 'whatsapp_business_management' permission in its config\n3. The WABA belongs to a different Facebook user\n\nFix: In your Meta App Dashboard → WhatsApp → Embedded Signup → make sure the flow includes WABA creation and phone number registration steps.",
        },
        { status: 400 }
      );
    }

    // ─── STEP 4: Get phone numbers from WABA ──────────────────────
    console.log("[Embedded Signup] Step 4: Fetching phone numbers from WABA:", wabaId);

    let phoneNumberId: string;
    let displayPhone: string;
    let verifiedName: string;
    let phoneStatus: string;

    // ✅ If frontend already provided phoneNumberId, fetch its details directly
    if (frontendPhoneNumberId) {
      console.log("[Embedded Signup] Using frontend-provided phone number ID:", frontendPhoneNumberId);
      const phoneDetailRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${frontendPhoneNumberId}?fields=id,display_phone_number,verified_name,status&access_token=${accessToken}`
      );
      const phoneDetail = await phoneDetailRes.json();
      console.log("[Embedded Signup] Phone detail:", JSON.stringify(phoneDetail, null, 2));

      if (phoneDetail.id) {
        phoneNumberId = phoneDetail.id;
        displayPhone = phoneDetail.display_phone_number || "Unknown";
        verifiedName = phoneDetail.verified_name || "";
        phoneStatus = phoneDetail.status || "UNKNOWN";
      } else {
        // Fall back to listing phones from WABA
        const phonesRes = await fetch(
          `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status&access_token=${accessToken}`
        );
        const phonesData = await phonesRes.json();
        console.log("[Embedded Signup] Phones from WABA:", JSON.stringify(phonesData, null, 2));

        if (!phonesData.data || phonesData.data.length === 0) {
          return NextResponse.json(
            {
              success: false,
              message: "WABA found but has no phone numbers. Please add a phone number in Meta Business Manager.",
            },
            { status: 400 }
          );
        }

        const selectedPhone = phonesData.data.find((p: any) => p.verified_name) || phonesData.data[0];
        phoneNumberId = selectedPhone.id;
        displayPhone = selectedPhone.display_phone_number || "Unknown";
        verifiedName = selectedPhone.verified_name || "";
        phoneStatus = selectedPhone.status || "UNKNOWN";
      }
    } else {
      const phonesRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status&access_token=${accessToken}`
      );
      const phonesData = await phonesRes.json();
      console.log("[Embedded Signup] Phones from WABA:", JSON.stringify(phonesData, null, 2));

      if (!phonesData.data || phonesData.data.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "WABA found but has no phone numbers. Please add a phone number in Meta Business Manager.",
          },
          { status: 400 }
        );
      }

      const selectedPhone = phonesData.data.find((p: any) => p.verified_name) || phonesData.data[0];
      phoneNumberId = selectedPhone.id;
      displayPhone = selectedPhone.display_phone_number || "Unknown";
      verifiedName = selectedPhone.verified_name || "";
      phoneStatus = selectedPhone.status || "UNKNOWN";
    }

    console.log("[Embedded Signup] ✓ Phone:", displayPhone, "| Status:", phoneStatus);

    // ─── STEP 5: Save to database ──────────────────────────────────
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    const existingNumbers: any[] = Array.isArray(user.whatsappNumbers) ? user.whatsappNumbers : [];

    const isDuplicate = existingNumbers.some(
      (n: any) => n.whatsappPhoneNumberId === phoneNumberId
    );
    if (isDuplicate) {
      return NextResponse.json(
        { success: false, message: `Number ${displayPhone} is already connected.` },
        { status: 409 }
      );
    }

    const isFirstNumber = existingNumbers.length === 0;

    const newNumber: any = {
      name: verifiedName || `WhatsApp ${displayPhone}`,
      wabaId: wabaId,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappAccessToken: accessToken,
      displayPhoneNumber: displayPhone,
      verifiedName: verifiedName,
      phoneStatus: phoneStatus,
      isActive: isFirstNumber,
      addedAt: new Date(),
      source: "embedded_signup",
    };

    if (!user.whatsappNumbers || !Array.isArray(user.whatsappNumbers)) {
      user.whatsappNumbers = [] as any;
    }
    user.whatsappNumbers.push(newNumber);

    if (isFirstNumber) {
      user.wabaId = wabaId;
      user.whatsappPhoneNumberId = phoneNumberId;
      user.whatsappAccessToken = accessToken;
    }

    await user.save();

    console.log(`[Embedded Signup] ✓ Saved "${newNumber.name}" for user ${session.user.id}`);

    return NextResponse.json({
      success: true,
      message: `WhatsApp number ${displayPhone} connected successfully!${
        isFirstNumber ? " Set as active number." : ""
      }`,
    });
  } catch (error: any) {
    console.error("[Embedded Signup] ERROR:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Unexpected error occurred." },
      { status: 500 }
    );
  }
}
