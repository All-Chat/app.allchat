// app/api/settings/embedded-signup/route.ts

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
      console.error("[Embedded Signup] META_APP_ID or META_APP_SECRET missing from .env.local");
      return NextResponse.json(
        { success: false, message: "Meta credentials not configured on server." },
        { status: 500 }
      );
    }

    // ─── STEP 1: Exchange code for short-lived token ──────────────
    console.log("[Embedded Signup] Step 1: Exchanging code for token...");

    const tokenUrl =
      `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token` +
      `?client_id=${appId}` +
      `&redirect_uri=` +
      `&client_secret=${appSecret}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl, { method: "GET" });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[Embedded Signup] Token exchange failed:", JSON.stringify(tokenData));
      return NextResponse.json(
        { success: false, message: tokenData.error?.message || "Failed to exchange authorization code." },
        { status: 400 }
      );
    }

    let accessToken: string = tokenData.access_token;
    console.log("[Embedded Signup] ✓ Short-lived token obtained");

    // ─── STEP 2: Upgrade to long-lived token (~60 days) ──────────
    console.log("[Embedded Signup] Step 2: Upgrading to long-lived token...");

    try {
      const llUrl =
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${accessToken}`;

      const llRes = await fetch(llUrl);
      const llData = await llRes.json();
      if (llData.access_token) {
        accessToken = llData.access_token;
        console.log("[Embedded Signup] ✓ Long-lived token obtained");
      }
    } catch (e) {
      console.warn("[Embedded Signup] Long-lived upgrade skipped:", e);
    }

    // ─── STEP 3: Get WhatsApp Business Accounts ───────────────────
    console.log("[Embedded Signup] Step 3: Fetching WABAs...");

    const wabaRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me/whatsapp_business_accounts?access_token=${accessToken}`
    );
    const wabaData = await wabaRes.json();

    if (!wabaData.data || wabaData.data.length === 0) {
      console.error("[Embedded Signup] No WABA found:", JSON.stringify(wabaData));
      return NextResponse.json(
        {
          success: false,
          message: "No WhatsApp Business Account linked. During the Meta popup, select a WhatsApp Business Account.",
        },
        { status: 400 }
      );
    }

    const wabaId: string = wabaData.data[0].id;
    console.log("[Embedded Signup] ✓ WABA:", wabaId);

    // ─── STEP 4: Get phone numbers from WABA ──────────────────────
    console.log("[Embedded Signup] Step 4: Fetching phone numbers...");

    const phonesRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`
    );
    const phonesData = await phonesRes.json();

    if (!phonesData.data || phonesData.data.length === 0) {
      console.error("[Embedded Signup] No phones:", JSON.stringify(phonesData));
      return NextResponse.json(
        {
          success: false,
          message: "No phone numbers in this WABA. Add a number in Meta Business Manager first.",
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

    // Also set top-level fields so existing code keeps working
    if (isFirstNumber) {
      user.wabaId = wabaId;
      user.whatsappPhoneNumberId = phoneNumberId;
      user.whatsappAccessToken = accessToken;
    }

    await user.save();

    console.log(
      `[Embedded Signup] ✓ Saved "${newNumber.name}" for user ${session.user.id}` +
        (isFirstNumber ? " (auto-activated)" : "")
    );

    return NextResponse.json({
      success: true,
      message:
        `WhatsApp number ${displayPhone} connected successfully!` +
        (isFirstNumber ? " Set as active number." : ""),
    });
  } catch (error: any) {
    console.error("[Embedded Signup] ERROR:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Unexpected error occurred." },
      { status: 500 }
    );
  }
}
