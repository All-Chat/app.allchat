/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Contact from "@/models/Contact";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action, tagName, phone, name } = await req.json();
    
    if (!tagName || !phone) {
      return NextResponse.json({ error: "Tag name and phone are required" }, { status: 400 });
    }

    const userId = session.user.id;

    if (action === "add") {
      // Add tag to contact (create contact if doesn't exist)
      await Contact.findOneAndUpdate(
        { userId, phone: phone.trim() },
        { 
          $addToSet: { tags: tagName },
          $set: { name: name || "Unknown" } 
        },
        { upsert: true, new: true }
      );
      return NextResponse.json({ success: true, message: "Number added to tag" });
    } 
    else if (action === "remove") {
      // Remove tag from contact
      await Contact.updateOne(
        { userId, phone: phone.trim() },
        { $pull: { tags: tagName } }
      );
      return NextResponse.json({ success: true, message: "Number removed from tag" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Manage Tag Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
