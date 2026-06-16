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

    // 2. Check Password (Plain text comparison as requested)
    if (user.password !== password) {
      return NextResponse.json(
        { message: "Invalid name or password" },
        { status: 401 }
      );
    }

    // 3. Success - Return user data
    const userObj = user.toObject();
    delete userObj.password; // Remove password before sending to frontend

    return NextResponse.json({
      success: true,
      user: userObj,
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    );
  }
}