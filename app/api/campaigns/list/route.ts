/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Template from "@/models/Template"; // ✅ Import your Template model
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  createdAt?: any; // ✅ Injected from DB
  updatedAt?: any; // ✅ Injected from DB (Approval/Saved time)
  components?: any[];
  [key: string]: any;
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
    
    const WABA_ID = user?.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const ACCESS_TOKEN = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if (!WABA_ID || !ACCESS_TOKEN) {
      return NextResponse.json({
        success: false,
        message: "WhatsApp Business Account ID or Access Token not configured. Please update your Settings.",
      }, { status: 400 });
    }

    // 3. Fetch templates from DB to get exact createdAt and updatedAt timestamps
    const dbTemplates = await Template.find({ userId }).lean();
    const dbTemplateMap = new Map();
    
    dbTemplates.forEach((t: any) => {
      // Match by Meta's template ID or name
      const metaId = t.metaId || t.id;
      if (metaId) dbTemplateMap.set(metaId, t);
      if (t.name) dbTemplateMap.set(t.name, t);
    });

    // 4. Fetch templates from Meta API (Restoring your previous code)
    let url: string | null = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates?fields=id,name,status,category,language,created_at,components`;
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

    // 5. Merge Meta data with DB timestamps
    const finalTemplates = allTemplates.map((metaTpl) => {
      const dbTpl = dbTemplateMap.get(metaTpl.id) || dbTemplateMap.get(metaTpl.name);
      
      return {
        ...metaTpl,
        // ✅ Only take createdAt from DB (fallback to Meta's created_at if missing in DB)
        createdAt: dbTpl?.createdAt || metaTpl.created_at,
        // ✅ Take updatedAt from DB (represents when it was approved/saved in your system)
        updatedAt: dbTpl?.updatedAt || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: finalTemplates.length,
      templates: finalTemplates,
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
