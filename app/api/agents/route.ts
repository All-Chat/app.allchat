/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agent from "@/models/Agent";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET() {
  try {
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const agents = await Agent.find({ userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, agents });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // ✅ LIMIT CHECK
    const limitCheck = await checkLimit(userId, "aiAgents" as any);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: `AI Agent limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} agents per ${limitCheck.period}.`, 
          limitExceeded: true 
        },
        { status: 429 }
      );
    }

    const body = await req.json();

    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const newAgent = await Agent.create({
      ...body,
      userId,
      tenantId,
    });

    // ✅ INCREMENT USAGE
    incrementUsage(userId, "aiAgents" as any).catch(() => {});

    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
