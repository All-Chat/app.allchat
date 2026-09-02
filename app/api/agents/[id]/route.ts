import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agent from "@/models/Agent";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    
    // Await params since it's a Promise in Next.js 15
    const { id } = await params;
    const body = await req.json();
    
    // If we are activating an agent, deactivate all others for this user first
    if (body.active === true) {
      const agentToActivate = await Agent.findById(id);
      if (agentToActivate) {
        await Agent.updateMany(
          { userId: agentToActivate.userId, _id: { $ne: id } },
          { $set: { active: false } }
        );
      }
    }
    
    const updatedAgent = await Agent.findByIdAndUpdate(
      id, 
      body, 
      { returnDocument: 'after', runValidators: true } // Fixed Mongoose deprecation warning
    );
    
    if (!updatedAgent) return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    
    return NextResponse.json({ success: true, agent: updatedAgent });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    
    // Await params
    const { id } = await params;
    
    const deletedAgent = await Agent.findByIdAndDelete(id);
    
    if (!deletedAgent) return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    
    return NextResponse.json({ success: true, message: "Agent deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
