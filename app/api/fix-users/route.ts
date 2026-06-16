/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";

export async function GET() {
  try {
    const mongoose = await connectDB();
    const db = mongoose.connection.db;

    if (!db) {
      return NextResponse.json({ success: false, message: "Database connection not available." }, { status: 500 });
    }

    // Drop the specific index causing the issue
    await db.collection('users').dropIndex('email_1');

    return NextResponse.json({ success: true, message: "Successfully deleted email_1 index! You can now create users." });
  } catch (error: any) {
    // If it says index not found, it's already gone!
    if (error.code === 27) {
      return NextResponse.json({ success: true, message: "Index does not exist (already deleted)." });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}