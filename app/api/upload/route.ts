/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Media from "@/models/Media";

export async function POST(req: Request) {
  try {
    await connectDB();
    
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    
    let ownerUser: any = null;
    if (userId) {
      ownerUser = await User.findById(userId);
    }

    const phoneNumberId = ownerUser?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = ownerUser?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if (!phoneNumberId || !token) {
      return NextResponse.json({ error: "WhatsApp credentials not found" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    let mediaType: "image" | "video" | "audio" | "document" = "document";
    if (file.type.startsWith("image")) mediaType = "image";
    if (file.type.startsWith("video")) mediaType = "video";
    if (file.type.startsWith("audio")) mediaType = "audio";

    const metaFormData = new FormData();
    metaFormData.append("messaging_product", "whatsapp");
    metaFormData.append("file", file);

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: metaFormData,
      }
    );

    const data = await res.json();
    
    if (data.id) {
      // SAVE TO MEDIA LIBRARY DATABASE
      if (userId) {
        await Media.create({
          userId,
          mediaId: data.id,
          type: mediaType,
          filename: file.name
        });
      }
      return NextResponse.json({ success: true, url: data.id });
    } else {
      return NextResponse.json({ error: data.error?.message || "Meta upload failed" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
