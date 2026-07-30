/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/chat/template-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    const language = searchParams.get("language") || "en";
    const wabaIdParam = searchParams.get("whatsappPhoneNumberId");
    
    if (!name) return NextResponse.json({ success: false, error: "Missing name" }, { status: 400 });

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    await connectDB();
    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId wabaId whatsappAccessToken whatsappNumbers").lean();
    if (!currentUser) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // ✅ STEP 1: Build an array of User IDs that belong to the same tenant group
    const userIds: mongoose.Types.ObjectId[] = [new mongoose.Types.ObjectId(session.user.id)];
    let tenantIdToSearch: string | null = null;

    if (currentUser.isTenant) {
      tenantIdToSearch = currentUser.tenantId || currentUser._id.toString();
    } else if (currentUser.parentTenantId) {
      tenantIdToSearch = currentUser.parentTenantId;
    }

    if (tenantIdToSearch) {
      const tenantUser = await User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("_id").lean();
      if (tenantUser && !userIds.some(id => id.equals(tenantUser._id))) userIds.push(tenantUser._id);
      
      const subUsers = await User.find({ parentTenantId: tenantIdToSearch }).select("_id").lean();
      subUsers.forEach(u => {
        if (!userIds.some(id => id.equals(u._id))) userIds.push(u._id);
      });
    }

    // ✅ STEP 2: Determine which WABA_ID and ACCESS_TOKEN to use for Meta API
    let WABA_ID = currentUser.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    let ACCESS_TOKEN = currentUser.whatsappAccessToken || process.env.META_ACCESS_TOKEN;

    if ((!WABA_ID || !ACCESS_TOKEN || wabaIdParam) && tenantIdToSearch) {
        const usersToCheck = await User.find({ _id: { $in: userIds } }).select("wabaId whatsappAccessToken whatsappNumbers").lean();
        for (const u of usersToCheck) {
            if (wabaIdParam) {
                const numMatch = u.whatsappNumbers?.find((n: any) => n.whatsappPhoneNumberId === wabaIdParam);
                if (numMatch?.whatsappAccessToken) {
                    WABA_ID = u.wabaId || WABA_ID;
                    ACCESS_TOKEN = numMatch.whatsappAccessToken;
                    break;
                }
            } else if (u.wabaId && u.whatsappAccessToken) {
                WABA_ID = u.wabaId;
                ACCESS_TOKEN = u.whatsappAccessToken;
                break;
            }
        }
    }

    // 1. Try fetching from Local DB first
    try {
      const { default: Template } = await import("@/models/Template");
      const localTpl = await Template.findOne({ name, userId: { $in: userIds } }).lean();
      
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

    if (!WABA_ID || !ACCESS_TOKEN) {
      return NextResponse.json({ success: false, error: "WhatsApp credentials not configured." }, { status: 400 });
    }

    // 2. Fetch from Meta API using WABA_ID
    const url = `https://graph.facebook.com/v21.0/${WABA_ID}/message_templates?name=${encodeURIComponent(name)}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      cache: "no-store"
    });
    
    const data = await res.json();
    const tpls = data?.data || [];
    
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
