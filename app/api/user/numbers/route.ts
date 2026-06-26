/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  await connectDB();

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await User.findById(userId).select(
      "whatsappPhoneNumberId whatsappNumbers name"
    );

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const numbers: any[] = [];

    // Collect from whatsappNumbers array
    if (user.whatsappNumbers && user.whatsappNumbers.length > 0) {
      for (const n of user.whatsappNumbers) {
        if (n.whatsappPhoneNumberId) {
          numbers.push({
            phoneNumberId: n.whatsappPhoneNumberId,
            name: n.name || "WhatsApp Number",
            wabaId: n.wabaId || null,
            isActive: n.isActive || false,
          });
        }
      }
    }

    // Also add the default number if not already in the list
    if (user.whatsappPhoneNumberId) {
      const alreadyExists = numbers.some(
        (n) => n.phoneNumberId === user.whatsappPhoneNumberId
      );
      if (!alreadyExists) {
        numbers.push({
          phoneNumberId: user.whatsappPhoneNumberId,
          name: "Default Number",
          wabaId: null,
          isActive: true,
        });
      }
    }

    return NextResponse.json({ success: true, numbers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
