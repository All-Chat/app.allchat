import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    const user = await User.findById(session.user.id).select("enabledCountries").lean();
    if (!user) return NextResponse.json({ success: false }, { status: 404 });

    return NextResponse.json({ success: true, enabledCountries: user.enabledCountries || [] });
  } catch (error) {
    console.error("Error fetching pricing:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
