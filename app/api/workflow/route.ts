/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Workflow from "@/models/Workflow";
import { getServerSession } from "next-auth"; // ADDED
import { authOptions } from "@/lib/auth";      // ADDED

// GET ALL WORKFLOWS
export async function GET() {
  await connectDB();
  
  try {
    // 1. Get the current logged-in user's ID
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch only workflows belonging to this user
    const workflows = await Workflow.find({ userId });
    return NextResponse.json({ workflows });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// CREATE WORKFLOW
export async function POST(req: Request) {
  await connectDB();

  try {
    // 1. Get the current logged-in user's ID
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { triggers, steps, rootStepId } = await req.json();

    // Basic validation
    if (!triggers || triggers.length === 0) {
      return NextResponse.json(
        { success: false, message: "At least one trigger is required" },
        { status: 400 }
      );
    }

    if (!rootStepId || !steps || !steps[rootStepId]) {
      return NextResponse.json(
        { success: false, message: "A valid root step is required" },
        { status: 400 }
      );
    }

    // 2. Create workflow with userId attached
    const wf = await Workflow.create({
      userId, // ADDED
      triggers,
      steps,
      rootStepId,
    });

    return NextResponse.json({ success: true, wf });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}

// UPDATE WORKFLOW
export async function PUT(req: Request) {
  await connectDB();

  try {
    // 1. Get the current logged-in user's ID
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id, triggers, steps, rootStepId } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Workflow ID is required" },
        { status: 400 }
      );
    }

    // 2. Update workflow ONLY if it belongs to this user
    const updatedWf = await Workflow.findOneAndUpdate(
      { _id: id, userId: userId }, // ADDED userId to prevent updating other users' workflows
      { 
        triggers, 
        steps, 
        rootStepId 
      },
      { new: true, runValidators: true }
    );

    if (!updatedWf) {
      return NextResponse.json(
        { success: false, message: "Workflow not found or not authorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, wf: updatedWf });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}