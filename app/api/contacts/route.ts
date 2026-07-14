/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Contact from "@/models/Contact";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag");
    const phone = searchParams.get("phone");

    // ✅ If a phone number is provided, fetch ONLY that contact
    if (phone) {
      const cleanPhone = phone.replace(/\+/g, "");
      const contact = await Contact.findOne({ 
        userId: session.user.id, 
        phone: cleanPhone 
      }).select("phone name tags profilePicUrl -_id").lean(); // ✅ Added profilePicUrl
      
      return NextResponse.json({ success: true, contact });
    }

    // Build query for list (if no phone is provided)
    const query: any = { userId: session.user.id };
    if (tag) {
      query.tags = tag; 
    }

    const contacts = await Contact.find(query).select("phone name tags profilePicUrl -_id").lean();
    return NextResponse.json({ success: true, contacts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
