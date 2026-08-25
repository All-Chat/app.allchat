/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OptNumber from "@/models/OptNumber";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET(req: Request) {
  try {
    // ✅ Run DB connection and session check in parallel for faster boot
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ PAGINATION LOGIC
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // ✅ Fetch numbers and total count in parallel for speed
    // ✅ Added .select() to only pull necessary fields, reducing memory payload
    const [numbers, totalNumbers] = await Promise.all([
      OptNumber.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("phoneNumber createdAt") 
        .lean(), 
      OptNumber.countDocuments({ userId })
    ]);

    return NextResponse.json({ 
      numbers,
      currentPage: page,
      totalPages: Math.ceil(totalNumbers / limit),
      totalNumbers
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
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

    // ✅ Prevent duplicates - use .select("_id").lean() for ultra-fast check
    const existing = await OptNumber.findOne({ userId, phoneNumber: phoneNumber.trim() }).select("_id").lean();
    if (existing) return NextResponse.json({ error: "Number already exists" }, { status: 400 });

    // ==========================================
    // 🔴 MULTI-TENANT DATA ISOLATION
    // ==========================================
    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const optNumber = await OptNumber.create({ 
      userId, 
      tenantId, 
      createdBy: userId, 
      phoneNumber: phoneNumber.trim() 
    });

    // ✅ Fire-and-forget usage increment (don't block the API response)
    incrementUsage(userId, "optNumbers").catch(() => {});

    return NextResponse.json({ success: true, optNumber });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
