/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserLimitsAndUsage, checkLimit } from "@/lib/limits";
import { connectDB } from "@/lib/mongodb";

export async function GET(req: Request) {
  try {
    // ✅ Run DB connection and session check in parallel to save time
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

    const url = new URL(req.url);
    const resource = url.searchParams.get("resource");

    // ✅ THE SECRET WEAPON: Cache for 24 hours (86400 seconds).
    // The browser will NOT ask the server for this data again until the user closes the browser or logs out.
    const cacheHeaders = {
      "Cache-Control": "private, max-age=86400, s-maxage=86400"
    };

    if (resource) {
      // Check a specific resource limit
      const limitCheck = await checkLimit(session.user.id, resource as any);
      return NextResponse.json({
        success: true,
        resource,
        ...limitCheck,
      }, { headers: cacheHeaders });
    }

    // Get all limits and usage
    const data = await getUserLimitsAndUsage(session.user.id);
    if (!data) {
      return NextResponse.json(
        { error: "User not found" }, 
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { success: true, limits: data }, 
      { headers: cacheHeaders }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
