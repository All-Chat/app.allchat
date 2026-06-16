/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Log in first" }, { status: 401 });

    const user = await User.findById(userId).lean();
    const token = user?.whatsappAccessToken || "";
    const wabaId = user?.wabaId || "";
    const phoneId = user?.whatsappPhoneNumberId || "";

    if (!token) return NextResponse.json({ error: "No token in DB" }, { status: 400 });

    // ==========================================
    // 1. Show EXACTLY what token the app is using
    // ==========================================
    const tokenPrefix = token.substring(0, 20);
    const tokenLength = token.length;

    // ==========================================
    // 2. Debug the token
    // ==========================================
    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${token}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const debugData = await debugRes.json();

    const issuedAt = debugData?.data?.issued_at;
    const expiresAt = debugData?.data?.expires_at;
    const tokenType = debugData?.data?.type;
    const appId = debugData?.data?.app_id;
    const scopes = debugData?.data?.scopes || [];
    const granularScopes = debugData?.data?.granular_scopes || [];

    // Find management scope
    const mgmtScope = granularScopes.find((g: any) => g.scope === "whatsapp_business_management");
    const msgScope = granularScopes.find((g: any) => g.scope === "whatsapp_business_messaging");

    // ==========================================
    // 3. Test upload
    // ==========================================
    const uploadRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/uploads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_length: 1, file_type: "image/jpeg" }),
      }
    );
    const uploadData = await uploadRes.json();

    // ==========================================
    // 4. RESULT
    // ==========================================
    return NextResponse.json({
      // What token is the app using?
      tokenInfo: {
        prefix: tokenPrefix + "...",
        length: tokenLength,
        type: tokenType,
        appId: appId,
        issuedAt: issuedAt ? new Date(issuedAt * 1000).toISOString() : null,
        issuedTimestamp: issuedAt,
        expiresAt: expiresAt ? new Date(expiresAt * 1000).toISOString() : "Never (System User)",
        isSystemUser: tokenType === "SYSTEM_USER",
      },

      // Permissions
      permissions: {
        scopes: scopes,
        management: {
          exists: scopes.includes("whatsapp_business_management"),
          targetIds: mgmtScope?.target_ids || "MISSING ❌",
        },
        messaging: {
          exists: scopes.includes("whatsapp_business_messaging"),
          targetIds: msgScope?.target_ids || "MISSING ❌",
        },
      },

      // Upload test
      uploadTest: {
        works: uploadRes.ok,
        status: uploadRes.status,
        response: uploadData,
      },

      // Diagnosis
      diagnosis: uploadRes.ok
        ? "✅ UPLOAD WORKS! Media templates will work."
        : mgmtScope?.target_ids
          ? "⚠️ Has target_ids but upload fails. Try waiting 5 mins or regenerating token."
          : "❌ target_ids is MISSING. The token was generated BEFORE assigning the WABA account, or the assignment didn't save properly.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}