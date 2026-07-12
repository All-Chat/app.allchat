/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mediaId = searchParams.get("mediaId");
    if (!mediaId) return NextResponse.json({ error: "Media ID required" }, { status: 400 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let payer = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) payer = parent;
    }

    let PHONE_NUMBER_ID = payer.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    let ACCESS_TOKEN = payer.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";
    if (payer.whatsappNumbers?.length > 0) {
      const active = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0];
      PHONE_NUMBER_ID = active.whatsappPhoneNumberId || PHONE_NUMBER_ID;
      ACCESS_TOKEN = active.whatsappAccessToken || ACCESS_TOKEN;
    }

    if (!ACCESS_TOKEN) return NextResponse.json({ error: "Credentials not found" }, { status: 400 });

    const res = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (!res.ok) return NextResponse.json({ error: "Failed to fetch media" }, { status: 400 });

    const data = await res.json();
    return NextResponse.json({ success: true, url: data.url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
