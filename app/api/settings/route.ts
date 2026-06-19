/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import SettingsRequest from "@/models/SettingsRequest";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // ==========================================
    // 🔴 SHARED WALLET LOGIC
    // ==========================================
    // If the user is a sub-user, fetch the Parent Tenant's balance
    let billingUser = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) {
        billingUser = parent;
      }
    }

    const maskedToken = user.whatsappAccessToken
      ? `${user.whatsappAccessToken.substring(0, 5)}${"*".repeat(15)}${user.whatsappAccessToken.slice(-4)}`
      : "";

    // Fetch the latest settings request for this user to check status
    const latestRequest = await SettingsRequest.findOne({ userId: session.user.id }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      settings: {
        wabaId: user.wabaId || "",
        whatsappPhoneNumberId: user.whatsappPhoneNumberId || "",
        whatsappAccessToken: maskedToken,
        hasRealToken: !!user.whatsappAccessToken,
        // ==========================================
        // BILLING INFO — Synced from Parent Tenant
        // ==========================================
        balance: billingUser.balance || 0,
        totalRecharged: billingUser.totalRecharged || 0,
        // ==========================================
        // PENDING REQUEST INFO
        // ==========================================
        pendingRequest: latestRequest ? {
          status: latestRequest.status,
          createdAt: latestRequest.createdAt
        } : null,
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { wabaId, whatsappPhoneNumberId, whatsappAccessToken } = body;

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Check if there's already a pending request
    const existingPending = await SettingsRequest.findOne({ userId: session.user.id, status: "pending" });
    if (existingPending) {
      return NextResponse.json({ 
        message: "You already have a pending request. Please wait for admin approval before submitting another." 
      }, { status: 400 });
    }

    // Create a new settings request instead of updating directly
    await SettingsRequest.create({
      userId: session.user.id,
      userName: user.name,
      wabaId: wabaId?.trim() || null,
      whatsappPhoneNumberId: whatsappPhoneNumberId?.trim() || null,
      // Only save the token if they actually typed a new one (doesn't contain only stars)
      whatsappAccessToken: whatsappAccessToken && !whatsappAccessToken.includes("*") ? whatsappAccessToken.trim() : null,
    });

    return NextResponse.json({ 
      success: true, 
      message: "Request sent to admin for approval." 
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
