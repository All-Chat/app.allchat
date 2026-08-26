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

    const numbers = await OptNumber.find({ userId }).sort({ createdAt: -1 }).lean();
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

    const limitCheck = await checkLimit(userId, "optNumbers");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: `Opt-in number limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} numbers per ${limitCheck.period}.`, limitExceeded: true },
        { status: 429 }
      );
    }

    const { phoneNumber } = await req.json();
    if (!phoneNumber || !phoneNumber.trim()) return NextResponse.json({ error: "Phone number is required" }, { status: 400 });

    const existing = await OptNumber.findOne({ userId, phoneNumber: phoneNumber.trim() });
    if (existing) return NextResponse.json({ error: "Number already exists" }, { status: 400 });

    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;
    const optNumber = await OptNumber.create({ userId, tenantId, createdBy: userId, phoneNumber: phoneNumber.trim() });

    incrementUsage(userId, "optNumbers").catch(() => {});
    return NextResponse.json({ success: true, optNumber });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
