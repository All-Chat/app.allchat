/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
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
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
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
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
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

    const { triggers, steps, rootStepId, wabaPhoneNumberId: bodyWabaPhoneNumberId } = await req.json();

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

    // ==========================================
    // 🔴 MULTI-TENANT DATA ISOLATION
    // ==========================================
    const tenantId =
      (session?.user as any)?.parentTenantId ||
      (session?.user as any)?.tenantId ||
      null;

    // ==========================================
    // 🔴 WABA PHONE NUMBER RESOLUTION
    // Priority:
    //   1. Frontend explicitly selected number
    //   2. First active number from whatsappNumbers array
    //   3. ANY number from whatsappNumbers array (even if not active)
    //   4. Default whatsappPhoneNumberId on user doc
    // ==========================================
    let wabaPhoneNumberId: string | null = null;
    let wabaPhoneNumber: string | null = null;

    const userDoc = await User.findById(userId).select(
      "whatsappPhoneNumberId whatsappNumbers name"
    );

    if (userDoc) {
      // Priority 1: Frontend explicitly selected
      if (bodyWabaPhoneNumberId) {
        wabaPhoneNumberId = bodyWabaPhoneNumberId;
        // Find the name from the array
        const matchNum = userDoc.whatsappNumbers?.find(
          (n: any) => n.whatsappPhoneNumberId === bodyWabaPhoneNumberId
        );
        wabaPhoneNumber = matchNum?.name || null;
      }
      // Priority 2: First active number from array
      else if (userDoc.whatsappNumbers && userDoc.whatsappNumbers.length > 0) {
        const activeNum = userDoc.whatsappNumbers.find(
          (n: any) => n.isActive && n.whatsappPhoneNumberId
        );
        // Priority 3: ANY number with a phone ID (even if not active)
        const anyNum = activeNum || userDoc.whatsappNumbers.find(
          (n: any) => n.whatsappPhoneNumberId
        );

        if (anyNum && anyNum.whatsappPhoneNumberId) {
          wabaPhoneNumberId = anyNum.whatsappPhoneNumberId;
          wabaPhoneNumber = anyNum.name || null;
        }
      }

      // Priority 4: Default number on user doc
      if (!wabaPhoneNumberId && userDoc.whatsappPhoneNumberId) {
        wabaPhoneNumberId = userDoc.whatsappPhoneNumberId;
        wabaPhoneNumber = null;
      }
    }

    if (!wabaPhoneNumberId) {
      console.warn(
        `⚠️ User ${userId} has no WABA phone number linked. Workflow created but won't execute until a number is connected.`
      );
    } else {
      console.log(
        `✅ Workflow will be linked to WABA number: ${wabaPhoneNumberId} (${wabaPhoneNumber || "unnamed"})`
      );
    }

    const wf = await Workflow.create({
      userId,
      tenantId,
      createdBy: userId,
      wabaPhoneNumberId,
      wabaPhoneNumber,
      triggers,
      steps,
      rootStepId,
      active: true,
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
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id, triggers, steps, rootStepId, active, wabaPhoneNumberId: bodyWabaPhoneNumberId } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Workflow ID is required" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (triggers !== undefined) updateData.triggers = triggers;
    if (steps !== undefined) updateData.steps = steps;
    if (rootStepId !== undefined) updateData.rootStepId = rootStepId;
    if (active !== undefined) updateData.active = active;

    // ✅ Allow updating the linked WABA number
    if (bodyWabaPhoneNumberId !== undefined) {
      updateData.wabaPhoneNumberId = bodyWabaPhoneNumberId || null;

      // Also resolve the name
      if (bodyWabaPhoneNumberId) {
        const userDoc = await User.findById(userId).select("whatsappNumbers");
        const matchNum = userDoc?.whatsappNumbers?.find(
          (n: any) => n.whatsappPhoneNumberId === bodyWabaPhoneNumberId
        );
        updateData.wabaPhoneNumber = matchNum?.name || null;
      } else {
        updateData.wabaPhoneNumber = null;
      }
    }

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
