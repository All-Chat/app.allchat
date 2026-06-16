import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

interface MetaResponse {
  data?: WhatsAppTemplate[];
  paging?: {
    next?: string;
  };
  error?: {
    message: string;
  };
}

export async function GET() {
  try {
    await connectDB();
    
    // 1. Get the current logged-in user's ID
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the user's WhatsApp credentials (multi-tenant)
    const user = await User.findById(userId);
    
    // Use user's specific credentials, fallback to environment variables
    const WABA_ID = user?.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const ACCESS_TOKEN = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if (!WABA_ID || !ACCESS_TOKEN) {
      return NextResponse.json({
        success: false,
        message: "WhatsApp Business Account ID or Access Token not configured. Please update your Settings.",
      }, { status: 400 });
    }

    // 3. Fetch templates using the correct WABA ID and Token
    // Updated to v21.0 to match your other API routes
    let url: string | null = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates`;
    const allTemplates: WhatsAppTemplate[] = [];

    while (url) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        cache: "no-store",
      });

      const data: MetaResponse = await res.json();

      if (!res.ok) {
        return NextResponse.json(
          {
            success: false,
            error: data.error?.message || "Failed to fetch templates",
          },
          { status: res.status }
        );
      }

      if (data.data) {
        allTemplates.push(...data.data);
      }

      url = data.paging?.next ?? null;
    }

    return NextResponse.json({
      success: true,
      count: allTemplates.length,
      templates: allTemplates,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}