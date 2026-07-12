 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SheetCampaign from "@/models/SheetCampaign";
import SheetSyncConfig from "@/models/SheetSyncConfig";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}


export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    
    const name = cleanStr(formData.get("name"));
    const sheetConfigId = cleanStr(formData.get("sheetConfigId"));
    const templateName = cleanStr(formData.get("templateName"));
    const languageCode = cleanStr(formData.get("languageCode"));
    const templateCategory = cleanStr(formData.get("templateCategory"));
    const mediaType = cleanStr(formData.get("mediaType"));
    const status = cleanStr(formData.get("status")) || "saved";
    const scheduledAt = cleanStr(formData.get("scheduledAt"));
    const file = formData.get("file") as File | null;

    let variableMappings: string[] = [];
    try {
      variableMappings = JSON.parse(cleanStr(formData.get("variableMappings")) || "[]");
    } catch { variableMappings = []; }

    if (!name || !sheetConfigId || !templateName) {
      return NextResponse.json({ error: "Name, Sheet Config, and Template are required" }, { status: 400 });
    }

    // Count total messages from sheet
    const config = await SheetSyncConfig.findOne({ _id: sheetConfigId, userId: session.user.id });
    if (!config) return NextResponse.json({ error: "Sheet config not found" }, { status: 404 });

    let totalMessages = 0;
    try {
      const match = config.sheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match && match[1]) {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
        const sheetRes = await fetch(csvUrl);
        if (sheetRes.ok) {
          const text = await sheetRes.text();
          const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
          totalMessages = lines.length > 0 ? lines.length - 1 : 0; // Subtract header
        }
      }
    } catch (e) { console.error("Failed to count sheet rows", e); }

    let mediaUrl = cleanStr(formData.get("mediaUrl"));

    // Upload File to Meta if provided
    if (file) {
      const user = await User.findById(session.user.id);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

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

      if (PHONE_NUMBER_ID && ACCESS_TOKEN) {
        const metaFormData = new FormData();
        metaFormData.append("file", file);
        metaFormData.append("messaging_product", "whatsapp");

        const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          body: metaFormData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.id) mediaUrl = uploadData.id;
      }
    }

    const newCampaign = await SheetCampaign.create({
      userId: session.user.id,
      tenantId: (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null,
      name,
      sheetConfigId,
      templateName,
      languageCode,
      templateCategory,
      variableMappings,
      mediaUrl,
      mediaType,
      status,
      scheduledAt: scheduledAt || null,
      totalMessages,
    });

    return NextResponse.json({ success: true, campaign: newCampaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
