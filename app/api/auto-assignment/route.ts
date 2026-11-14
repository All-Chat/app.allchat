/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { connectDB } from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";
import User from "@/models/User";
import AutoAssignment from "@/models/AutoAssignment";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await User.findById(session.user.id).lean();

    if (!user || !user.isTenant) {
      return NextResponse.json(
        { success: false, message: "Only the tenant can manage auto assignment." },
        { status: 403 }
      );
    }

    const tenantId = String(user.tenantId || user._id);

    const settings = await AutoAssignment.findOneAndUpdate(
      { tenantId },
      { $setOnInsert: { enabled: false, counter: 0 } },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({
      success: true,
      enabled: Boolean(settings?.enabled),
      counter: settings?.counter || 0,
    });
  } catch (error: any) {
    console.error("Auto Assignment GET Error:", error);

    return NextResponse.json(
      { success: false, message: error.message || "Failed to load settings." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await User.findById(session.user.id).lean();

    if (!user || !user.isTenant) {
      return NextResponse.json(
        { success: false, message: "Only the tenant can manage auto assignment." },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { success: false, message: "Invalid enabled value." },
        { status: 400 }
      );
    }

    const tenantId = String(user.tenantId || user._id);

    const activeUsers = await User.countDocuments({
      parentTenantId: tenantId,
      isTenant: false,
      accountStatus: "active",
    });

    if (body.enabled && activeUsers === 0) {
      return NextResponse.json(
        { success: false, message: "No active sub-users available for assignment." },
        { status: 400 }
      );
    }

    const settings = await AutoAssignment.findOneAndUpdate(
      { tenantId },
      {
        $set: { enabled: body.enabled },
        $setOnInsert: { counter: 0 },
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({
      success: true,
      enabled: settings.enabled,
      message: body.enabled
        ? "Auto assignment started successfully."
        : "Auto assignment stopped successfully.",
    });
  } catch (error: any) {
    console.error("Auto Assignment POST Error:", error);

    return NextResponse.json(
      { success: false, message: error.message || "Failed to update settings." },
      { status: 500 }
    );
  }
}
