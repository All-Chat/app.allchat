import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb"; // or @/lib/dbConnect
import User from "@/models/User";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    // Check if session or session.user exists
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Try finding by email first, then fallback to ID if needed
    const query = session.user.email ? { email: session.user.email } : { _id: session.user.id };
    const user = await User.findOne(query).select("whatsappNumbers").lean();

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      numbers: user.whatsappNumbers || [],
    }, { status: 200 });

  } catch (error) {
    console.error("Error fetching WhatsApp numbers:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
