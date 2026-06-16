/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import { getServerSession } from "next-auth"; // ADDED
import { authOptions } from "@/lib/auth";      // ADDED

export async function POST(req: Request) {
  await connectDB();
  
  try {
    // 1. Get the current logged-in user's ID
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phone, text } = body;

    if (!phone || !text) {
      return NextResponse.json({ success: false, message: "Missing data" }, { status: 400 });
    }

    // 2. Send to WhatsApp API
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { preview_url: false, body: text },
    };

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    console.log("PHONE_NUMBER_ID:", process.env.WHATSAPP_PHONE_NUMBER_ID);
    const data = await res.json();

    if (!res.ok) {
      console.error("Meta Error:", data);
      return NextResponse.json({ success: false, message: data?.error?.message }, { status: 400 });
    }

    // 3. SAVE TO DATABASE WITH userId (Crucial for showing in the correct user's dashboard)
    await Message.create({
      userId: userId, // ADDED: Tie message to the logged-in user
      phone: phone,
      text: text,
      direction: "out",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, data });

  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}