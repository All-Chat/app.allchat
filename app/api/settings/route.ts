/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const maskedToken = user.whatsappAccessToken
      ? `${user.whatsappAccessToken.substring(0, 5)}${"*".repeat(15)}${user.whatsappAccessToken.slice(-4)}`
      : "";

    return NextResponse.json({
      success: true,
      settings: {
        wabaId: user.wabaId || "",
        whatsappPhoneNumberId: user.whatsappPhoneNumberId || "",
        whatsappAccessToken: maskedToken,
        hasRealToken: !!user.whatsappAccessToken,
        // ==========================================
        // BILLING INFO — NO pricePerMessage exposed
        // ==========================================
        balance: user.balance || 0,
        totalRecharged: user.totalRecharged || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { wabaId, whatsappPhoneNumberId, whatsappAccessToken } = body;

    const updateData: any = {
      wabaId: wabaId?.trim() || null,
      whatsappPhoneNumberId: whatsappPhoneNumberId?.trim() || null,
    };

    if (whatsappAccessToken && !whatsappAccessToken.includes("*")) {
      updateData.whatsappAccessToken = whatsappAccessToken.trim();
    }

    const updatedUser = await User.findByIdAndUpdate(
      session.user.id,
      updateData,
      { returnDocument: "after", runValidators: true }
    );

    if (!updatedUser) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Settings updated successfully" });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}