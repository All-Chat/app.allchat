/* eslint-disable @typescript-eslint/no-unused-vars */
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { NextResponse } from "next/server";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const key = searchParams.get("key");

    if (!key || key !== ADMIN_SECRET || !userId) {
      return NextResponse.redirect(new URL("/signin", req.url));
    }

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.redirect(new URL("/signin", req.url));
    }

    // Check account status
    if (user.suspendedAt) {
      return new NextResponse(`
        <!DOCTYPE html><html><head><title>Account Not Active</title></head>
        <body style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;background:#f8fafc;color:#1e293b;text-align:center;padding:2rem;">
          <div>
            <div style="font-size:3rem;margin-bottom:1rem;">🔒</div>
            <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem;">Account Not Active</h1>
            <p style="color:#64748b;max-width:400px;">This account is currently suspended. Contact your administrator for assistance.</p>
            <p style="color:#94a3b8;margin-top:2rem;font-size:0.875rem;">Contact your administrator to resolve this issue.</p>
          </div>
        </body></html>
      `, { status: 403, headers: { "Content-Type": "text/html" } });
    }

    // Create session using NextAuth's internal method
    // We'll use a simple cookie-based approach

    const response = NextResponse.redirect(new URL("/", req.url));

    // Set a custom cookie that middleware can read
    response.cookies.set("admin-impersonate", JSON.stringify({
      userId,
      name: user.name,
      adminKey: key,
      timestamp: Date.now(),
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60, // 1 hour
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Impersonation error:", error);
    return NextResponse.redirect(new URL("/signin", req.url));
  }
}