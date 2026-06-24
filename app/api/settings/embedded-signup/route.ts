/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/settings/embedded-signup/route.ts
//
// ═══════════════════════════════════════════════════════════════
// REQUIRED ENV VARIABLES (add to your .env.local):
//
//   META_APP_ID=your_meta_app_id            ← Same as NEXT_PUBLIC_META_APP_ID
//   META_APP_SECRET=your_meta_app_secret    ← Server-only, from Meta App Dashboard
//
// Meta App Dashboard → Settings → Basic → App Secret
// Also ensure "WhatsApp Business Management" permission is added
// to your app and the Embedded Signup config is published.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// 👇 Adjust this import path to match your project structure
import User from "@/models/User";

const META_API_VERSION = "v19.0"; // Keep in sync with your frontend FB.init version

interface EmbeddedSignupResponse {
  success: boolean;
  message: string;
  data?: {
    name: string;
    phoneNumberId: string;
    displayPhone: string;
    isActive: boolean;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse<EmbeddedSignupResponse>> {
  try {
    // ─── 1. AUTHENTICATION CHECK ──────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // ─── 2. PARSE & VALIDATE REQUEST BODY ─────────────────────────
    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { success: false, message: "No authorization code received from Meta." },
        { status: 400 }
      );
    }

    // ─── 3. VERIFY META CREDENTIALS ───────────────────────────────
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      console.error("[Embedded Signup] META_APP_ID or META_APP_SECRET is missing from environment variables.");
      return NextResponse.json(
        { success: false, message: "Server is not configured for Meta Embedded Signup. Contact your administrator." },
        { status: 500 }
      );
    }

    // ─── 4. EXCHANGE CODE → SHORT-LIVED ACCESS TOKEN ──────────────
    //    For Embedded Signup, redirect_uri MUST be an empty string.
    //    This is different from standard OAuth where you pass a URL.
    console.log("[Embedded Signup] Step 1: Exchanging authorization code for access token...");

    const tokenExchangeUrl = new URL(
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
    );
    tokenExchangeUrl.searchParams.set("client_id", appId);
    tokenExchangeUrl.searchParams.set("redirect_uri", "");
    tokenExchangeUrl.searchParams.set("client_secret", appSecret);
    tokenExchangeUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenExchangeUrl.toString(), { method: "GET" });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[Embedded Signup] Token exchange failed:", JSON.stringify(tokenData, null, 2));
      const errorMsg = tokenData.error?.message || "Failed to exchange the authorization code. Please try again.";
      return NextResponse.json({ success: false, message: errorMsg }, { status: 400 });
    }

    let accessToken: string = tokenData.access_token;
    console.log("[Embedded Signup] ✓ Short-lived token obtained");

    // ─── 5. EXCHANGE SHORT-LIVED → LONG-LIVED TOKEN ───────────────
    //    Short-lived tokens expire in ~1 hour. Long-lived tokens
    //    last ~60 days. This is critical for persistent access.
    console.log("[Embedded Signup] Step 2: Exchanging for long-lived token...");

    try {
      const longLivedUrl = new URL(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`
      );
      longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
      longLivedUrl.searchParams.set("client_id", appId);
      longLivedUrl.searchParams.set("client_secret", appSecret);
      longLivedUrl.searchParams.set("fb_exchange_token", accessToken);

      const llRes = await fetch(longLivedUrl.toString());
      const llData = await llRes.json();

      if (llData.access_token) {
        accessToken = llData.access_token;
        console.log("[Embedded Signup] ✓ Long-lived token obtained");
      } else {
        console.warn("[Embedded Signup] Long-lived token exchange returned no token, keeping short-lived one.");
      }
    } catch (llError) {
      console.warn("[Embedded Signup] Long-lived token exchange failed:", llError);
      // Non-fatal — we continue with the short-lived token
    }

    // ─── 6. FETCH WHATSAPP BUSINESS ACCOUNTS ──────────────────────
    //    The token grants access to WABAs the user selected during
    //    the embedded signup flow.
    console.log("[Embedded Signup] Step 3: Fetching WhatsApp Business Accounts...");

    const wabaRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/whatsapp_business_accounts?access_token=${accessToken}`,
      { method: "GET" }
    );
    const wabaData = await wabaRes.json();

    if (!wabaData.data || wabaData.data.length === 0) {
      console.error("[Embedded Signup] No WhatsApp Business Accounts found:", JSON.stringify(wabaData, null, 2));
      return NextResponse.json(
        {
          success: false,
          message:
            "No WhatsApp Business Account was linked. During the Meta popup, make sure you select a WhatsApp Business Account. Create one at business.facebook.com if needed.",
        },
        { status: 400 }
      );
    }

    // Use the first WABA (embedded signup typically links exactly one)
    const waba = wabaData.data[0];
    const wabaId: string = waba.id;
    console.log(`[Embedded Signup] ✓ WABA found: ${wabaId}`);

    // ─── 7. FETCH PHONE NUMBERS FROM THE WABA ─────────────────────
    console.log("[Embedded Signup] Step 4: Fetching phone numbers...");

    const phonesRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`,
      { method: "GET" }
    );
    const phonesData = await phonesRes.json();

    if (!phonesData.data || phonesData.data.length === 0) {
      console.error(`[Embedded Signup] No phone numbers in WABA ${wabaId}:`, JSON.stringify(phonesData, null, 2));
      return NextResponse.json(
        {
          success: false,
          message:
            "The selected WhatsApp Business Account has no phone numbers. Add a phone number in Meta Business Manager → WhatsApp Accounts first.",
        },
        { status: 400 }
      );
    }

    // Prefer a verified phone number; fall back to the first one
    const selectedPhone =
      phonesData.data.find((p: Record<string, any>) => p.verified_name) || phonesData.data[0];

    const phoneNumberId: string = selectedPhone.id;
    const displayPhone: string = selectedPhone.display_phone_number || selectedPhone.phone_number || "Unknown Number";
    const verifiedName: string = selectedPhone.verified_name || "";
    const phoneStatus: string = selectedPhone.status || "UNKNOWN";

    console.log(
      `[Embedded Signup] ✓ Phone found: ${displayPhone} (ID: ${phoneNumberId}, Status: ${phoneStatus})`
    );

    // ─── 8. LOOK UP THE USER IN DATABASE ──────────────────────────
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Your account was not found in the database." },
        { status: 404 }
      );
    }

    // ─── 9. DUPLICATE CHECK ───────────────────────────────────────
    const existingNumbers: any[] = Array.isArray(user.whatsappNumbers) ? user.whatsappNumbers : [];

    const duplicate = existingNumbers.find(
      (n: any) => n.whatsappPhoneNumberId === phoneNumberId
    );
    if (duplicate) {
      return NextResponse.json(
        {
          success: false,
          message: `The number ${displayPhone} is already connected to your account.`,
        },
        { status: 409 } // Conflict
      );
    }

    // ─── 10. BUILD & SAVE THE NEW NUMBER ──────────────────────────
    const isFirstNumber = existingNumbers.length === 0;

    const newNumber: Record<string, any> = {
      name: verifiedName || `WhatsApp ${displayPhone}`,
      wabaId: wabaId,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappAccessToken: accessToken,
      displayPhoneNumber: displayPhone,
      verifiedName: verifiedName,
      phoneStatus: phoneStatus,
      isActive: isFirstNumber, // Auto-activate only if it's the very first number
      addedAt: new Date(),
      source: "embedded_signup",
    };

    user.whatsappNumbers.push(newNumber);
    await user.save();

    console.log(
      `[Embedded Signup] ✓ Saved number "${newNumber.name}" for user ${session.user.email}` +
        (isFirstNumber ? " (auto-activated as first number)" : "")
    );

    // ─── 11. RETURN SUCCESS ───────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: `WhatsApp number ${displayPhone} connected successfully!` +
        (isFirstNumber ? " It has been set as your active number." : ""),
      data: {
        name: newNumber.name,
        phoneNumberId,
        displayPhone,
        isActive: newNumber.isActive,
      },
    });
  } catch (error: any) {
    console.error("[Embedded Signup] UNEXPECTED ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "An unexpected error occurred during the signup process.",
      },
      { status: 500 }
    );
  }
}
