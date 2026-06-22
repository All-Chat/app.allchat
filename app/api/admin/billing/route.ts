/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

function validateAdminKey(req: Request): boolean {
  return req.headers.get("x-admin-key") === ADMIN_SECRET;
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
    case "day": { const reset = new Date(now); reset.setHours(24, 0, 0, 0); return reset; }
    case "month": { const reset = new Date(now); reset.setMonth(reset.getMonth() + 1, 1); reset.setHours(0, 0, 0, 0); return reset; }
    case "year": { const reset = new Date(now); reset.setFullYear(reset.getFullYear() + 1, 0, 1); reset.setHours(0, 0, 0, 0); return reset; }
    default: return null;
  }
}

const LIMIT_RESOURCES = ["tags", "workflows", "templates", "testMessages", "campaigns", "optNumbers", "forms", "whatsappNumbers"];

const DEFAULT_LIMITS: Record<string, { max: number; period: string }> = {
  tags: { max: -1, period: "unlimited" }, workflows: { max: -1, period: "unlimited" },
  templates: { max: -1, period: "unlimited" }, testMessages: { max: -1, period: "unlimited" },
  campaigns: { max: -1, period: "unlimited" }, optNumbers: { max: -1, period: "unlimited" },
  forms: { max: -1, period: "unlimited" }, whatsappNumbers: { max: -1, period: "unlimited" },
};

const DEFAULT_USAGE: Record<string, { count: number; resetAt: null }> = {
  tags: { count: 0, resetAt: null }, workflows: { count: 0, resetAt: null },
  templates: { count: 0, resetAt: null }, testMessages: { count: 0, resetAt: null },
  campaigns: { count: 0, resetAt: null }, optNumbers: { count: 0, resetAt: null },
  forms: { count: 0, resetAt: null }, whatsappNumbers: { count: 0, resetAt: null },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { password, action } = body;

    if (action === "createUser") {
      if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });

      await connectDB();
      const { name, password: userPassword } = body;

      if (!name || !userPassword) return NextResponse.json({ message: "Username and password are required" }, { status: 400 });

      const existing = await User.findOne({ name });
      if (existing) return NextResponse.json({ message: "Username already exists" }, { status: 400 });

      const newUser = await User.create({ name, password: userPassword });
      return NextResponse.json({ success: true, message: "User created successfully", user: { _id: newUser._id.toString(), name: newUser.name } });
    }

    if (password === ADMIN_SECRET) return NextResponse.json({ success: true, message: "Admin verified" });
    return NextResponse.json({ success: false, message: "Invalid admin key" }, { status: 403 });
  } catch (error) {
    console.error("Error in admin POST:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });

    await connectDB();
    await User.updateMany(
      { accountStatus: "active", planExpiry: { $ne: null, $lt: new Date() } },
      { accountStatus: "expired" }
    );

    const users = await User.find({}).select("+password +whatsappAccessToken").sort({ createdAt: -1 }).lean();

    const tenantBalances: Record<string, { balance: number; totalRecharged: number }> = {};
    for (const u of users) {
      if (u.isTenant && u.tenantId) {
        tenantBalances[u.tenantId] = { balance: u.balance || 0, totalRecharged: u.totalRecharged || 0 };
      }
    }

    const mappedUsers = [];
    for (const u of users) {
      const userLimits = (u as any).limits || {};
      const userUsage = (u as any).usage || {};
      const limits: Record<string, any> = {};
      const usage: Record<string, any> = {};
      for (const resource of LIMIT_RESOURCES) {
        limits[resource] = userLimits[resource] || DEFAULT_LIMITS[resource];
        usage[resource] = userUsage[resource] || DEFAULT_USAGE[resource];
      }

      let subUsersList: { id: string; name: string }[] = [];
      if (u.isTenant && u.tenantId) {
        const subs = await User.find({ parentTenantId: u.tenantId }).select("name").lean();
        subUsersList = subs.map(s => ({ id: s._id.toString(), name: s.name }));
      }

      const isSubUser = !!u.parentTenantId;
      const parentTenantId = (u as any).parentTenantId;
      const sharedWallet = isSubUser && parentTenantId ? tenantBalances[parentTenantId] : null;

      mappedUsers.push({
        _id: (u as any)._id.toString(),
        name: (u as any).name,
        wabaId: (u as any).wabaId || "",
        whatsappPhoneNumberId: (u as any).whatsappPhoneNumberId || "",
        password: (u as any).password || "",
        whatsappAccessToken: (u as any).whatsappAccessToken || "",
        hasRealToken: !!(u as any).whatsappAccessToken,
        balance: sharedWallet ? sharedWallet.balance : ((u as any).balance || 0),
        totalRecharged: sharedWallet ? sharedWallet.totalRecharged : ((u as any).totalRecharged || 0),
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
        limits, usage,
        isTenant: (u as any).isTenant || false,
        tenantId: (u as any).tenantId || null,
        parentTenantId: (u as any).parentTenantId || null,
        maxSubUsers: (u as any).maxSubUsers || 0,
        subUsersList, 
        googleSheetId: (u as any).googleSheetId || null,
        hideIntegrations: (u as any).hideIntegrations || false,
        maxEnabledCountries: (u as any).maxEnabledCountries || 0,
        enabledCountries: (u as any).enabledCountries || [],
      });
    }

    return NextResponse.json({ success: true, users: mappedUsers });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });
    await connectDB();

    const body = await req.json();
    const { userId, action } = body;

    if (!userId) return NextResponse.json({ message: "User ID is required" }, { status: 400 });

    // Fetch the user first so we can use .save() which prevents silent Mongoose failures
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    // ==========================================
    // HANDLE INTEGRATIONS & DISCONNECT
    // ==========================================
    if (action === "integrations" || body.hideIntegrations !== undefined) {
      user.hideIntegrations = body.hideIntegrations;
    }

    if (action === "disconnectGoogle" || body.disconnectGoogle === true) {
      user.googleSheetId = undefined;
      user.googleTokens = undefined;
    }

    // ==========================================
    // HANDLE TENANCY
    // ==========================================
    if (body.isTenant !== undefined) {
      user.isTenant = body.isTenant;
      if (body.isTenant && !user.tenantId) user.tenantId = new mongoose.Types.ObjectId().toString();
    }
    if (body.maxSubUsers !== undefined) user.maxSubUsers = Number(body.maxSubUsers) || 0;

    // ==========================================
    // HANDLE BILLING (INCLUDING COUNTRIES)
    // ==========================================
    if (action === "billing") {
      if (body.priceMarketing !== undefined && body.priceMarketing !== null) user.priceMarketing = Math.round(Number(body.priceMarketing) * 100) / 100;
      if (body.priceUtility !== undefined && body.priceUtility !== null) user.priceUtility = Math.round(Number(body.priceUtility) * 100) / 100;
      if (body.priceAuthentication !== undefined && body.priceAuthentication !== null) user.priceAuthentication = Math.round(Number(body.priceAuthentication) * 100) / 100;
      if (body.pricePerMessage !== undefined && body.pricePerMessage !== null) user.pricePerMessage = Math.round(Number(body.pricePerMessage) * 100) / 100;
      
      if (body.rechargeAmount !== undefined && body.rechargeAmount !== null && Number(body.rechargeAmount) > 0) {
        user.balance = Math.round(((user.balance || 0) + Number(body.rechargeAmount)) * 100) / 100;
        user.totalRecharged = Math.round(((user.totalRecharged || 0) + Number(body.rechargeAmount)) * 100) / 100;
      }

      // ✅ FIX: Assign array directly and mark as modified so Mongoose saves it
      if (body.maxEnabledCountries !== undefined) {
        user.maxEnabledCountries = Number(body.maxEnabledCountries) || 0;
      }
      if (body.enabledCountries !== undefined && Array.isArray(body.enabledCountries)) {
        user.enabledCountries = body.enabledCountries.map((c: any) => ({
          name: String(c.name || ""),
          code: String(c.code || "").replace(/\D/g, ""),
          priceMarketing: Number(c.priceMarketing) || 0,
          priceUtility: Number(c.priceUtility) || 0,
          priceAuthentication: Number(c.priceAuthentication) || 0
        }));
        // Explicitly mark the array as modified so Mongoose saves it
        user.markModified("enabledCountries");
      }
    }

    // ==========================================
    // HANDLE PLAN
    // ==========================================
    if (body.activatePlan && body.planDuration) {
      user.planDuration = body.planDuration;
      user.planActivatedAt = new Date();
      user.planExpiry = parseDuration(body.planDuration);
      user.accountStatus = "active";
      user.suspendedAt = null;
      user.suspendedReason = null;
    }
    if (body.clearPlan) { 
      user.planDuration = null; 
      user.planActivatedAt = null; 
      user.planExpiry = null; 
      user.accountStatus = "active"; 
    }
    
    // ==========================================
    // HANDLE CREDENTIALS
    // ==========================================
    if (body.name !== undefined && body.name !== null && body.name !== "") user.name = body.name;
    if (body.password !== undefined && body.password !== null && body.password !== "") user.password = body.password;
    if (body.whatsappAccessToken !== undefined && body.whatsappAccessToken !== null && body.whatsappAccessToken !== "") user.whatsappAccessToken = body.whatsappAccessToken;
    if (body.whatsappPhoneNumberId !== undefined) user.whatsappPhoneNumberId = body.whatsappPhoneNumberId?.trim() || null;
    if (body.wabaId !== undefined) user.wabaId = body.wabaId?.trim() || null;

    // ==========================================
    // HANDLE ACCOUNT STATUS
    // ==========================================
    if (body.suspendAccount) { 
      user.accountStatus = "suspended"; 
      user.suspendedAt = new Date(); 
      user.suspendedReason = body.suspendReason || "Suspended by admin"; 
    }
    if (body.reactivateAccount) { 
      user.accountStatus = "active"; 
      user.suspendedAt = null; 
      user.suspendedReason = null; 
    }

    // ==========================================
    // HANDLE LIMITS
    // ==========================================
    if (body.limits && typeof body.limits === "object") {
      const currentLimits = (user as any).limits || {};
      const newLimits: any = {};
      for (const resource of LIMIT_RESOURCES) {
        if (body.limits[resource] !== undefined) {
          const { max, period } = body.limits[resource];
          newLimits[resource] = { 
            max: period === "unlimited" ? -1 : Math.max(0, Number(max) || 0), 
            period: ["day", "month", "year", "total", "unlimited"].includes(period) ? period : "unlimited" 
          };
        } else { 
          newLimits[resource] = currentLimits[resource] || DEFAULT_LIMITS[resource]; 
        }
      }
      user.limits = newLimits;
      user.markModified("limits");
    }

    if (body.resetUsage && typeof body.resetUsage === "object") {
      const currentUsage = (user as any).usage || {};
      const currentLimits = (user as any).limits || {};
      const newUsage: any = {};
      for (const resource of LIMIT_RESOURCES) newUsage[resource] = currentUsage[resource] || DEFAULT_USAGE[resource];
      for (const resource of Object.keys(body.resetUsage)) {
        if (body.resetUsage[resource] && LIMIT_RESOURCES.includes(resource)) {
          newUsage[resource] = { count: 0, resetAt: getNextResetDate(currentLimits[resource]?.period || "unlimited") };
        }
      }
      user.usage = newUsage;
      user.markModified("usage");
    }

    if (body.resetAllUsage) {
      const currentLimits = (user as any).limits || {};
      const newUsage: any = {};
      for (const resource of LIMIT_RESOURCES) newUsage[resource] = { count: 0, resetAt: getNextResetDate(currentLimits[resource]?.period || "unlimited") };
      user.usage = newUsage;
      user.markModified("usage");
    }

    // ✅ SAVE USER (This forces Mongoose to validate and persist everything)
    await user.save();

    return NextResponse.json({ success: true, message: "User updated successfully", user: user.toObject() });
  } catch (error) {
    console.error("Error updating user billing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) return NextResponse.json({ message: "User ID is required" }, { status: 400 });

    await connectDB();
    await User.findByIdAndDelete(userId);
    
    return NextResponse.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
