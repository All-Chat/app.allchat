import User from "@/models/User";

/**
 * Check if user has sufficient balance for a given cost.
 * If pricePerMessage is 0, messages are free — always returns true.
 */
export async function hasSufficientBalance(
  userId: string,
  requiredAmount: number
): Promise<{ sufficient: boolean; balance: number; pricePerMessage: number }> {
  const user = await User.findById(userId);
  if (!user) return { sufficient: false, balance: 0, pricePerMessage: 0 };

  const balance = user.balance || 0;
  const pricePerMessage = user.pricePerMessage || 0;

  // If price is 0, messages are free
  if (pricePerMessage === 0) return { sufficient: true, balance, pricePerMessage };

  return {
    sufficient: balance >= requiredAmount,
    balance,
    pricePerMessage,
  };
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
 * e.g., 100000 → "₹1,00,000.00"
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}