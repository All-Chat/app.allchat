/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SheetSyncConfig from "@/models/SheetSyncConfig";
import User from "@/models/User";
import Message from "@/models/Message";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPriceForCategory } from "@/lib/billing";
import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String,
  amount: Number,
  description: String,
  status: String,
  createdAt: { type: Date, default: Date.now },
  metadata: Object
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

function cleanStr(val: any): string {
  if (val == null) return "";
  let s = String(val).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}

function resolveCredentials(user: any, payer: any) {
  let PHONE_NUMBER_ID = user?.whatsappPhoneNumberId || payer?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  let ACCESS_TOKEN = user?.whatsappAccessToken || payer?.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";

  if (user?.whatsappNumbers?.length > 0) {
    const active = user.whatsappNumbers.find((n: any) => n.isActive) || user.whatsappNumbers[0];
    PHONE_NUMBER_ID = active.whatsappPhoneNumberId || active.phoneNumberId || PHONE_NUMBER_ID;
    ACCESS_TOKEN = active.whatsappAccessToken || active.accessToken || ACCESS_TOKEN;
  } else if (payer?.whatsappNumbers?.length > 0) {
    const active = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0];
    PHONE_NUMBER_ID = active.whatsappPhoneNumberId || active.phoneNumberId || PHONE_NUMBER_ID;
    ACCESS_TOKEN = active.whatsappAccessToken || active.accessToken || ACCESS_TOKEN;
  }
  return { PHONE_NUMBER_ID, ACCESS_TOKEN };
}

function parseLine(line: string) {
  const cells: string[] = [];
  let curCell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      cells.push(curCell.trim().replace(/^"|"$/g, ""));
      curCell = "";
    } else curCell += char;
  }
  cells.push(curCell.trim().replace(/^"|"$/g, ""));
  return cells;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await User.findById(session.user.id);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payer = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) payer = parent;
    }

    const { configId, templateName, languageCode, category, variableMappings, mediaUrl } = await req.json();

    const config = await SheetSyncConfig.findOne({ _id: configId, userId: session.user.id });
    if (!config) return NextResponse.json({ error: "Sync config not found" }, { status: 404 });

    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = resolveCredentials(user.toObject(), payer.toObject());
    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return NextResponse.json({ error: "WhatsApp credentials not configured." }, { status: 400 });

    // Fetch Template Header Format from Meta
    let headerFormat = "TEXT";
    try {
      const tplRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/message_templates?name=${encodeURIComponent(templateName)}`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
      const tplData = await tplRes.json();
      const tpl = tplData?.data?.[0];
      if (tpl?.components?.length > 0) {
        const hComp = tpl.components.find((c: any) => c.type === "HEADER");
        if (hComp) headerFormat = hComp.format || "TEXT";
        // buttons component present (no-op for now)
        const bComp = tpl.components.find((c: any) => c.type === "BUTTONS");
        if (bComp?.buttons) { /* intentionally left blank */ }
      }
    } catch (e) { console.error("Template fetch failed", e); }

    // Fetch Google Sheet Data
    const match = config.sheetUrl.match(/\/d\/(.*?)(\/|$)/);
    if (!match || !match[1]) return NextResponse.json({ error: "Invalid Sheet URL in config" }, { status: 400 });
    
    const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    const sheetRes = await fetch(csvUrl);
    if (!sheetRes.ok) return NextResponse.json({ error: "Failed to fetch Google Sheet" }, { status: 400 });

    const text = await sheetRes.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return NextResponse.json({ error: "Sheet is empty or has no data rows" }, { status: 400 });

    const headers = parseLine(lines[0]);
    const phoneIdx = headers.indexOf(config.numberField);
    
    if (phoneIdx === -1) return NextResponse.json({ error: `Phone column '${config.numberField}' not found in sheet` }, { status: 400 });

    // Map variable indices
    const varIndices = (variableMappings || []).map((map: string) => map && map !== "skip" ? headers.indexOf(map) : -1);

    // Upload media if needed
    let uploadedMediaId: string | null = null;
    const validMediaTypes = ["image", "video", "document"];
    const needsMedia = validMediaTypes.includes(headerFormat.toLowerCase());

    if (needsMedia && mediaUrl) {
      try {
        const downloadRes = await fetch(mediaUrl);
        const blob = await downloadRes.blob();
        const formData = new FormData();
        formData.append("file", blob, "media");
        formData.append("messaging_product", "whatsapp");

        const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.id) uploadedMediaId = uploadData.id;
      } catch (e) { console.error("Media upload failed", e); }
    }

    // Process rows
    let sentCount = 0;
    let failedCount = 0;
    let totalDeducted = 0;
    const cat = (category || "MARKETING").toUpperCase();
    const messagePrice = getPriceForCategory(payer, cat);

    // Limit to 500 per request to prevent timeouts
    const maxLimit = Math.min(lines.length - 1, 500);

    for (let i = 1; i <= maxLimit; i++) {
      const row = parseLine(lines[i]);
      let phone = cleanStr(row[phoneIdx]).replace(/[^\d+]/g, "");
      if (phone.startsWith("+")) phone = phone.substring(1);

      if (phone.length < 7) { failedCount++; continue; }

      if (messagePrice > 0 && (payer.balance || 0) < messagePrice) {
        return NextResponse.json({ 
          success: false, 
          message: `Insufficient balance. Stopped at ${sentCount} messages.`, 
          sentCount, 
          failedCount 
        }, { status: 402 });
      }

      const variables = varIndices.map((idx: number) => idx !== -1 ? cleanStr(row[idx]) : "");

      const components: any[] = [];
      if (needsMedia && uploadedMediaId) {
        const headerType = headerFormat.toLowerCase();
        const param: any = { type: headerType };
        if (headerType === "image") param.image = { id: uploadedMediaId };
        else if (headerType === "video") param.video = { id: uploadedMediaId };
        else if (headerType === "document") param.document = { id: uploadedMediaId, filename: "document.pdf" };
        components.push({ type: "header", parameters: [param] });
      }

      if (variables.length > 0) {
        components.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: v })) });
      }

      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: { name: templateName, language: { code: languageCode }, components },
      };

      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        const wamid = data?.messages?.[0]?.id;

        if (res.ok || wamid) {
          sentCount++;
          if (messagePrice > 0) {
            payer.balance = Math.max(0, Math.round(((payer.balance || 0) - messagePrice) * 100) / 100);
            totalDeducted += messagePrice;
          }
          
          await Message.create({
            userId: session.user.id,
            phone,
            text: `[Template: ${templateName}]`,
            direction: "out",
            messageType: "template",
            mediaUrl: uploadedMediaId || mediaUrl || null,
            whatsappMessageId: wamid,
            status: "sent",
            templateName,
            templateLanguage: languageCode,
            whatsappPhoneNumberId: PHONE_NUMBER_ID,
          });
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
      }
    }

    if (totalDeducted > 0) {
      await payer.save();
      await Transaction.create({
        userId: payer._id,
        type: "campaign_usage",
        amount: totalDeducted,
        description: `Sheet Campaign sent: ${templateName}`,
        status: "success",
        createdAt: new Date(),
        metadata: { sentCount, failedCount, sentBy: session.user.id }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Campaign completed. Sent: ${sentCount}, Failed: ${failedCount}`,
      sentCount,
      failedCount,
      balance: payer.balance,
    });

  } catch (error: any) {
    console.error("Sheet Campaign Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
