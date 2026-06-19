/* eslint-disable @typescript-eslint/no-explicit-any */
import User from "@/models/User";

/**
 * Valid WhatsApp template categories
 */
export const TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * Get the price for a specific template category for a user.
 * Falls back to legacy pricePerMessage if category-specific price is not set.
 */
export function getPriceForCategory(
  user: any,
  category: string
): number {
  const cat = (category || "MARKETING").toUpperCase().trim();

  switch (cat) {
    case "MARKETING":
      return user.priceMarketing ?? user.pricePerMessage ?? 0.90;
    case "UTILITY":
      return user.priceUtility ?? user.pricePerMessage ?? 0.50;
    case "AUTHENTICATION":
      return user.priceAuthentication ?? user.pricePerMessage ?? 0.30;
    default:
      // Unknown category — use marketing price as default
      return user.priceMarketing ?? user.pricePerMessage ?? 0.90;
  }
}

/**
 * Get the minimum price across all categories for a user.
 * Used to determine if the user can send at least one message.
 */
export function getMinPrice(user: any): number {
  const prices = [
    user.priceMarketing ?? 0.90,
    user.priceUtility ?? 0.50,
    user.priceAuthentication ?? 0.30,
  ].filter((p) => p > 0);

  if (prices.length === 0) return 0; // All free
  return Math.min(...prices);
}

/**
 * Check if user has sufficient balance for a given cost.
 * If the determined price is 0, messages are free — always returns true.
 */
export async function hasSufficientBalance(
  userId: string,
  requiredAmount: number
): Promise<{ sufficient: boolean; balance: number; pricePerMessage: number }> {
  const user = await User.findById(userId);
  if (!user) return { sufficient: false, balance: 0, pricePerMessage: 0 };

  const balance = user.balance || 0;
  const pricePerMessage = requiredAmount || 0;

  if (pricePerMessage === 0) return { sufficient: true, balance, pricePerMessage };

  return {
    sufficient: balance >= requiredAmount,
    balance,
    pricePerMessage,
  };
}

/**
 * Check if user has sufficient balance for a specific category.
 */
export async function hasSufficientBalanceForCategory(
  userId: string,
  category: string
): Promise<{ sufficient: boolean; balance: number; price: number; category: string }> {
  const user = await User.findById(userId);
  if (!user) return { sufficient: false, balance: 0, price: 0, category };

  const balance = user.balance || 0;
  const price = getPriceForCategory(user, category);

  if (price === 0) return { sufficient: true, balance, price, category };

  return { sufficient: balance >= price, balance, price, category };
}

/**
 * Deduct balance from user after a successful message send.
 * Uses Math.round to avoid floating-point precision issues.
 */
export async function deductBalance(
  userId: string,
  amount: number
): Promise<{ success: boolean; newBalance: number }> {
  const user = await User.findById(userId);
  if (!user) return { success: false, newBalance: 0 };

  const currentBalance = user.balance || 0;
  const newBalance = Math.round((currentBalance - amount) * 100) / 100;

  user.balance = Math.max(newBalance, 0);
  await user.save();

  return { success: true, newBalance: user.balance };
}

/**
 * Format a number as Indian Rupee currency string.
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
