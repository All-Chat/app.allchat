import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agent from "@/models/Agent";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    // TODO: Replace this with your actual logged-in User ID logic (e.g., from session/token)
    const userId = "65a1b2c3d4e5f6a7b8c9d0e1"; // Dummy User ID for now
    
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
    const body = await req.json();
    
    // TODO: Replace with actual logged-in User ID
    const userId = "65a1b2c3d4e5f6a7b8c9d0e1";

    const newAgent = await Agent.create({ ...body, userId });
    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
