/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

// ---------------------------------------------------------------------------
// TRANSACTION MODEL (local to this route — kept in sync with webhook & history)
// ---------------------------------------------------------------------------
const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  amount: Number,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  metadata: Object
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function validateAdminKey(req: Request): boolean {
  return req.headers.get("x-admin-key") === ADMIN_SECRET;
}

/** Parse duration strings like "1mo", "2w", "30d" into a future Date. */
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

/** Compute the next reset date for periodic usage limits. */
function getNextResetDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "day": { const reset = new Date(now); reset.setHours(24, 0, 0, 0); return reset; }
    case "month": { const reset = new Date(now); reset.setMonth(reset.getMonth() + 1, 1); reset.setHours(0, 0, 0, 0); return reset; }
    case "year": { const reset = new Date(now); reset.setFullYear(reset.getFullYear() + 1, 0, 1); reset.setHours(0, 0, 0, 0); return reset; }
    default: return null;
  }
}

const LIMIT_RESOURCES = ["tags", "workflows", "templates", "testMessages", "campaigns", "optNumbers", "forms", "whatsappNumbers", "aiAgents"];

const DEFAULT_LIMITS: Record<string, { max: number; period: string }> = {
  tags: { max: -1, period: "unlimited" }, workflows: { max: -1, period: "unlimited" },
  templates: { max: -1, period: "unlimited" }, testMessages: { max: -1, period: "unlimited" },
  campaigns: { max: -1, period: "unlimited" }, optNumbers: { max: -1, period: "unlimited" },
  forms: { max: -1, period: "unlimited" }, whatsappNumbers: { max: -1, period: "unlimited" },
  aiAgents: { max: -1, period: "unlimited" },
};

const DEFAULT_USAGE: Record<string, { count: number; resetAt: null }> = {
  tags: { count: 0, resetAt: null }, workflows: { count: 0, resetAt: null },
  templates: { count: 0, resetAt: null }, testMessages: { count: 0, resetAt: null },
  campaigns: { count: 0, resetAt: null }, optNumbers: { count: 0, resetAt: null },
  forms: { count: 0, resetAt: null }, whatsappNumbers: { count: 0, resetAt: null },
  aiAgents: { count: 0, resetAt: null },
};

/**
 * ✅ Helper: safely set a numeric field on a Mongoose document.
 * Always assigns the value and explicitly marks the field as modified so
 * Mongoose persists it even when the previous value was `undefined`.
 */
function setNumberField(doc: any, field: string, value: any): number {
  const n = Math.max(0, Number(value) || 0);
  doc[field] = n;
  doc.markModified(field);
  return n;
}

/**
 * ✅ Helper: safely set a boolean field on a Mongoose document.
 */
function setBooleanField(doc: any, field: string, value: any): boolean {
  const b = Boolean(value);
  doc[field] = b;
  doc.markModified(field);
  return b;
}

// ===========================================================================
// POST — verify admin key OR create a new user
// ===========================================================================
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

// ===========================================================================
// GET — list all users with billing/limits/usage for the admin UI
// ===========================================================================
export async function GET(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });

    await connectDB();
    // Auto-expire any active user whose plan has elapsed
    await User.updateMany(
      { accountStatus: "active", planExpiry: { $ne: null, $lt: new Date() } },
      { accountStatus: "expired" }
    );

    const users = await User.find({}).select("+password +whatsappAccessToken").sort({ createdAt: -1 }).lean();

    // Pre-fetch tenant balances so sub-users can show the shared wallet
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

      // Build sub-user list for tenant accounts
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

        // ✅ Outgoing Message Billing Fields
        outgoingMessageBillingEnabled: (u as any).outgoingMessageBillingEnabled === true,
        pricePerOutgoingMessage: Number((u as any).pricePerOutgoingMessage ?? 0.50),

        // ✅ FREE MESSAGE QUOTA — exposed to admin UI
        // (use Number() to ensure type is number; fall back to 0 if missing)
        freeOutgoingMessages: Number((u as any).freeOutgoingMessages ?? 0),
        outgoingMessagesSent: Number((u as any).outgoingMessagesSent ?? 0),

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
        hiddenSidebarLinks: (u as any).hiddenSidebarLinks || [],
        hiddenReportActions: (u as any).hiddenReportActions || [],
      });
    }

    return NextResponse.json({ success: true, users: mappedUsers });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// ===========================================================================
// PUT — update a user (billing, plan, account, credentials, limits, msgBilling, etc.)
// ===========================================================================
export async function PUT(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized. Invalid admin key." }, { status: 403 });
    await connectDB();

    const body = await req.json();
    const { userId, action } = body;

    if (!userId) return NextResponse.json({ message: "User ID is required" }, { status: 400 });

    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    // Capture original values for diagnostic diff
    const beforeMsgBilling = {
      enabled: user.outgoingMessageBillingEnabled,
      price: user.pricePerOutgoingMessage,
      free: user.freeOutgoingMessages,
      sent: user.outgoingMessagesSent,
    };

    // -------------------- Integrations visibility --------------------
    if (action === "integrations" || body.hideIntegrations !== undefined) {
      user.hideIntegrations = body.hideIntegrations;
      user.markModified("hideIntegrations");
    }

    // -------------------- Sidebar visibility --------------------
    if (action === "sidebar" || body.hiddenSidebarLinks !== undefined) {
      user.hiddenSidebarLinks = body.hiddenSidebarLinks;
      user.markModified("hiddenSidebarLinks");
    }

    // -------------------- Report actions visibility --------------------
    if (action === "reports" || body.hiddenReportActions !== undefined) {
      user.hiddenReportActions = Array.isArray(body.hiddenReportActions) ? body.hiddenReportActions : [];
      user.markModified("hiddenReportActions");
    }

    // -------------------- Message Billing (price + free quota) --------------------
    // ✅ Handles: toggle, price per outgoing message, free message quota
    // ✅ Uses markModified() explicitly to ensure Mongoose persists the changes
    if (action === "msgBilling") {
      // 1. Toggle
      if (body.outgoingMessageBillingEnabled !== undefined) {
        setBooleanField(user, "outgoingMessageBillingEnabled", body.outgoingMessageBillingEnabled);
      }

      // 2. Price per outgoing message
      if (body.pricePerOutgoingMessage !== undefined && body.pricePerOutgoingMessage !== null) {
        const parsedPrice = Math.round(Number(body.pricePerOutgoingMessage) * 100) / 100;
        user.pricePerOutgoingMessage = Math.max(0, parsedPrice || 0);
        user.markModified("pricePerOutgoingMessage");
      }

      // 3. ✅ FREE MESSAGE QUOTA — the key fix
      // We always set the field when the admin submits the form, even if the
      // value is 0 (which disables the free quota). Use markModified() to force
      // Mongoose to persist it even when the previous value was undefined.
      if (body.freeOutgoingMessages !== undefined && body.freeOutgoingMessages !== null && body.freeOutgoingMessages !== "") {
        const newFree = Math.max(0, parseInt(String(body.freeOutgoingMessages)) || 0);
        user.freeOutgoingMessages = newFree;
        user.markModified("freeOutgoingMessages");
        console.log(`[admin/billing PUT] Setting freeOutgoingMessages = ${newFree} for user ${user._id}`);
      }

      // 4. ✅ Optional: admin can manually reset the sent counter
      if (body.resetOutgoingMessagesSent === true) {
        user.outgoingMessagesSent = 0;
        user.markModified("outgoingMessagesSent");
        console.log(`[admin/billing PUT] Reset outgoingMessagesSent to 0 for user ${user._id}`);
      }
    }

    // -------------------- Google disconnect --------------------
    if (action === "disconnectGoogle" || body.disconnectGoogle === true) {
      user.googleSheetId = undefined;
      user.googleTokens = undefined;
      user.markModified("googleSheetId");
      user.markModified("googleTokens");
    }

    // -------------------- Tenancy --------------------
    if (body.isTenant !== undefined) {
      user.isTenant = body.isTenant;
      if (body.isTenant && !user.tenantId) user.tenantId = new mongoose.Types.ObjectId().toString();
      user.markModified("isTenant");
    }
    if (body.maxSubUsers !== undefined) user.maxSubUsers = Number(body.maxSubUsers) || 0;

    let rechargeAppliedAmount = 0;

    // -------------------- Billing (prices + recharge + country pricing) --------------------
    if (action === "billing") {
      if (body.priceMarketing !== undefined && body.priceMarketing !== null) user.priceMarketing = Math.round(Number(body.priceMarketing) * 100) / 100;
      if (body.priceUtility !== undefined && body.priceUtility !== null) user.priceUtility = Math.round(Number(body.priceUtility) * 100) / 100;
      if (body.priceAuthentication !== undefined && body.priceAuthentication !== null) user.priceAuthentication = Math.round(Number(body.priceAuthentication) * 100) / 100;
      if (body.pricePerMessage !== undefined && body.pricePerMessage !== null) user.pricePerMessage = Math.round(Number(body.pricePerMessage) * 100) / 100;

      if (body.rechargeAmount !== undefined && body.rechargeAmount !== null && Number(body.rechargeAmount) > 0) {
        const amount = Math.round(Number(body.rechargeAmount) * 100) / 100;
        user.balance = Math.round(((user.balance || 0) + amount) * 100) / 100;
        user.totalRecharged = Math.round(((user.totalRecharged || 0) + amount) * 100) / 100;
        rechargeAppliedAmount = amount;
      }

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
        user.markModified("enabledCountries");
      }
    }

    // -------------------- Plan activation/clear --------------------
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

    // -------------------- Credentials --------------------
    if (body.name !== undefined && body.name !== null && body.name !== "") user.name = body.name;
    if (body.password !== undefined && body.password !== null && body.password !== "") user.password = body.password;
    if (body.whatsappAccessToken !== undefined && body.whatsappAccessToken !== null && body.whatsappAccessToken !== "") user.whatsappAccessToken = body.whatsappAccessToken;
    if (body.whatsappPhoneNumberId !== undefined) user.whatsappPhoneNumberId = body.whatsappPhoneNumberId?.trim() || null;
    if (body.wabaId !== undefined) user.wabaId = body.wabaId?.trim() || null;

    // -------------------- Account status --------------------
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

    // -------------------- Resource limits --------------------
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

    // -------------------- Reset specific usage --------------------
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

    // -------------------- Reset ALL usage --------------------
    if (body.resetAllUsage) {
      const currentLimits = (user as any).limits || {};
      const newUsage: any = {};
      for (const resource of LIMIT_RESOURCES) newUsage[resource] = { count: 0, resetAt: getNextResetDate(currentLimits[resource]?.period || "unlimited") };
      user.usage = newUsage;
      user.markModified("usage");
    }

    // -------------------- Persist --------------------
    await user.save();

    // ✅ Re-fetch from DB to confirm the values were actually persisted
    const refreshed = await User.findById(userId).select("outgoingMessageBillingEnabled pricePerOutgoingMessage freeOutgoingMessages outgoingMessagesSent").lean();
    const afterMsgBilling = refreshed ? {
      enabled: (refreshed as any).outgoingMessageBillingEnabled,
      price: (refreshed as any).pricePerOutgoingMessage,
      free: (refreshed as any).freeOutgoingMessages,
      sent: (refreshed as any).outgoingMessagesSent,
    } : null;

    console.log(`[admin/billing PUT] action=${action} | before=${JSON.stringify(beforeMsgBilling)} | after=${JSON.stringify(afterMsgBilling)}`);

    // -------------------- Log recharge transaction --------------------
    if (rechargeAppliedAmount > 0) {
      try {
        await Transaction.create({
          userId: user._id,
          type: "recharge",
          amount: rechargeAppliedAmount,
          description: `Wallet recharge by admin`,
          status: "success",
          createdAt: new Date(),
          metadata: { method: "admin", newBalance: user.balance },
        });
      } catch (txErr) {
        console.error("Failed to log recharge transaction:", txErr);
      }
    }

    // ✅ Include the diagnostic diff in the response so the admin page can verify
    return NextResponse.json({
      success: true,
      message: "User updated successfully",
      user: user.toObject(),
      // Diagnostic block — helps confirm the new fields are persisted
      msgBillingDiff: { before: beforeMsgBilling, after: afterMsgBilling }
    });
  } catch (error) {
    console.error("Error updating user billing:", error);
    return NextResponse.json({ message: "Internal server error", error: String(error) }, { status: 500 });
  }
}

// ===========================================================================
// DELETE — remove a user
// ===========================================================================
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
