/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: Request) {
  try {
    await connectDB();
    
    const session = await getServerSession(authOptions);
    const user: any = await User.findOne({ email: session?.user?.email });
    
    // Fallback to env variables if user-specific credentials aren't found
    const phoneNumberId = user?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if (!phoneNumberId || !token) {
      return NextResponse.json({ error: "WhatsApp credentials not found" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Forward the file directly to Meta's API
    const metaFormData = new FormData();
    metaFormData.append("messaging_product", "whatsapp");
    metaFormData.append("file", file);

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: metaFormData,
      }
    );

    const data = await res.json();
    
    if (data.id) {
      return NextResponse.json({ success: true, url: data.id });
    } else {
      return NextResponse.json({ error: data.error?.message || "Meta upload failed" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
