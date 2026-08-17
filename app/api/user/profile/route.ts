/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function GET(req: Request) {
  try {
    await connectDB();

    // Assuming you use next-auth. If you use a custom auth, adjust this part.
    const session = await getServerSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Assuming session.user.name or session.user.email holds the username
    const userName = (session.user as any).name || (session.user as any).email;

    const user = await User.findOne({ name: userName }).lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ✅ Return the fields needed by the frontend, including hiddenReportActions
    return NextResponse.json({
      success: true,
      user: {
        name: user.name,
        balance: user.balance || 0,
        accountStatus: user.accountStatus || "active",
        hideIntegrations: user.hideIntegrations || false,
        hiddenSidebarLinks: user.hiddenSidebarLinks || [],
        hiddenReportActions: user.hiddenReportActions || [], // ✅ CRITICAL: SEND THIS TO FRONTEND
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
