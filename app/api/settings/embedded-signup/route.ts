/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const META_API_VERSION = "v24.0";
const PINBOT_URL = "https://consolev1.pinbot.ai/api/client-embedded-detail-receiver";

async function metaGet(path: string, accessToken: string, fields?: string) {
  const params = new URLSearchParams();
  params.set("access_token", accessToken);
  if (fields) params.set("fields", fields);

  const url = `https://graph.facebook.com/${META_API_VERSION}${path}?${params.toString()}`;
  console.log("[Meta GET]", url.replace(accessToken, "***"));

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Meta GET request failed: ${response.status}`);
  }
  return data;
}

async function sendToPinbot(wabaId: string, businessId: string) {
  const apiKey = process.env.PINBOT_RESELLER_API_KEY;
  if (!apiKey) throw new Error("PINBOT_RESELLER_API_KEY is missing from .env.local");

  const payload = { waba_id: wabaId, mmlite: 1, business_id: businessId };
  console.log("[Pinbot] Sending client embedded details:", payload);

  const response = await fetch(PINBOT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const responseText = await response.text();
  let data: any = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Pinbot API failed with status ${response.status}`);
  }
  return data;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { code, wabaId: frontendWabaId, phoneNumberId: frontendPhoneNumberId, businessId: frontendBusinessId } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ success: false, message: "No authorization code received from Meta." }, { status: 400 });
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json({ success: false, message: "META_APP_ID or META_APP_SECRET is missing." }, { status: 500 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
    }

    // STEP 4: EXCHANGE EMBEDDED SIGNUP CODE
    const tokenParams = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    const tokenResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
      cache: "no-store",
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData?.access_token) {
      return NextResponse.json({ success: false, message: tokenData?.error?.message || "Failed to exchange authorization code." }, { status: 400 });
    }

    let accessToken = tokenData.access_token;

    // STEP 6: OPTIONAL LONG-LIVED TOKEN
    try {
      const longLivedParams = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: accessToken,
      });

      const longLivedResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: longLivedParams.toString(),
        cache: "no-store",
      });

      const longLivedData = await longLivedResponse.json();
      if (longLivedResponse.ok && longLivedData?.access_token) {
        accessToken = longLivedData.access_token;
      }
    } catch (error) {
      console.warn("[Embedded Signup] Long-lived token skipped:", error);
    }

    // STEP 7: RESOLVE WABA ID
    let wabaId = frontendWabaId ? String(frontendWabaId) : null;

    if (!wabaId) {
      try {
        const wabaResponse = await metaGet("/me/whatsapp_business_accounts", accessToken);
        if (wabaResponse?.data?.length) {
          wabaId = String(wabaResponse.data[0].id);
        }
      } catch (error) {
        console.warn("[Embedded Signup] /me/whatsapp_business_accounts failed:", error);
      }
    }

    if (!wabaId) {
      return NextResponse.json({ success: false, message: "Could not determine WABA ID from Embedded Signup." }, { status: 400 });
    }

    // STEP 8: GET BUSINESS PORTFOLIO FROM WABA
    let businessId = frontendBusinessId ? String(frontendBusinessId) : null;
    let businessName = null;

    if (!businessId) {
      try {
        const wabaInfo = await metaGet(`/${wabaId}`, accessToken, "id,name,owner_business_info,business");
        
        if (wabaInfo?.owner_business_info?.id) {
          businessId = String(wabaInfo.owner_business_info.id);
          businessName = wabaInfo.owner_business_info.name || null;
        } else if (wabaInfo?.business?.id) {
          businessId = String(wabaInfo.business.id);
          businessName = wabaInfo.business.name || null;
        }
      } catch (error: any) {
        return NextResponse.json({ success: false, message: "WABA was found, but Meta did not return Business Portfolio info.", wabaId, error: error?.message }, { status: 400 });
      }
    }

    if (!businessId) {
      return NextResponse.json({ success: false, message: "Could not determine Business Portfolio ID.", wabaId }, { status: 400 });
    }

    // STEP 9: RESOLVE PHONE NUMBER
    let phoneNumberId = frontendPhoneNumberId ? String(frontendPhoneNumberId) : null;
    let displayPhone = "Unknown";
    let verifiedName = "";
    let phoneStatus = "UNKNOWN";

    if (phoneNumberId) {
      try {
        const phone = await metaGet(`/${phoneNumberId}`, accessToken, "id,display_phone_number,verified_name,status");
        if (phone?.id) {
          phoneNumberId = String(phone.id);
          displayPhone = phone.display_phone_number || "Unknown";
          verifiedName = phone.verified_name || "";
          phoneStatus = phone.status || "UNKNOWN";
        }
      } catch (error) {
        phoneNumberId = null;
      }
    }

    if (!phoneNumberId) {
      try {
        const phones = await metaGet(`/${wabaId}/phone_numbers`, accessToken, "id,display_phone_number,verified_name,status");
        if (!phones?.data?.length) {
          return NextResponse.json({ success: false, message: "WABA was found, but no phone number was found.", wabaId, businessId }, { status: 400 });
        }
        const selectedPhone = phones.data[0];
        phoneNumberId = String(selectedPhone.id);
        displayPhone = selectedPhone.display_phone_number || "Unknown";
        verifiedName = selectedPhone.verified_name || "";
        phoneStatus = selectedPhone.status || "UNKNOWN";
      } catch (error: any) {
        return NextResponse.json({ success: false, message: "Could not retrieve phone number from WABA.", wabaId, businessId, error: error?.message }, { status: 400 });
      }
    }

    // STEP 10: CHECK DUPLICATE
    const existingNumbers = Array.isArray(user.whatsappNumbers) ? user.whatsappNumbers : [];
    const duplicate = existingNumbers.some((number: any) => String(number.whatsappPhoneNumberId || "") === String(phoneNumberId));

    if (duplicate) {
      return NextResponse.json({ success: false, message: `Number ${displayPhone} is already connected.`, wabaId, phoneNumberId, businessId }, { status: 409 });
    }

    // STEP 11: CREATE NUMBER RECORD
    const setupStart = new Date();
    const nextSetupAttempt = new Date(Date.now() + 4 * 60 * 1000);
    const isFirstNumber = existingNumbers.length === 0;

    const newNumber: any = {
      name: verifiedName || `WhatsApp ${displayPhone}`,
      wabaId,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappAccessToken: accessToken,
      displayPhoneNumber: displayPhone,
      verifiedName,
      phoneStatus,
      isActive: isFirstNumber,
      source: "embedded_signup",
      addedAt: setupStart,
      businessId,
      setupStatus: "WAITING_CREDIT_LINE",
      creditLineStatus: "PENDING",
      subscriptionStatus: "PENDING",
      registrationStatus: "PENDING",
      pinbotEmbeddedDetailStatus: "PENDING",
      setupStartedAt: setupStart,
      nextSetupAttemptAt: nextSetupAttempt,
    };

    user.whatsappNumbers.push(newNumber);
    if (isFirstNumber) {
      user.wabaId = wabaId;
      user.whatsappPhoneNumberId = phoneNumberId;
      user.whatsappAccessToken = accessToken;
    }

    await user.save();

    // STEP 13: CALL PINBOT
    try {
      const pinbotResponse = await sendToPinbot(wabaId, businessId);
      const savedNumber = user.whatsappNumbers[user.whatsappNumbers.length - 1] as any;
      
      if (savedNumber) {
        savedNumber.pinbotEmbeddedDetailStatus = "SUCCESS";
        savedNumber.pinbotEmbeddedDetailResponse = pinbotResponse;
        savedNumber.pinbotEmbeddedDetailAt = new Date();
        savedNumber.setupStatus = "WAITING_CREDIT_LINE";
      }
      await user.save();

      return NextResponse.json({
        success: true,
        message: `WhatsApp number ${displayPhone} connected successfully.`,
        data: { wabaId, businessId, businessName, phoneNumberId, displayPhone, verifiedName, phoneStatus, setupStatus: "WAITING_CREDIT_LINE", pinbotStatus: "SUCCESS" },
      });
    } catch (pinbotError: any) {
      const savedNumber = user.whatsappNumbers[user.whatsappNumbers.length - 1] as any;
      if (savedNumber) {
        savedNumber.pinbotEmbeddedDetailStatus = "FAILED";
        savedNumber.pinbotEmbeddedDetailError = pinbotError?.message || String(pinbotError);
        savedNumber.pinbotEmbeddedDetailAt = new Date();
        savedNumber.setupStatus = "WAITING_CREDIT_LINE";
      }
      await user.save();

      return NextResponse.json({
        success: true,
        message: `WhatsApp number ${displayPhone} connected, but Pinbot synchronization failed.`,
        data: { wabaId, businessId, phoneNumberId, displayPhone, setupStatus: "WAITING_CREDIT_LINE", pinbotStatus: "FAILED", pinbotError: pinbotError?.message || String(pinbotError) },
      }, { status: 200 });
    }
  } catch (error: any) {
    console.error("[Embedded Signup] FATAL ERROR:", error);
    return NextResponse.json({ success: false, message: error?.message || "Unexpected error occurred." }, { status: 500 });
  }
}
