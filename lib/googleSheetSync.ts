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

// ─── MAIN: Sync campaign report to Google Sheet ──────────────────────────────
// ✅ FIX: Headers now include "Reply 1"–"Reply 5" columns.
//    Rows read d["Reply 1"] … d["Reply 5"] instead of the old d.replies array
//    (which never existed on the data coming from the campaign route).
// ─── MAIN: Sync campaign report to Google Sheet ──────────────────────────────
// ✅ FIX: Dynamically includes additional fields passed from the route
export async function syncCampaignToGoogleSheet(userId: string, campaign: any) {
  await connectDB();

  const user = await User.findById(userId);
  if (!user?.googleSheetId || !user?.googleTokens?.refresh_token) return;

  const oauth2Client = buildOAuthClient(user);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const spreadsheetId = user.googleSheetId;

  // Tab name = campaign name, capped at 100 chars (Google Sheets limit)
  const sheetName = (campaign.name || "Campaign").substring(0, 100);
  const sheetId = await ensureSheetTab(sheets, spreadsheetId, sheetName);

  // ✅ Get additional fields array
  const additionalFields: string[] = campaign.additionalFields || [];

  // ✅ Build headers dynamically
  const HEADERS = [
    "Name",
    "Phone",
    ...additionalFields, // Spread extra columns here
    "Status",
    "Error",
    "Tags",
    "Reply 1",
    "Reply 2",
    "Reply 3",
    "Reply 4",
    "Reply 5",
  ];

  // ✅ Build rows dynamically
  const rows = (campaign.reportData || []).map((d: any) => {
    const row = [
      String(d.name || "N/A").trim(),
      String(d.phone || "N/A").trim(),
    ];

    // Push values for additional fields
    additionalFields.forEach((field) => {
      row.push(String(d[field] || "").trim());
    });

    // Push the remaining standard fields
    row.push(String(d.status || "Unknown").trim());
    row.push(String(d.error || "").trim());
    row.push(Array.isArray(d.tags) ? d.tags.filter(Boolean).join(", ") : String(d.tags || "").trim());
    row.push(String(d["Reply 1"] || "").trim());
    row.push(String(d["Reply 2"] || "").trim());
    row.push(String(d["Reply 3"] || "").trim());
    row.push(String(d["Reply 4"] || "").trim());
    row.push(String(d["Reply 5"] || "").trim());

    return row;
  });

  const values = [HEADERS, ...rows];

  // Clear → write → bold
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A1:Z10000`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  await boldHeaderRow(sheets, spreadsheetId, sheetId, HEADERS.length);
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

  // Write headers if the tab was just created (no data yet)
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

  // Read existing rows to check for this phone number
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

    // Append reply with " | " separator, keep max 5
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
