/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function GET() {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ Query by _id (uses fastest index) and .select() ONLY needed fields
    const user = await User.findById(session.user.id)
      .select("name balance accountStatus hideIntegrations hiddenSidebarLinks hiddenReportActions")
      .lean();

    if (!user) {
      return NextResponse.json(
        { error: "User not found" }, 
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const response = NextResponse.json({
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

    // ✅ Cache for 10 seconds. Because this route contains 'balance', 
    // we only cache for 10 seconds (instead of 24 hours) so the wallet updates fairly quickly, 
    // but rapid page navigations within 10 seconds will load instantly.
    response.headers.set("Cache-Control", "private, max-age=10, s-maxage=10");

    return response;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
