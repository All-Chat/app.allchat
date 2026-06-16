import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Template from "@/models/Template";

export async function POST(req: Request) {
  try {
    await connectDB();

    const { id, name, type, body, mediaUrl } = await req.json();

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Template ID missing" },
        { status: 400 }
      );
    }

    const updated = await Template.findByIdAndUpdate(
      id,
      { name, type, body, mediaUrl },
      { new: true }
    );

    return NextResponse.json({
      success: true,
      template: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}