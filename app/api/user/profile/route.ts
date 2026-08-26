/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const query = session.user.email ? { email: session.user.email } : { _id: session.user.id };
    const user = await User.findOne(query).lean();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({
      success: true,
      user: {
        name: user.name,
        balance: user.balance || 0,
        accountStatus: user.accountStatus || "active",
        hideIntegrations: user.hideIntegrations || false,
        hiddenSidebarLinks: user.hiddenSidebarLinks || [],
        hiddenReportActions: user.hiddenReportActions || [],
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
