/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import CampaignReport from "@/models/CampaignReport";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

function formatSheetDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
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
    case "pending": case "queued": case "": return "Pending";
    default: return rawStatus ? (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)) : "Unknown";
  }
}

// Helper to get column letter (A, B, C... Z, AA, AB...)
function getColumnLetter(columnIndex: number): string {
  let letter = '';
  while (columnIndex >= 0) {
    letter = String.fromCharCode((columnIndex % 26) + 65) + letter;
    columnIndex = Math.floor(columnIndex / 26) - 1;
  }
  return letter;
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { campaignId } = await req.json();
    if (!campaignId) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

    const user = await User.findById(session.user.id);
    if (!user?.googleTokens?.access_token || !user?.googleTokens?.refresh_token) {
      return NextResponse.json({ error: "Please connect your Google Account in Integrations first." }, { status: 400 });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.userId.toString() !== session.user.id) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const additionalFields: string[] = campaign.additionalFields || [];

    // ✅ FIX: Fetch directly from CampaignReport collection
    const reports = await CampaignReport.find({ campaignId }).lean();

    const reportDataForSheet: any[] = reports.map((item: any) => {
      const replies: string[] = item.replies || (item.reply ? [item.reply] : []);
      
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
        if (replyText) row[`Reply ${i} Time`] = formatSheetDate(item.replyTimes?.[i - 1] || item.repliedAt);
        else row[`Reply ${i} Time`] = "";
      }
      return row;
    });

    if (reportDataForSheet.length === 0) return NextResponse.json({ success: false, message: "No report data to sync" }, { status: 400 });

    const headers = [
      "Name", "Phone Number", ...additionalFields,
      "Status", "Delivered Time", "Read Time", "Replied Time", "Error Reason", "Tags"
    ];
    for (let i = 1; i <= 5; i++) headers.push(`Reply ${i}`, `Reply ${i} Time`);

    const rows = reportDataForSheet.map((item) => {
      const row = [
        item.name, item.phone, ...additionalFields.map((field) => item[field] || ""),
        item.status, item.deliveredTime, item.readTime, item.repliedTime, item.error, item.tags
      ];
      for (let i = 1; i <= 5; i++) row.push(item[`Reply ${i}`] || "", item[`Reply ${i} Time`] || "");
      return row;
    });

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.NEXTAUTH_URL
    );
    oauth2Client.setCredentials({
      access_token: user!.googleTokens!.access_token,
      refresh_token: user!.googleTokens!.refresh_token,
      expiry_date: user!.googleTokens!.expiry_date,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        if (!user || !user.googleTokens) return;
        user.googleTokens.access_token = tokens.access_token;
        user.googleTokens.expiry_date = tokens.expiry_date;
        try { await user.save(); } catch (e) {}
      }
    });

    // ✅ SPEED FIX: Increase timeout and fetch the googleapis instance
    const sheets = google.sheets({ version: "v4", auth: oauth2Client as any, timeout: 60000 });
    const drive = google.drive({ version: "v3", auth: oauth2Client as any, timeout: 60000 });

    let spreadsheetId = "";
    let wasCreated = false;

    if (campaign.standaloneSheetUrl) {
      const match = campaign.standaloneSheetUrl.match(/\/d\/(.*?)(\/|$)/);
      if (match && match[1]) spreadsheetId = match[1];
    }

    if (!spreadsheetId) {
      const createResponse = await drive.files.create({
        requestBody: { name: `${campaign.name} - Report`, mimeType: 'application/vnd.google-apps.spreadsheet' },
      });
      spreadsheetId = createResponse.data.id as string;
      campaign.standaloneSheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      campaign.markModified('standaloneSheetUrl'); 
      await campaign.save();
      wasCreated = true;
    }

    const lastColLetter = getColumnLetter(headers.length - 1);
    const totalRows = rows.length + 1;

    // ✅ CRITICAL FIX: Combine Grid Expansion AND Header Formatting into ONE API call
    // This cuts down API requests and speeds up the process significantly
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                gridProperties: {
                  rowCount: Math.max(totalRows, 1000), // Expand grid to prevent limit errors
                  columnCount: Math.max(headers.length, 26)
                }
              },
              fields: "gridProperties(rowCount,columnCount)"
            }
          },
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            }
          }
        ]
      }
    });

    // ✅ CRITICAL FIX: Write ALL data in ONE single API request
    // Google API can handle 10,000+ rows in a single update easily. This prevents 2-3 min delays.
    const allValues = [headers, ...rows];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A1:${lastColLetter}${totalRows}`,
      valueInputOption: "RAW",
      requestBody: { values: allValues },
    });

    // ✅ SPEED FIX: Auto-resize columns asynchronously (optional, but good for UX)
    // We do this at the very end so it doesn't block the API response
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            autoResizeDimensions: {
              dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: Math.min(headers.length, 15) },
            },
          },
        ],
      },
    }).catch(() => {}); // Ignore errors here, it's just for formatting

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
