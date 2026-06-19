/* eslint-disable @typescript-eslint/no-explicit-any */
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const LIMIT_RESOURCES = ["tags", "workflows", "templates", "testMessages", "campaigns", "optNumbers", "forms"] as const;
export type LimitResource = (typeof LIMIT_RESOURCES)[number];

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

export interface LimitCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  period: string;
  currentUsage: number;
  message?: string;
}

/**
 * Check if a user is allowed to perform an action for a given resource.
 * Automatically resets time-based counters if the period has expired.
 */
export async function checkLimit(userId: string, resource: LimitResource): Promise<LimitCheckResult> {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      period: "unlimited",
      currentUsage: 0,
      message: "User not found",
    };
  }

  const limit = (user as any).limits?.[resource] || { max: -1, period: "unlimited" };
  const usage = (user as any).usage?.[resource] || { count: 0, resetAt: null };

  // Unlimited = always allowed
  if (limit.period === "unlimited" || limit.max === -1) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: -1,
      period: "unlimited",
      currentUsage: usage.count || 0,
    };
  }

  // Auto-reset time-based counters if the reset date has passed
  if (usage.resetAt && new Date() > new Date(usage.resetAt)) {
    (user as any).usage[resource] = {
      count: 0,
      resetAt: getNextResetDate(limit.period),
    };
    await user.save();
    usage.count = 0;
  }

  const currentCount = usage.count || 0;
  const maxAllowed = limit.max || 0;
  const remaining = Math.max(0, maxAllowed - currentCount);
  const allowed = currentCount < maxAllowed;

  return {
    allowed,
    remaining,
    limit: maxAllowed,
    period: limit.period,
    currentUsage: currentCount,
    message: allowed
      ? undefined
      : `Limit reached: ${currentCount}/${maxAllowed} ${resource} per ${limit.period}`,
  };
}

/**
 * Increment usage counter for a resource. Call this AFTER a successful action.
 */
export async function incrementUsage(
  userId: string,
  resource: LimitResource,
  count: number = 1
): Promise<void> {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) return;

  const limit = (user as any).limits?.[resource] || { max: -1, period: "unlimited" };

  // Don't track usage for unlimited resources
  if (limit.period === "unlimited" || limit.max === -1) return;

  // Initialize usage if not exists
  if (!(user as any).usage) (user as any).usage = {};
  if (!(user as any).usage[resource]) {
    (user as any).usage[resource] = {
      count: 0,
      resetAt: getNextResetDate(limit.period),
    };
  }

  // Auto-reset if period expired
  const usage = (user as any).usage[resource];
  if (usage.resetAt && new Date() > new Date(usage.resetAt)) {
    usage.count = 0;
    usage.resetAt = getNextResetDate(limit.period);
  }

  usage.count = (usage.count || 0) + count;

  await user.save();
}

/**
 * Decrement usage counter (e.g., when a resource is deleted).
 */
export async function decrementUsage(
  userId: string,
  resource: LimitResource,
  count: number = 1
): Promise<void> {
  await connectDB();

  const user = await User.findById(userId);
  if (!user) return;

  const usage = (user as any).usage?.[resource];
  if (!usage) return;

  usage.count = Math.max(0, (usage.count || 0) - count);
  await user.save();
}

/**
 * Get all limits and usage for a user (for frontend display).
 */
export async function getUserLimitsAndUsage(userId: string) {
  await connectDB();

  const user = await User.findById(userId).lean();
  if (!user) return null;

  const limits = (user as any).limits || {};
  const usage = (user as any).usage || {};

  const result: Record<
    string,
    {
      limit: { max: number; period: string };
      usage: { count: number; resetAt: Date | null };
      remaining: number;
      allowed: boolean;
    }
  > = {};

  for (const resource of LIMIT_RESOURCES) {
    const limit = limits[resource] || { max: -1, period: "unlimited" };
    const u = usage[resource] || { count: 0, resetAt: null };
    const isUnlimited = limit.period === "unlimited" || limit.max === -1;

    result[resource] = {
      limit,
      usage: { count: u.count || 0, resetAt: u.resetAt },
      remaining: isUnlimited ? Infinity : Math.max(0, limit.max - (u.count || 0)),
      allowed: isUnlimited || (u.count || 0) < limit.max,
    };
  }

  return result;
}
