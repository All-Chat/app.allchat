/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import SettingsRequest from "@/models/SettingsRequest";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit } from "@/lib/limits";
import mongoose from "mongoose";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    let billingUser = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) billingUser = parent;
    }

    const latestRequest = await SettingsRequest.findOne({ userId: session.user.id }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      success: true,
      settings: {
        wabaId: user.wabaId || "",
        whatsappPhoneNumberId: user.whatsappPhoneNumberId || "",
        whatsappAccessToken: user.whatsappAccessToken ? `${user.whatsappAccessToken.substring(0, 5)}${"*".repeat(15)}${user.whatsappAccessToken.slice(-4)}` : "",
        hasRealToken: !!user.whatsappAccessToken,
        whatsappNumbers: user.whatsappNumbers || [],
        balance: billingUser.balance || 0,
        totalRecharged: billingUser.totalRecharged || 0,
        pendingRequest: latestRequest ? { status: latestRequest.status, createdAt: latestRequest.createdAt } : null,
        // ✅ NEW: Return Google Sheet ID so the frontend can show the "Open Sheet" button
        googleSheetId: user.googleSheetId || null,
        // ✅ NEW: Return Hide Integrations flag so frontend can hide the section
        hideIntegrations: user.hideIntegrations || false,
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// POST: Request to ADD a new number
export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, wabaId, whatsappPhoneNumberId, whatsappAccessToken } = body;

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const limitCheck = await checkLimit(session.user.id, "whatsappNumbers");
    if (!limitCheck.allowed) {
      return NextResponse.json({ message: `WhatsApp Number limit reached. You can only add ${limitCheck.limit} numbers.` }, { status: 429 });
    }

    const existingPending = await SettingsRequest.findOne({ userId: session.user.id, status: "pending" });
    if (existingPending) {
      return NextResponse.json({ message: "You already have a pending request. Please wait for admin approval." }, { status: 400 });
    }

    await SettingsRequest.create({
      userId: session.user.id,
      userName: user.name,
      requestType: "add",
      name: name || "New WhatsApp Number",
      wabaId: wabaId?.trim() || null,
      whatsappPhoneNumberId: whatsappPhoneNumberId?.trim() || null,
      whatsappAccessToken: whatsappAccessToken && !whatsappAccessToken.includes("*") ? whatsappAccessToken.trim() : null,
    });

    return NextResponse.json({ success: true, message: "Request to add new number sent to admin for approval." });
  } catch (error) {
    console.error("Error adding number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// PUT: Request to EDIT an existing number
export async function PUT(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { numberId, name, wabaId, whatsappPhoneNumberId, whatsappAccessToken } = body;

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const existingPending = await SettingsRequest.findOne({ userId: session.user.id, status: "pending" });
    if (existingPending) {
      return NextResponse.json({ message: "You already have a pending request. Please wait for admin approval." }, { status: 400 });
    }

    const numberToEdit = user.whatsappNumbers.find((n: any) => n._id.toString() === numberId);
    if (!numberToEdit) return NextResponse.json({ message: "Number not found" }, { status: 404 });

    await SettingsRequest.create({
      userId: session.user.id,
      userName: user.name,
      requestType: "edit", 
      numberId: new mongoose.Types.ObjectId(numberId), 
      name: name || "WhatsApp Number",
      wabaId: wabaId?.trim() || null,
      whatsappPhoneNumberId: whatsappPhoneNumberId?.trim() || null,
      whatsappAccessToken: whatsappAccessToken && !whatsappAccessToken.includes("*") ? whatsappAccessToken.trim() : null,
    });

    return NextResponse.json({ success: true, message: "Request to edit number sent to admin for approval." });
  } catch (error) {
    console.error("Error editing number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Switch Active Number
export async function PATCH(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { numberId } = await req.json();
    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const selectedNumber = user.whatsappNumbers.find((n: any) => n._id.toString() === numberId);
    if (!selectedNumber) return NextResponse.json({ message: "Number not found" }, { status: 404 });

    user.whatsappNumbers.forEach((n: any) => n.isActive = false);
    selectedNumber.isActive = true;

    user.wabaId = selectedNumber.wabaId;
    user.whatsappPhoneNumberId = selectedNumber.whatsappPhoneNumberId;
    user.whatsappAccessToken = selectedNumber.whatsappAccessToken;

    await user.save();
    return NextResponse.json({ success: true, message: `Switched active number to ${selectedNumber.name}` });
  } catch (error) {
    console.error("Error switching number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Remove a WhatsApp Number
export async function DELETE(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const numberId = searchParams.get("numberId");

    if (!numberId) return NextResponse.json({ message: "Number ID is required" }, { status: 400 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const numberToDelete = user.whatsappNumbers.find((n: any) => n._id.toString() === numberId);
    if (!numberToDelete) return NextResponse.json({ message: "Number not found" }, { status: 404 });

    const wasActive = numberToDelete.isActive;
    // Filter out the deleted number. Cast to any to satisfy TS typing for Mongoose DocumentArray.
    user.whatsappNumbers = user.whatsappNumbers.filter((n: any) => n._id.toString() !== numberId) as any;

    if (wasActive) {
      if (user.whatsappNumbers.length > 0) {
        user.whatsappNumbers[0].isActive = true;
        user.wabaId = user.whatsappNumbers[0].wabaId;
        user.whatsappPhoneNumberId = user.whatsappNumbers[0].whatsappPhoneNumberId;
        user.whatsappAccessToken = user.whatsappNumbers[0].whatsappAccessToken;
      } else {
        user.wabaId = null;
        user.whatsappPhoneNumberId = null;
        user.whatsappAccessToken = null;
      }
    }

    await user.save();
    return NextResponse.json({ success: true, message: "Number deleted successfully" });
  } catch (error) {
    console.error("Error deleting number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
