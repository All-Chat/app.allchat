/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserLimitsAndUsage, checkLimit } from "@/lib/limits";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const resource = url.searchParams.get("resource"); // optional: check specific resource

    if (resource) {
      // Check a specific resource limit
      const limitCheck = await checkLimit(session.user.id, resource as any);
      return NextResponse.json({
        success: true,
        resource,
        ...limitCheck,
      });
    }

    // Get all limits and usage
    const data = await getUserLimitsAndUsage(session.user.id);
    if (!data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, limits: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
