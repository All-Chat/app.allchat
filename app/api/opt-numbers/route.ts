/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OptNumber from "@/models/OptNumber";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const numbers = await OptNumber.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json({ numbers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { phoneNumber } = await req.json();
    if (!phoneNumber || !phoneNumber.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Prevent duplicates
    const existing = await OptNumber.findOne({ userId, phoneNumber: phoneNumber.trim() });
    if (existing) return NextResponse.json({ error: "Number already exists" }, { status: 400 });

    const optNumber = await OptNumber.create({ userId, phoneNumber: phoneNumber.trim() });
    return NextResponse.json({ success: true, optNumber });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
