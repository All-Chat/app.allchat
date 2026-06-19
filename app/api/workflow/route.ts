/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Workflow from "@/models/Workflow";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

// GET ALL WORKFLOWS
export async function GET() {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

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
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limitCheck = await checkLimit(userId, "workflows");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Workflow limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} workflows per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "workflows",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
      );
    }

    const { triggers, steps, rootStepId } = await req.json();

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

    const wf = await Workflow.create({
      userId,
      triggers,
      steps,
      rootStepId,
      active: true, // ✅ Explicitly set to active on creation
    });

    await incrementUsage(userId, "workflows");

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
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id, triggers, steps, rootStepId, active } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Workflow ID is required" },
        { status: 400 }
      );
    }

    // ✅ DYNAMIC UPDATE OBJECT: Only update fields that are actually provided.
    // This prevents overwriting steps/triggers with undefined when just toggling active status.
    const updateData: any = {};
    if (triggers !== undefined) updateData.triggers = triggers;
    if (steps !== undefined) updateData.steps = steps;
    if (rootStepId !== undefined) updateData.rootStepId = rootStepId;
    if (active !== undefined) updateData.active = active;

    const updatedWf = await Workflow.findOneAndUpdate(
      { _id: id, userId: userId },
      updateData, 
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
