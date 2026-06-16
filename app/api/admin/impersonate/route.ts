// app/api/admin/impersonate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { encode } from "next-auth/jwt";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const key = searchParams.get("key");

    // Define your base URL explicitly as HTTP for localhost
    const baseUrl = "http://localhost:3000"; // Change port if you use 3001, etc.

    if (!userId || !key) {
      return NextResponse.redirect(`${baseUrl}/signin?error=missing_params`);
    }

    if (key !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.redirect(`${baseUrl}/signin?error=unauthorized`);
    }

    await connectDB();
    const user = await User.findById(userId);

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/signin?error=user_not_found`);
    }

    const sessionToken = await encode({
      token: {
        id: user._id.toString(),
        name: user.name,
        sub: user._id.toString(),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        jti: crypto.randomUUID(),
      },
      secret: process.env.NEXTAUTH_SECRET!,
    });

    // FORCE HTTP REDIRECT HERE
    const response = NextResponse.redirect(`${baseUrl}/dashboard`);

    const cookieName = "next-auth.session-token"; // Forced to standard name for localhost

    response.cookies.set({
      name: cookieName,
      value: sessionToken,
      httpOnly: true,
      secure: false, // MUST be false for localhost
      path: "/",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("Impersonation error:", error);
    const baseUrl = "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/signin?error=impersonation_failed`);
  }
}