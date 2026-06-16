/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth"; // ADDED
import { authOptions } from "@/lib/auth";      // ADDED

export async function GET() {
  try {
    // CHANGED: Get the user directly from the NextAuth session cookie
    // This guarantees we return the name of the ACTUAL logged-in user
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, name: "User" }, { status: 401 });
    }

    return NextResponse.json({ 
      success: true, 
      name: session.user.name || "User"
    });
  } catch (error: any) {
    console.error("Fetch User Error:", error);
    return NextResponse.json({ success: false, name: "User" }, { status: 500 });
  }
}