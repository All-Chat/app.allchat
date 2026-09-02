/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agent from "@/models/Agent";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    // Run DB connection and auth session in parallel
    const [, session] = await Promise.all([connectDB(), getServerSession(authOptions)]);
    const userId = session?.user?.id;
    
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch agents from latest to oldest
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
    
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // Extract tenantId if it exists in the session
    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    // Create agent with the correct userId and tenantId
    const newAgent = await Agent.create({
      ...body,
      userId,
      tenantId,
    });

    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
