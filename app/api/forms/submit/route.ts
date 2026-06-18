/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Form from "@/models/Form";
import FormResponse from "@/models/FormResponse";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { formId, phone, data } = await req.json();
    
    const form = await Form.findById(formId);
    if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

    await FormResponse.create({
      formId: form._id,
      userId: form.userId, // Link response to the form owner
      phone: phone || "Unknown",
      data
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
