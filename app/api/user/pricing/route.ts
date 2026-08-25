import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // ✅ O(1) Database lookup using _id index, fetching ONLY 1 field
    const user = await User.findById(session.user.id)
      .select("enabledCountries")
      .lean();

    if (!user) {
      return NextResponse.json({ success: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const response = NextResponse.json({
      success: true,
      enabledCountries: user.enabledCountries || []
    });

    // ✅ THE SECRET WEAPON: Client-side Caching
    // The browser will now cache this for 60 seconds. 
    // Repeat page loads will load in 0ms without hitting the server!
    response.headers.set("Cache-Control", "private, max-age=60, s-maxage=60");

    return response;
  } catch (error) {
    console.error("Error fetching pricing:", error);
    return NextResponse.json({ success: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
