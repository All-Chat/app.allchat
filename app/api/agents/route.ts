/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agent from "@/models/Agent";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // Adjust this path if your NextAuth route is elsewhere

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    
    // Get the actual logged-in user
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    
    // Extract the real user ID (use (session.user as any).id if TypeScript complains)
    const userId = (session.user as any).id || session.user.id;
    
    // Fetch agents from latest to oldest
    const agents = await Agent.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, agents });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    
    // Get the actual logged-in user
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    
    // Extract the real user ID
    const userId = (session.user as any).id || session.user.id;
    
    const body = await req.json();

    const newAgent = await Agent.create({ ...body, userId });
    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
