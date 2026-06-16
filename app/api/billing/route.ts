import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/billing
 * Returns the current user's billing information.
 * NOTE: pricePerMessage is NOT exposed to frontend.
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

    // Determine if user has enough balance to send at least one message
    const pricePerMessage = user.pricePerMessage || 0;
    const balance = user.balance || 0;
    const canSendMessage = pricePerMessage === 0 || balance >= pricePerMessage;

    return NextResponse.json({
      success: true,
      billing: {
        balance: balance,
        totalRecharged: user.totalRecharged || 0,
        canSendMessage: canSendMessage,
        // pricePerMessage is intentionally NOT sent to frontend
      },
    });
  } catch (error) {
    console.error("Error fetching billing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}