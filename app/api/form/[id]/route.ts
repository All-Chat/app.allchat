/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Workflow from "@/models/Workflow";
import mongoose from "mongoose";

const FormSubmissionSchema = new mongoose.Schema({
  phone: String,
  stepId: String,
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});
const FormSubmission = mongoose.models.FormSubmission || mongoose.model("FormSubmission", FormSubmissionSchema);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const stepId = params.id;
    const workflows = await Workflow.find({});
    let foundStep = null;

    for (const wf of workflows) {
      const step = wf.steps?.get(stepId); // Map getter
      if (step && step.nodeType === "formNode") {
        foundStep = step;
        break;
      }
    }

    if (!foundStep) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ step: foundStep });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const stepId = params.id;
    const { phone, formData } = await req.json();
    await FormSubmission.create({ phone: phone || "unknown", stepId, data: formData });
    return NextResponse.json({ success: true, message: "Form submitted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
