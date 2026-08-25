/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import FormResponse from "@/models/FormResponse";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Use .lean() for faster query and lower memory usage
    const responses = await FormResponse.find({ userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ responses });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
