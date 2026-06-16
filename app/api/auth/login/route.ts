/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: Request) {
  try {
    await connectDB();

    const { name, password } = await req.json();

    if (!name || !password) {
      return NextResponse.json(
        { message: "Name and password are required" },
        { status: 400 }
      );
    }

    // 1. Find User
    const user = await User.findOne({ name });

    if (!user) {
      return NextResponse.json(
        { message: "Invalid name or password" },
        { status: 401 }
      );
    }

    // 2. Check Password (plain text as you requested)
    if (user.password !== password) {
      return NextResponse.json(
        { message: "Invalid name or password" },
        { status: 401 }
      );
    }

    // 3. Success - Return user data (SAFE FIX)
    const { password: _, ...safeUser } = user.toObject();

    return NextResponse.json({
      success: true,
      user: safeUser,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
