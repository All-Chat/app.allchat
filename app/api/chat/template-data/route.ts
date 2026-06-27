/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/chat/template-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const language = searchParams.get("language") || "en";
    
    if (!name) return NextResponse.json({ success: false, error: "Missing name" }, { status: 400 });

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const user = await User.findById(session.user.id);
    
    // ✅ FIX: Use WABA_ID and ACCESS_TOKEN as per your snippet
    const WABA_ID = user?.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const ACCESS_TOKEN = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if (!WABA_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, error: "WhatsApp Business Account ID or Access Token not configured." }, { status: 400 });
    }

    // 1. Try fetching from Local DB first
    try {
      const { default: Template } = await import("@/models/Template");
      const localTpl = await Template.findOne({ name, userId: session.user.id }).lean();
      if (localTpl) {
        let headerText = "";
        let bodyText = "";
        let footer = "";
        let buttons: any[] = [];
        let headerType = "none";

        const components = localTpl.components || localTpl.templateComponents || [];
        for (const comp of components) {
          if (comp.type === "HEADER") {
            headerType = (comp.format || "text").toLowerCase();
            if (comp.format === "TEXT") headerText = comp.text || "";
          }
          if (comp.type === "BODY") bodyText = comp.text || "";
          if (comp.type === "FOOTER") footer = comp.text || "";
          if (comp.type === "BUTTONS") {
            buttons = (comp.buttons || []).map((b: any) => ({
              type: (b.type || "").toLowerCase() === "quick_reply" ? "quick_reply" : (b.type || "").toLowerCase(),
              text: b.text || b.title || "",
              url: b.url,
              phone_number: b.phone_number
            }));
          }
        }

        return NextResponse.json({
          success: true,
          template: {
            templateName: localTpl.name,
            templateHeaderText: headerText,
            templateBodyText: bodyText,
            templateFooter: footer,
            templateButtons: buttons,
            templateHeaderType: headerType
          }
        });
      }
    } catch (e) {
      // Template model might not exist, proceed to Meta API
    }

    // 2. Fetch from Meta API using WABA_ID
    const url = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates?name=${encodeURIComponent(name)}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      cache: "no-store"
    });
    
    const data = await res.json();
    const tpls = data?.data || [];
    
    // Find the template matching the language, or fallback to the first one
    const tpl = tpls.find((t: any) => t.language === language) || tpls[0];
    
    if (!tpl) return NextResponse.json({ success: false, error: "Template not found on Meta" }, { status: 404 });

    let headerText = "";
    let bodyText = "";
    let footer = "";
    let buttons: any[] = [];
    let headerType = "none";

    for (const comp of tpl.components || []) {
      if (comp.type === "HEADER") {
        headerType = (comp.format || "none").toLowerCase();
        if (comp.format === "TEXT") headerText = comp.text || "";
      } else if (comp.type === "BODY") {
        bodyText = comp.text || "";
      } else if (comp.type === "FOOTER") {
        footer = comp.text || "";
      } else if (comp.type === "BUTTONS") {
        buttons = (comp.buttons || []).map((b: any) => ({
          type: (b.type || "").toLowerCase() === "quick_reply" ? "quick_reply" : (b.type || "").toLowerCase(),
          text: b.text || b.title || "",
          url: b.url,
          phone_number: b.phone_number
        }));
      }
    }

    return NextResponse.json({
      success: true,
      template: {
        templateName: tpl.name,
        templateHeaderText: headerText,
        templateBodyText: bodyText,
        templateFooter: footer,
        templateButtons: buttons,
        templateHeaderType: headerType
      }
    });

  } catch (error) {
    console.error("Template data fetch error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
