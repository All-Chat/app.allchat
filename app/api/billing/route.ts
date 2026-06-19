import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMinPrice } from "@/lib/billing";

/**
 * GET /api/billing
 * Returns the current user's billing information.
 * NOTE: prices are NOT exposed to frontend.
 */
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

    const balance = user.balance || 0;
    const minPrice = getMinPrice(user);
    const canSendMessage = minPrice === 0 || balance >= minPrice;

    return NextResponse.json({
      success: true,
      billing: {
        balance: balance,
        totalRecharged: user.totalRecharged || 0,
        canSendMessage: canSendMessage,
        // prices are intentionally NOT sent to frontend
      },
    });
  } catch (error) {
    console.error("Error fetching billing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
