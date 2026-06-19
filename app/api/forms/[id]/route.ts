/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Form from "@/models/Form";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decrementUsage } from "@/lib/limits";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { name, fields, completionMessage, abandonmentMessage } = await req.json();

    const updateData: any = { name, fields };
    if (completionMessage !== undefined) updateData.completionMessage = completionMessage;
    if (abandonmentMessage !== undefined) updateData.abandonmentMessage = abandonmentMessage;

    const updatedForm = await Form.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true }
    );

    if (!updatedForm) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    return NextResponse.json({ success: true, form: updatedForm });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const deleted = await Form.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    // ✅ DECREMENT USAGE AFTER SUCCESSFUL DELETION
    await decrementUsage(userId, "forms");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
