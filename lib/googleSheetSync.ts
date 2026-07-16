/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from "googleapis";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";

// ─── SHARED: Build OAuth client ──────────────────────────────────────────────
function buildOAuthClient(user: any) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`
  );
  oauth2Client.setCredentials({
    access_token: user.googleTokens.access_token,
    refresh_token: user.googleTokens.refresh_token,
    expiry_date: user.googleTokens.expiry_date,
  });
  return oauth2Client;
}

// ─── SHARED: Ensure a sheet tab exists, return its sheetId ──────────────────
async function ensureSheetTab(
  sheets: any,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(
    (s: any) => s.properties?.title === sheetName
  );
  if (existing) return existing.properties.sheetId;

  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });
  return addRes.data.replies?.[0].addSheet?.properties?.sheetId;
}

// ─── SHARED: Bold a header row ───────────────────────────────────────────────
async function boldHeaderRow(
  sheets: any,
  spreadsheetId: string,
  sheetId: number,
  columnCount: number
) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: columnCount,
            },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
      ],
    },
  });
}

// ✅ Helper to sanitize sheet names (Google doesn't allow special chars or >31 chars)
function sanitizeSheetName(name: string): string {
  let n = name.replace(/[\[\]\?\/\\\*\:]/g, " ").trim();
  if (n.length > 31) n = n.substring(0, 31);
  return n || "Campaign Report";
}

// ─── MAIN: Sync campaign report to Google Sheet ──────────────────────────────
export async function syncCampaignToGoogleSheet(userId: string, campaign: any) {
  await connectDB();

  const user = await User.findById(userId);
  
  if (!user?.googleSheetId) throw new Error("Google Sheet ID not found in user settings.");
  if (!user?.googleTokens?.refresh_token) throw new Error("Google refresh token not found. Please reconnect your Google Account.");

  const oauth2Client = buildOAuthClient(user);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const spreadsheetId = user.googleSheetId;

  const sheetName = sanitizeSheetName(campaign.name || "Campaign");
  const sheetId = await ensureSheetTab(sheets, spreadsheetId, sheetName);

  const additionalFields: string[] = campaign.additionalFields || [];

  // ✅ NEW: Updated HEADERS to include Time columns
  const HEADERS = [
    "Name",
    "Phone",
    ...additionalFields,
    "Status",
    "Delivered Time",
    "Read Time",
    "Replied Time",
    "Error",
    "Tags",
    "Reply 1",
    "Reply 1 Time",
    "Reply 2",
    "Reply 2 Time",
    "Reply 3",
    "Reply 3 Time",
    "Reply 4",
    "Reply 4 Time",
    "Reply 5",
    "Reply 5 Time",
  ];

  // ✅ NEW: Updated row mapping to include the Time columns
  const rows = (campaign.reportData || []).map((d: any) => {
    const row = [
      String(d.name || "N/A").trim(),
      String(d.phone || "N/A").trim(),
    ];

    additionalFields.forEach((field) => {
      row.push(String(d[field] || "").trim());
    });

    row.push(String(d.status || "Unknown").trim());
    row.push(String(d.deliveredTime || "").trim()); // Delivered Time
    row.push(String(d.readTime || "").trim());       // Read Time
    row.push(String(d.repliedTime || "").trim());    // Replied Time
    row.push(String(d.error || "").trim());
    row.push(Array.isArray(d.tags) ? d.tags.filter(Boolean).join(", ") : String(d.tags || "").trim());
    
    // Loop to push Reply and Reply Time pairs
    for (let i = 1; i <= 5; i++) {
      row.push(String(d[`Reply ${i}`] || "").trim());
      row.push(String(d[`Reply ${i} Time`] || "").trim());
    }

    return row;
  });

  const values = [HEADERS, ...rows];

  // Clear → write → bold
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  await boldHeaderRow(sheets, spreadsheetId, sheetId, HEADERS.length);

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}

// ─── Sync Test Messages to Google Sheets ────────────────────────────────────
export async function syncTestMessageToGoogleSheet(
  userId: string,
  data: {
    name?: string;
    phone: string;
    status?: string;
    reply?: string;
    templateName?: string;
  },
  createIfNotFound = true
) {
  await connectDB();

  const user = await User.findById(userId);
  if (!user?.googleSheetId || !user?.googleTokens?.refresh_token) return;

  const oauth2Client = buildOAuthClient(user);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const spreadsheetId = user.googleSheetId;
  const sheetName = "Test Messages";

  const sheetId = await ensureSheetTab(sheets, spreadsheetId, sheetName);

  const checkRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:E1`,
  });
  if (!checkRes.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:E1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Name", "Phone Number", "Status", "Reply", "Template Name"]],
      },
    });
    await boldHeaderRow(sheets, spreadsheetId, sheetId, 5);
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:E1000`,
  });

  const rows = response.data.values || [];
  let rowIndexToUpdate = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]?.[1] === data.phone) {
      rowIndexToUpdate = i;
      break;
    }
  }

  if (rowIndexToUpdate !== -1) {
    const currentRow = rows[rowIndexToUpdate] || [];

    let finalReply = currentRow[3] || "No Reply";
    if (data.reply) {
      const existingStr =
        currentRow[3] && currentRow[3] !== "No Reply" ? currentRow[3] : "";
      if (existingStr) {
        let arr = existingStr.split(" | ");
        arr.push(data.reply);
        if (arr.length > 5) arr = arr.slice(arr.length - 5);
        finalReply = arr.join(" | ");
      } else {
        finalReply = data.reply;
      }
    }

    const rowData = [
      data.name || currentRow[0] || "-",
      data.phone,
      data.status || currentRow[2] || "sent",
      finalReply,
      data.templateName || currentRow[4] || "N/A",
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndexToUpdate + 2}:E${rowIndexToUpdate + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });
  } else if (createIfNotFound) {
    const rowData = [
      data.name || "-",
      data.phone,
      data.status || "sent",
      data.reply || "No Reply",
      data.templateName || "N/A",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowData] },
    });
  }
}
