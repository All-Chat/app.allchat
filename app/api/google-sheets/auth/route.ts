/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET: Generate Auth URL
export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`
  );

  const scopes = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file"
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent"
  });

  return NextResponse.json({ url });
}

// ✅ NEW: DELETE: Disconnect Google Account
export async function DELETE() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Remove Google tokens and Sheet ID from the user document
    await User.findByIdAndUpdate(session.user.id, {
      $unset: {
        googleSheetId: "",
        googleTokens: ""
      }
    });

    return NextResponse.json({ success: true, message: "Google account disconnected successfully." });
  } catch (error: any) {
    console.error("Error disconnecting Google:", error);
    return NextResponse.json({ success: false, message: error.message || "Internal server error" }, { status: 500 });
  }
}
