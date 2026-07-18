/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import Message from "@/models/Message";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// ✅ Date formatter for Google Sheets
function formatSheetDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isValidReply(msg: any): boolean {
  const text = (msg.text || "").trim();
  if (msg.messageType && ["image", "video", "audio", "document", "sticker", "location", "contacts", "interactive", "button"].includes(msg.messageType)) return true;
  if (!text) return false;
  if (/^\[.*\]$/.test(text)) return false;
  return true;
}

function getDisplayStatus(rawStatus: string, repliesCount: number): string {
  if (repliesCount > 0) return `Replied (${repliesCount})`;
  const status = (rawStatus || "").trim().toLowerCase();
  switch (status) {
    case "read": return "Read";
    case "delivered": return "Delivered";
    case "sent": return "Sent";
    case "failed": return "Failed";
    case "invalid": return "Invalid Number";
    case "duplicate": return "Duplicate";
    case "pending":
    case "queued":
    case "": return "Pending";
    default: return rawStatus ? (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)) : "Unknown";
  }
}

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

    // ✅ 1. Fetch the User to get their Google Tokens
    const user = await User.findById(session.user.id);
    if (!user?.googleTokens?.access_token || !user?.googleTokens?.refresh_token) {
      return NextResponse.json({ error: "Please connect your Google Account in Integrations first." }, { status: 400 });
    }

    // ✅ Remove .lean() so we can save the document later
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== session.user.id) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const additionalFields: string[] = campaign.additionalFields || [];

    // 2. Process Replies
    const campaignPhonesList = (campaign.reportData || [])
      .map((item: any) => normalizePhone(item.phone).slice(-10))
      .filter((p: string) => p.length >= 7);

    const tempRepliesMap: Record<string, string[]> = {};

    if (campaignPhonesList.length > 0) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const campaignCreated = new Date(campaign.createdAt);
      const since = campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

      const messages = await Message.find({ userId: session.user.id, direction: "in", createdAt: { $gte: since } }).sort({ createdAt: 1 }).lean();

      for (const msg of messages) {
        const msgPhoneLast10 = normalizePhone(msg.phone).slice(-10);
        if (msgPhoneLast10 && campaignPhonesList.includes(msgPhoneLast10)) {
          if (!isValidReply(msg)) continue;
          if (!tempRepliesMap[msgPhoneLast10]) tempRepliesMap[msgPhoneLast10] = [];
          if (tempRepliesMap[msgPhoneLast10].length < 5) {
            let displayText = (msg.text || "").trim();
            if (!displayText && msg.messageType && msg.messageType !== "text") displayText = `[${msg.messageType}]`;
            tempRepliesMap[msgPhoneLast10].push(displayText);
          }
        }
      }
    }

    const repliesMap: Record<string, string[]> = {};
    for (const item of campaign.reportData || []) {
      const p10 = normalizePhone(item.phone).slice(-10);
      if (tempRepliesMap[p10] && tempRepliesMap[p10].length > 0) repliesMap[item.phone] = tempRepliesMap[p10];
    }

    // 3. Build the data rows
    const reportDataForSheet: any[] = (campaign.reportData || []).map((item: any) => {
      let replies: string[] = [];
      if (item.phone && repliesMap[item.phone]?.length > 0) replies = repliesMap[item.phone];
      else if (Array.isArray(item.replies) && item.replies.length > 0) replies = item.replies;
      else if (item.reply) replies = [item.reply];
      
      const row: any = {
        name: String(item.name || "").trim() || "N/A",
        phone: String(item.phone || "").trim() || "N/A",
        status: getDisplayStatus(String(item.status || ""), replies.length),
        error: String(item.error || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).join(", ") : "",
        deliveredTime: formatSheetDate(item.deliveredAt),
        readTime: formatSheetDate(item.readAt),
        repliedTime: formatSheetDate(item.repliedAt),
      };

      additionalFields.forEach((field, idx) => row[field] = item.additionalData?.[idx] || "");

      for (let i = 1; i <= 5; i++) {
        const replyText = replies[i - 1] || "";
        row[`Reply ${i}`] = replyText;
        if (replyText) {
          row[`Reply ${i} Time`] = formatSheetDate(item.replyTimes?.[i - 1] || item.repliedAt);
        } else {
          row[`Reply ${i} Time`] = "";
        }
      }
      
      return row;
    });

    if (reportDataForSheet.length === 0) return NextResponse.json({ success: false, message: "No report data to sync" }, { status: 400 });

    // 4. Prepare Headers and Rows Array
    const headers = [
      "Name", "Phone Number",
      ...additionalFields,
      "Status", "Delivered Time", "Read Time", "Replied Time",
      "Error Reason", "Tags"
    ];
    for (let i = 1; i <= 5; i++) {
      headers.push(`Reply ${i}`, `Reply ${i} Time`);
    }

    const rows = reportDataForSheet.map((item) => {
      const row = [
        item.name, item.phone,
        ...additionalFields.map((field) => item[field] || ""),
        item.status, item.deliveredTime, item.readTime, item.repliedTime,
        item.error, item.tags
      ];
      for (let i = 1; i <= 5; i++) {
        row.push(item[`Reply ${i}`] || "", item[`Reply ${i} Time`] || "");
      }
      return row;
    });

    // ✅ 5. Initialize Google Auth using the USER's OAuth2 Tokens
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    );

    oauth2Client.setCredentials({
      access_token: user!.googleTokens!.access_token,
      refresh_token: user!.googleTokens!.refresh_token,
      expiry_date: user!.googleTokens!.expiry_date,
    });

    // ✅ Automatically refresh the token in DB if it expires during the request
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        if (!user || !user.googleTokens) return;
        user.googleTokens.access_token = tokens.access_token;
        user.googleTokens.expiry_date = tokens.expiry_date;
        try { await user.save(); } catch (e) { /* ignore save errors */ }
      }
    });

    const sheets = google.sheets({ version: "v4", auth: oauth2Client as any, timeout: 15000 });
    const drive = google.drive({ version: "v3", auth: oauth2Client as any, timeout: 15000 });

    let spreadsheetId = "";
    let wasCreated = false;

    // 6. Check if standalone sheet already exists in DB
    if (campaign.standaloneSheetUrl) {
      const match = campaign.standaloneSheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match && match[1]) spreadsheetId = match[1];
    }

    // 7. If it DOES NOT exist, create a brand new standalone sheet in USER's Drive
    if (!spreadsheetId) {
      const createResponse = await drive.files.create({
        requestBody: {
          name: `${campaign.name} - Report`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
      });

      spreadsheetId = createResponse.data.id as string;
      const newSheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      // Save the URL to the database
      campaign.standaloneSheetUrl = newSheetUrl;
      
      // ✅ CRITICAL: Force Mongoose to recognize the change and persist it
      campaign.markModified('standaloneSheetUrl'); 
      await campaign.save();
      wasCreated = true;
    }

    // 8. Force update the data inside the sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "RAW",
      requestBody: {
        values: [headers, ...rows],
      },
    });

    // 9. Format the sheet (Bold headers & auto-resize)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: headers.length,
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      message: wasCreated ? "Standalone sheet created successfully" : "Standalone sheet updated successfully",
      url: campaign.standaloneSheetUrl,
      created: wasCreated
    });

  } catch (error: any) {
    console.error("RAW GOOGLE ERROR:", JSON.stringify(error?.response?.data?.error || error.message, null, 2));
    return NextResponse.json({ error: error.message || "Failed to create sheet" }, { status: 500 });
  }
}
