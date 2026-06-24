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
    const { code } = body;

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

    // ─── STEP 1: Exchange code for token (using POST method) ──────
    console.log("[Embedded Signup] Step 1: Exchanging code for token...");
    console.log("[Embedded Signup] Code received:", code.substring(0, 20) + "...");

    // ✅ Use POST with form data - more reliable for Embedded Signup
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code: code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenParams.toString(),
      }
    );

    const tokenData = await tokenRes.json();
    console.log("[Embedded Signup] Token exchange response:", JSON.stringify(tokenData, null, 2));

    if (!tokenData.access_token) {
      console.error("[Embedded Signup] Token exchange failed:", JSON.stringify(tokenData));
      return NextResponse.json(
        { success: false, message: tokenData.error?.message || "Failed to exchange authorization code." },
        { status: 400 }
      );
    }

    let accessToken: string = tokenData.access_token;
    console.log("[Embedded Signup] ✓ Token obtained:", accessToken.substring(0, 30) + "...");

    // ─── STEP 1.5: Check WHO this token belongs to ───────────────
    console.log("[Embedded Signup] Step 1.5: Identifying token owner...");
    
    const meRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name&access_token=${accessToken}`
    );
    const meData = await meRes.json();
    console.log("[Embedded Signup] Token owner:", JSON.stringify(meData));

    // ─── STEP 1.6: Check permissions ──────────────────────────────
    console.log("[Embedded Signup] Step 1.6: Checking permissions...");
    
    const permsRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/permissions?access_token=${accessToken}`
    );
    const permsData = await permsRes.json();
    console.log("[Embedded Signup] All permissions:", JSON.stringify(permsData.data, null, 2));

    const wabaPerm = permsData.data?.find(
      (p: any) => p.permission === "whatsapp_business_management"
    );
    console.log("[Embedded Signup] WABA permission status:", wabaPerm?.status || "NOT FOUND");

    if (!wabaPerm || wabaPerm.status !== "granted") {
      console.error("[Embedded Signup] CRITICAL: No whatsapp_business_management permission!");
      return NextResponse.json(
        {
          success: false,
          message: "Permission denied: whatsapp_business_management not granted. Please re-run the Meta signup and accept ALL permissions.",
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
      console.log("[Embedded Signup] Long-lived response:", JSON.stringify(llData));

      if (llData.access_token) {
        accessToken = llData.access_token;
        console.log("[Embedded Signup] ✓ Long-lived token obtained");
      }
    } catch (e) {
      console.warn("[Embedded Signup] Long-lived upgrade skipped:", e);
    }

    // ─── STEP 3: Get WhatsApp Business Accounts (Multiple Methods) ─
    console.log("[Embedded Signup] Step 3: Fetching WABAs...");

    // Method 1: Standard /me/whatsapp_business_accounts
    let wabaId: string | null = null;

    console.log("[Embedded Signup] Trying Method 1: /me/whatsapp_business_accounts...");
    const wabaRes1 = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/whatsapp_business_accounts?access_token=${accessToken}`
    );
    const wabaData1 = await wabaRes1.json();
    console.log("[Embedded Signup] Method 1 result:", JSON.stringify(wabaData1, null, 2));

    if (wabaData1.data && wabaData1.data.length > 0) {
      wabaId = wabaData1.data[0].id;
      console.log("[Embedded Signup] ✓ WABA found via Method 1:", wabaId);
    }

    // Method 2: Try /me/accounts to get business accounts
    if (!wabaId) {
      console.log("[Embedded Signup] Trying Method 2: /me/accounts...");
      const wabaRes2 = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
      );
      const wabaData2 = await wabaRes2.json();
      console.log("[Embedded Signup] Method 2 result:", JSON.stringify(wabaData2, null, 2));

      if (wabaData2.data && wabaData2.data.length > 0) {
        // Try to get WABA from each business account
        for (const account of wabaData2.data) {
          console.log(`[Embedded Signup] Checking business account ${account.id}...`);
          const bizWabaRes = await fetch(
            `https://graph.facebook.com/${META_API_VERSION}/${account.id}/whatsapp_business_accounts?access_token=${account.access_token || accessToken}`
          );
          const bizWabaData = await bizWabaRes.json();
          console.log(`[Embedded Signup] Business ${account.id} WABAs:`, JSON.stringify(bizWabaData));

          if (bizWabaData.data && bizWabaData.data.length > 0) {
            wabaId = bizWabaData.data[0].id;
            if (account.access_token) {
              accessToken = account.access_token; // Use this token instead
            }
            console.log("[Embedded Signup] ✓ WABA found via Method 2:", wabaId);
            break;
          }
        }
      }
    }

    // Method 3: Try with debug_token to get more info
    if (!wabaId) {
      console.log("[Embedded Signup] Trying Method 3: Debug token...");
      const debugRes = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      console.log("[Embedded Signup] Debug token result:", JSON.stringify(debugData, null, 2));
    }

    if (!wabaId) {
      console.error("[Embedded Signup] ❌ No WABA found with any method!");
      return NextResponse.json(
        {
          success: false,
          message: "No WhatsApp Business Account found. This usually means:\n\n1. The Meta popup didn't complete WABA setup\n2. Your Meta App config is missing 'whatsapp_business_management' permission\n3. The WABA was created under a different account\n\nPlease check your Meta App > WhatsApp > API Setup > Embedded Signup config and ensure it includes WABA creation step.",
        },
        { status: 400 }
      );
    }

    // ─── STEP 4: Get phone numbers from WABA ──────────────────────
    console.log("[Embedded Signup] Step 4: Fetching phone numbers from WABA:", wabaId);

    const phonesRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`
    );
    const phonesData = await phonesRes.json();
    console.log("[Embedded Signup] Phones response:", JSON.stringify(phonesData, null, 2));

    if (!phonesData.data || phonesData.data.length === 0) {
      console.error("[Embedded Signup] No phones found in WABA");
      return NextResponse.json(
        {
          success: false,
          message: "WABA found but has no phone numbers. Please add a phone number in Meta Business Manager, then try again.",
        },
        { status: 400 }
      );
    }

    const selectedPhone =
      phonesData.data.find((p: any) => p.verified_name) || phonesData.data[0];

    const phoneNumberId: string = selectedPhone.id;
    const displayPhone: string = selectedPhone.display_phone_number || selectedPhone.phone_number || "Unknown";
    const verifiedName: string = selectedPhone.verified_name || "";
    const phoneStatus: string = selectedPhone.status || "UNKNOWN";

    console.log("[Embedded Signup] ✓ Phone:", displayPhone, "| Status:", phoneStatus);

    // ─── STEP 5: Save to user database ────────────────────────────
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found." },
        { status: 404 }
      );
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
      message: `WhatsApp number ${displayPhone} connected successfully!${isFirstNumber ? " Set as active number." : ""}`,
    });
  } catch (error: any) {
    console.error("[Embedded Signup] ERROR:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Unexpected error occurred." },
      { status: 500 }
    );
  }
}
