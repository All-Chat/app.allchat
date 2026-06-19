/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OptNumber from "@/models/OptNumber";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const numbers = await OptNumber.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json({ numbers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ CHECK LIMIT BEFORE CREATING
    const limitCheck = await checkLimit(userId, "optNumbers");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Opt-in number limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} numbers per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "optNumbers",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
      );
    }

    const { phoneNumber } = await req.json();
    if (!phoneNumber || !phoneNumber.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Prevent duplicates
    const existing = await OptNumber.findOne({ userId, phoneNumber: phoneNumber.trim() });
    if (existing) return NextResponse.json({ error: "Number already exists" }, { status: 400 });

    // ==========================================
    // 🔴 MULTI-TENANT DATA ISOLATION
    // ==========================================
    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const optNumber = await OptNumber.create({ 
      userId, 
      tenantId, // ✅ ATTACH TENANT ID FOR AGGREGATED VIEWS
      createdBy: userId, // ✅ TRACK WHO CREATED IT
      phoneNumber: phoneNumber.trim() 
    });

    // ✅ INCREMENT USAGE AFTER SUCCESSFUL CREATION
    await incrementUsage(userId, "optNumbers");

    return NextResponse.json({ success: true, optNumber });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
