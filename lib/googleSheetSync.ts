/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from "googleapis";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";

export async function syncCampaignToGoogleSheet(userId: string, campaign: any) {
  await connectDB();
  
  const user = await User.findById(userId);
  if (!user?.googleSheetId || !user?.googleTokens?.refresh_token) return;

  // Setup OAuth client with refresh token capability
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`
  );

  oauth2Client.setCredentials({
    access_token: user.googleTokens.access_token,
    refresh_token: user.googleTokens.refresh_token,
    expiry_date: user.googleTokens.expiry_date
  });

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const spreadsheetId = user.googleSheetId;

  // 1. Check if a tab for this campaign exists. If not, create it.
  const sheetName = campaign.name.substring(0, 100); // Sheet tab names max 100 chars
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  let sheetId = meta.data.sheets?.find(s => s.properties?.title === sheetName)?.properties?.sheetId;

  if (!sheetId) {
    const addSheetRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }]
      }
    });
    sheetId = addSheetRes.data.replies?.[0].addSheet?.properties?.sheetId;
  }

  // 2. Prepare the data
  const headers = ["Name", "Phone", "Status", "Replies"];
  const rows = campaign.reportData?.map((d: any) => [
    d.name || "N/A",
    d.phone,
    d.status,
    d.replies?.join(" | ") || "No Reply"
  ]) || [];

  const values = [headers, ...rows];

  // 3. Clear existing data and write new data
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A1:Z10000`
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  // 4. Format header row (bold)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold"
        }
      }]
    }
  });
}

// ✅ NEW: Sync Test Messages to Google Sheets
export async function syncTestMessageToGoogleSheet(
  userId: string, 
  data: { name?: string, phone: string, status?: string, reply?: string, templateName?: string },
  createIfNotFound: boolean = true
) {
  await connectDB();
  
  const user = await User.findById(userId);
  if (!user?.googleSheetId || !user?.googleTokens?.refresh_token) return;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`
  );

  oauth2Client.setCredentials({
    access_token: user.googleTokens.access_token,
    refresh_token: user.googleTokens.refresh_token,
    expiry_date: user.googleTokens.expiry_date
  });

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });
  const spreadsheetId = user.googleSheetId;
  const sheetName = "Test Messages";

  // 1. Check if "Test Messages" tab exists. If not, create it.
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  let sheetId = meta.data.sheets?.find(s => s.properties?.title === sheetName)?.properties?.sheetId;

  if (!sheetId) {
    const addSheetRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }]
      }
    });
    sheetId = addSheetRes.data.replies?.[0].addSheet?.properties?.sheetId;

    // Add Headers to the new tab
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:E1`,
      valueInputOption: "RAW",
      requestBody: { values: [["Name", "Phone Number", "Status", "Reply", "Template Name"]] }
    });

    // Bold the Headers
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold"
          }
        }]
      }
    });
  }

  // 2. Read existing rows to see if this phone number is already logged
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:E1000`
  });

  const rows = response.data.values || [];
  let rowIndexToUpdate = -1;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][1] === data.phone) { // Check Phone Number column (index 1)
      rowIndexToUpdate = i;
      break;
    }
  }

  if (rowIndexToUpdate !== -1) {
    // Update existing row, preserving fields not provided
    const currentRow = rows[rowIndexToUpdate] || [];
    
    // ✅ FIX: Append replies with " | " separator (Max 5)
    let finalReply = currentRow[3] || "No Reply";
    if (data.reply) {
      const existingReplyStr = currentRow[3] && currentRow[3] !== "No Reply" ? currentRow[3] : "";
      if (existingReplyStr) {
        let repliesArray = existingReplyStr.split(" | ");
        repliesArray.push(data.reply);
        // Keep only the latest 5 replies
        if (repliesArray.length > 5) {
          repliesArray = repliesArray.slice(repliesArray.length - 5);
        }
        finalReply = repliesArray.join(" | ");
      } else {
        finalReply = data.reply;
      }
    }

    const rowData = [
      data.name || currentRow[0] || "-",
      data.phone,
      data.status || currentRow[2] || "sent",
      finalReply,
      data.templateName || currentRow[4] || "N/A"
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${rowIndexToUpdate + 2}:E${rowIndexToUpdate + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] }
    });
  } else if (createIfNotFound) {
    // Append new row
    const rowData = [
      data.name || "-",
      data.phone,
      data.status || "sent",
      data.reply || "No Reply",
      data.templateName || "N/A"
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowData] }
    });
  }
}
