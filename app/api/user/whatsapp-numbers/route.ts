/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb"; 
import User from "@/models/User";

export async function GET() {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" }, 
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ Use findById instead of findOne for faster index lookup
    const currentUser = await User.findById(session.user.id)
      .select("isTenant tenantId whatsappNumbers name")
      .lean();

    if (!currentUser) {
      return NextResponse.json(
        { success: false, message: "User not found" }, 
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

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
      // Fetch sub-users in parallel (already optimized with .select and .lean)
      const subUsers = await User.find({ parentTenantId: tenantId })
        .select("whatsappNumbers name")
        .lean();
        
      subUsers.forEach((subUser: { name: string | undefined; }) => addNumbers(subUser, subUser.name));
    }

    // ✅ THE SECRET WEAPON: Client-side Caching
    // The browser will now cache this for 60 seconds. 
    // Repeat page loads will load in 0ms without hitting the server!
    const response = NextResponse.json({ success: true, numbers: allNumbers }, { status: 200 });
    response.headers.set("Cache-Control", "private, max-age=60, s-maxage=60");

    return response;

  } catch (error) {
    console.error("Error fetching WhatsApp numbers:", error);
    return NextResponse.json(
      { success: false, message: "Internal Server Error" }, 
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
