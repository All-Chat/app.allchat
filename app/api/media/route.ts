/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Media from "@/models/Media";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id; // Fixed: using id instead of email

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all media uploaded by this user, newest first
    const media = await Media.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json({ media });
  } catch (error: any) {
    console.error("Media Library Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
