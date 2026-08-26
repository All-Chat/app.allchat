/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb"; 
import User from "@/models/User";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const query = session.user.email ? { email: session.user.email } : { _id: session.user.id };
    const currentUser = await User.findOne(query).select("isTenant tenantId whatsappNumbers name").lean();

    if (!currentUser) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

    let allNumbers: any[] = [];
    const seenPhoneIds = new Set();

    const addNumbers = (userDoc: any, prefix: string = "") => {
      if (userDoc?.whatsappNumbers && Array.isArray(userDoc.whatsappNumbers)) {
        userDoc.whatsappNumbers.forEach((n: any) => {
          if (n.whatsappPhoneNumberId && !seenPhoneIds.has(n.whatsappPhoneNumberId)) {
            seenPhoneIds.add(n.whatsappPhoneNumberId);
            const name = prefix ? `${prefix} - ${n.name}` : n.name;
            allNumbers.push({ ...n, name });
          }
        });
      }
    };

    addNumbers(currentUser);

    if (currentUser.isTenant) {
      const tenantId = currentUser.tenantId || currentUser._id.toString();
      const subUsers = await User.find({ parentTenantId: tenantId }).select("whatsappNumbers name").lean();
      subUsers.forEach(subUser => addNumbers(subUser, subUser.name));
    }

    return NextResponse.json({ success: true, numbers: allNumbers }, { status: 200 });

  } catch (error) {
    console.error("Error fetching WhatsApp numbers:", error);
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}
