/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

function validateAdminKey(req: Request): boolean {
  const key = req.headers.get("x-admin-key");
  return key === ADMIN_SECRET;
}

// Helper: parse duration string like "30d", "6m", "1y", "2h", "unlimited"
function parseDuration(duration: string): Date | null {
  if (!duration || duration === "unlimited") return null;

  const match = duration.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case "s": now.setSeconds(now.getSeconds() + value); break;
    case "m": now.setMinutes(now.getMinutes() + value); break;
    case "h": now.setHours(now.getHours() + value); break;
    case "d": now.setDate(now.getDate() + value); break;
    case "w": now.setDate(now.getDate() + value * 7); break;
    case "mo": now.setMonth(now.getMonth() + value); break;
    case "y": now.setFullYear(now.getFullYear() + value); break;
    default: return null;
  }

  return now;
}

// POST: Verify admin key
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { password } = body;
    if (password === ADMIN_SECRET) {
      return NextResponse.json({ success: true, message: "Admin verified" });
    }
    return NextResponse.json({ success: false, message: "Invalid admin key" }, { status: 403 });
  } catch (error) {
    console.error("Error verifying admin:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// GET: Fetch all users with full details
export async function GET(req: Request) {
  try {
    if (!validateAdminKey(req)) {
      return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });
    }

    await connectDB();

    // Auto-expire accounts whose plan has expired
    await User.updateMany(
      { accountStatus: "active", planExpiry: { $ne: null, $lt: new Date() } },
      { accountStatus: "expired" }
    );

    // FETCH PASSWORD AND TOKEN EXPLICITLY using +password +whatsappAccessToken
    const users = await User.find({})
      .select("+password +whatsappAccessToken")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        _id: (u as any)._id.toString(),
        name: (u as any).name,
        wabaId: (u as any).wabaId || "",
        whatsappPhoneNumberId: (u as any).whatsappPhoneNumberId || "",
        password: (u as any).password || "", // NOW RETURNED
        whatsappAccessToken: (u as any).whatsappAccessToken || "", // NOW RETURNED
        hasRealToken: !!(u as any).whatsappAccessToken,
        balance: (u as any).balance || 0,
        totalRecharged: (u as any).totalRecharged || 0,
        pricePerMessage: (u as any).pricePerMessage || 0.90,
        accountStatus: (u as any).accountStatus || "active",
        planExpiry: (u as any).planExpiry,
        planDuration: (u as any).planDuration || "",
        planActivatedAt: (u as any).planActivatedAt,
        suspendedAt: (u as any).suspendedAt,
        suspendedReason: (u as any).suspendedReason || "",
        createdAt: (u as any).createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// PUT: Update user billing, plan, status, or credentials
export async function PUT(req: Request) {
  try {
    if (!validateAdminKey(req)) {
      return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });
    }

    await connectDB();

    const body = await req.json();
    const {
      userId, pricePerMessage, rechargeAmount,
      planDuration, activatePlan, clearPlan,
      suspendAccount, suspendReason,
      reactivateAccount,
      whatsappPhoneNumberId, wabaId,
    } = body;

    if (!userId) {
      return NextResponse.json({ message: "User ID is required" }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const updateData: any = {};

    // Price per message
    if (pricePerMessage !== undefined && pricePerMessage !== null) {
      const price = Number(pricePerMessage);
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ message: "Invalid price per message" }, { status: 400 });
      }
      updateData.pricePerMessage = Math.round(price * 100) / 100;
    }

    // Recharge balance
    if (rechargeAmount !== undefined && rechargeAmount !== null && Number(rechargeAmount) > 0) {
      const recharge = Number(rechargeAmount);
      if (isNaN(recharge) || recharge <= 0) {
        return NextResponse.json({ message: "Recharge amount must be greater than 0" }, { status: 400 });
      }
      updateData.balance = Math.round(((user.balance || 0) + recharge) * 100) / 100;
      updateData.totalRecharged = Math.round(((user.totalRecharged || 0) + recharge) * 100) / 100;
    }

    // Activate plan
    if (activatePlan && planDuration) {
      const expiryDate = parseDuration(planDuration);
      updateData.planDuration = planDuration;
      updateData.planActivatedAt = new Date();
      updateData.planExpiry = expiryDate; // null = unlimited
      updateData.accountStatus = "active";
      updateData.suspendedAt = null;
      updateData.suspendedReason = null;
    }

    // Clear plan
    if (clearPlan) {
      updateData.planDuration = null;
      updateData.planActivatedAt = null;
      updateData.planExpiry = null;
      updateData.accountStatus = "active";
    }

    // Update user credentials
    if (body.name !== undefined && body.name !== null && body.name !== "") {
      updateData.name = body.name;
    }
    if (body.password !== undefined && body.password !== null && body.password !== "") {
      updateData.password = body.password;
    }
    if (body.whatsappAccessToken !== undefined && body.whatsappAccessToken !== null && body.whatsappAccessToken !== "") {
      updateData.whatsappAccessToken = body.whatsappAccessToken;
    }

    // Suspend account
    if (suspendAccount) {
      updateData.accountStatus = "suspended";
      updateData.suspendedAt = new Date();
      updateData.suspendedReason = suspendReason || "Suspended by admin";
    }

    // Reactivate account
    if (reactivateAccount) {
      updateData.accountStatus = "active";
      updateData.suspendedAt = null;
      updateData.suspendedReason = null;
    }

    // Update WhatsApp credentials
    if (whatsappPhoneNumberId !== undefined) {
      updateData.whatsappPhoneNumberId = whatsappPhoneNumberId?.trim() || null;
    }
    if (wabaId !== undefined) {
      updateData.wabaId = wabaId?.trim() || null;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { returnDocument: "after" });

    if (!updatedUser) {
      return NextResponse.json({ message: "Failed to update user" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
      user: {
        _id: (updatedUser as any)._id.toString(),
        name: (updatedUser as any).name,
        balance: (updatedUser as any).balance,
        totalRecharged: (updatedUser as any).totalRecharged,
        pricePerMessage: (updatedUser as any).pricePerMessage,
        accountStatus: (updatedUser as any).accountStatus,
        planExpiry: (updatedUser as any).planExpiry,
        planDuration: (updatedUser as any).planDuration,
        planActivatedAt: (updatedUser as any).planActivatedAt,
        wabaId: (updatedUser as any).wabaId,
        whatsappPhoneNumberId: (updatedUser as any).whatsappPhoneNumberId,
      },
    });
  } catch (error) {
    console.error("Error updating user billing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}