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
    if (!session?.user?.id) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const user = await User.findById(session.user.id);
    const token = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
    const wabaId = user?.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!token || !wabaId) {
      return NextResponse.json({ success: false, message: "WhatsApp credentials not configured." }, { status: 400 });
    }

    const allTemplates: any[] = [];
    let url: string | null = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?status=APPROVED&limit=100`;

    while (url) {
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();

      if (!res.ok || data.error) {
        console.error("Meta API error:", data.error);
        return NextResponse.json({ success: false, message: data.error?.message || "Failed to fetch from Meta" }, { status: 500 });
      }

      if (data.data) allTemplates.push(...data.data);
      url = data.paging?.next || null;
    }

    const templates = allTemplates.map((t: any) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      language: t.language,
      components: t.components,
    }));

    return NextResponse.json({ success: true, templates });
  } catch (error: any) {
    console.error("❌ Fetch Templates Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
