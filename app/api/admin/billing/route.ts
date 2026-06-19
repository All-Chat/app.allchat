/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

function validateAdminKey(req: Request): boolean {
  const key = req.headers.get("x-admin-key");
  return key === ADMIN_SECRET;
}

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

function getNextResetDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "day": {
      const reset = new Date(now);
      reset.setHours(24, 0, 0, 0);
      return reset;
    }
    case "month": {
      const reset = new Date(now);
      reset.setMonth(reset.getMonth() + 1, 1);
      reset.setHours(0, 0, 0, 0);
      return reset;
    }
    case "year": {
      const reset = new Date(now);
      reset.setFullYear(reset.getFullYear() + 1, 0, 1);
      reset.setHours(0, 0, 0, 0);
      return reset;
    }
    default:
      return null;
  }
}

const LIMIT_RESOURCES = ["tags", "workflows", "templates", "testMessages", "campaigns", "optNumbers", "forms"];

const DEFAULT_LIMITS: Record<string, { max: number; period: string }> = {
  tags: { max: -1, period: "unlimited" },
  workflows: { max: -1, period: "unlimited" },
  templates: { max: -1, period: "unlimited" },
  testMessages: { max: -1, period: "unlimited" },
  campaigns: { max: -1, period: "unlimited" },
  optNumbers: { max: -1, period: "unlimited" },
  forms: { max: -1, period: "unlimited" },
};

const DEFAULT_USAGE: Record<string, { count: number; resetAt: null }> = {
  tags: { count: 0, resetAt: null },
  workflows: { count: 0, resetAt: null },
  templates: { count: 0, resetAt: null },
  testMessages: { count: 0, resetAt: null },
  campaigns: { count: 0, resetAt: null },
  optNumbers: { count: 0, resetAt: null },
  forms: { count: 0, resetAt: null },
};

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

    await User.updateMany(
      { accountStatus: "active", planExpiry: { $ne: null, $lt: new Date() } },
      { accountStatus: "expired" }
    );

    const users = await User.find({})
      .select("+password +whatsappAccessToken")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      users: users.map((u) => {
        const userLimits = (u as any).limits || {};
        const userUsage = (u as any).usage || {};

        const limits: Record<string, any> = {};
        const usage: Record<string, any> = {};
        for (const resource of LIMIT_RESOURCES) {
          limits[resource] = userLimits[resource] || DEFAULT_LIMITS[resource];
          usage[resource] = userUsage[resource] || DEFAULT_USAGE[resource];
        }

        return {
          _id: (u as any)._id.toString(),
          name: (u as any).name,
          wabaId: (u as any).wabaId || "",
          whatsappPhoneNumberId: (u as any).whatsappPhoneNumberId || "",
          password: (u as any).password || "",
          whatsappAccessToken: (u as any).whatsappAccessToken || "",
          hasRealToken: !!(u as any).whatsappAccessToken,
          balance: (u as any).balance || 0,
          totalRecharged: (u as any).totalRecharged || 0,
          pricePerMessage: (u as any).pricePerMessage || 0.90,
          priceMarketing: (u as any).priceMarketing ?? (u as any).pricePerMessage ?? 0.90,
          priceUtility: (u as any).priceUtility ?? 0.50,
          priceAuthentication: (u as any).priceAuthentication ?? 0.30,
          accountStatus: (u as any).accountStatus || "active",
          planExpiry: (u as any).planExpiry,
          planDuration: (u as any).planDuration || "",
          planActivatedAt: (u as any).planActivatedAt,
          suspendedAt: (u as any).suspendedAt,
          suspendedReason: (u as any).suspendedReason || "",
          createdAt: (u as any).createdAt,
          limits,
          usage,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// PUT: Update user billing, plan, status, credentials, or limits
export async function PUT(req: Request) {
  try {
    if (!validateAdminKey(req)) {
      return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });
    }

    await connectDB();

    const body = await req.json();
    const {
      userId,
      priceMarketing, priceUtility, priceAuthentication,
      pricePerMessage,
      rechargeAmount,
      planDuration, activatePlan, clearPlan,
      suspendAccount, suspendReason,
      reactivateAccount,
      whatsappPhoneNumberId, wabaId,
      limits,
      resetUsage,
      resetAllUsage,
    } = body;

    if (!userId) {
      return NextResponse.json({ message: "User ID is required" }, { status: 400 });
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const updateData: any = {};

    // ===== Category-based prices =====
    if (priceMarketing !== undefined && priceMarketing !== null) {
      const price = Number(priceMarketing);
      if (isNaN(price) || price < 0) return NextResponse.json({ message: "Invalid marketing price" }, { status: 400 });
      updateData.priceMarketing = Math.round(price * 100) / 100;
    }
    if (priceUtility !== undefined && priceUtility !== null) {
      const price = Number(priceUtility);
      if (isNaN(price) || price < 0) return NextResponse.json({ message: "Invalid utility price" }, { status: 400 });
      updateData.priceUtility = Math.round(price * 100) / 100;
    }
    if (priceAuthentication !== undefined && priceAuthentication !== null) {
      const price = Number(priceAuthentication);
      if (isNaN(price) || price < 0) return NextResponse.json({ message: "Invalid authentication price" }, { status: 400 });
      updateData.priceAuthentication = Math.round(price * 100) / 100;
    }

    // Legacy price
    if (pricePerMessage !== undefined && pricePerMessage !== null) {
      const price = Number(pricePerMessage);
      if (isNaN(price) || price < 0) return NextResponse.json({ message: "Invalid price per message" }, { status: 400 });
      updateData.pricePerMessage = Math.round(price * 100) / 100;
    }

    // Recharge balance
    if (rechargeAmount !== undefined && rechargeAmount !== null && Number(rechargeAmount) > 0) {
      const recharge = Number(rechargeAmount);
      if (isNaN(recharge) || recharge <= 0) return NextResponse.json({ message: "Recharge amount must be greater than 0" }, { status: 400 });
      updateData.balance = Math.round(((user.balance || 0) + recharge) * 100) / 100;
      updateData.totalRecharged = Math.round(((user.totalRecharged || 0) + recharge) * 100) / 100;
    }

    // Activate plan
    if (activatePlan && planDuration) {
      const expiryDate = parseDuration(planDuration);
      updateData.planDuration = planDuration;
      updateData.planActivatedAt = new Date();
      updateData.planExpiry = expiryDate;
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
    if (body.name !== undefined && body.name !== null && body.name !== "") updateData.name = body.name;
    if (body.password !== undefined && body.password !== null && body.password !== "") updateData.password = body.password;
    if (body.whatsappAccessToken !== undefined && body.whatsappAccessToken !== null && body.whatsappAccessToken !== "") updateData.whatsappAccessToken = body.whatsappAccessToken;

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
    if (whatsappPhoneNumberId !== undefined) updateData.whatsappPhoneNumberId = whatsappPhoneNumberId?.trim() || null;
    if (wabaId !== undefined) updateData.wabaId = wabaId?.trim() || null;

    // ===== LIMITS UPDATE =====
    if (limits && typeof limits === "object") {
      const currentLimits = (user as any).limits || {};
      const newLimits: any = {};

      for (const resource of LIMIT_RESOURCES) {
        if (limits[resource] !== undefined) {
          const { max, period } = limits[resource];
          newLimits[resource] = {
            max: period === "unlimited" ? -1 : Math.max(0, Number(max) || 0),
            period: ["day", "month", "year", "total", "unlimited"].includes(period) ? period : "unlimited",
          };
        } else {
          newLimits[resource] = currentLimits[resource] || DEFAULT_LIMITS[resource];
        }
      }

      updateData.limits = newLimits;
    }

    // ===== RESET SPECIFIC USAGE =====
    if (resetUsage && typeof resetUsage === "object") {
      const currentUsage = (user as any).usage || {};
      const currentLimits = (user as any).limits || {};
      const newUsage: any = {};

      // Preserve existing usage for resources not being reset
      for (const resource of LIMIT_RESOURCES) {
        newUsage[resource] = currentUsage[resource] || DEFAULT_USAGE[resource];
      }

      for (const resource of Object.keys(resetUsage)) {
        if (resetUsage[resource] && LIMIT_RESOURCES.includes(resource)) {
          newUsage[resource] = {
            count: 0,
            resetAt: getNextResetDate(currentLimits[resource]?.period || "unlimited"),
          };
        }
      }

      updateData.usage = newUsage;
    }

    // ===== RESET ALL USAGE =====
    if (resetAllUsage) {
      const currentLimits = (user as any).limits || {};
      const newUsage: any = {};

      for (const resource of LIMIT_RESOURCES) {
        newUsage[resource] = {
          count: 0,
          resetAt: getNextResetDate(currentLimits[resource]?.period || "unlimited"),
        };
      }

      updateData.usage = newUsage;
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
        priceMarketing: (updatedUser as any).priceMarketing,
        priceUtility: (updatedUser as any).priceUtility,
        priceAuthentication: (updatedUser as any).priceAuthentication,
        accountStatus: (updatedUser as any).accountStatus,
        planExpiry: (updatedUser as any).planExpiry,
        planDuration: (updatedUser as any).planDuration,
        planActivatedAt: (updatedUser as any).planActivatedAt,
        wabaId: (updatedUser as any).wabaId,
        whatsappPhoneNumberId: (updatedUser as any).whatsappPhoneNumberId,
        limits: (updatedUser as any).limits,
        usage: (updatedUser as any).usage,
      },
    });
  } catch (error) {
    console.error("Error updating user billing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
