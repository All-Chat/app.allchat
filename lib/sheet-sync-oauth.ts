/* eslint-disable @typescript-eslint/no-explicit-any */
import { google } from "googleapis";
import User from "@/models/User";
import { connectDB } from "@/lib/mongodb";

function buildOAuthClient(user: any) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`
  );
  
  oauth2Client.setCredentials({
    access_token: user.googleTokens?.access_token,
    refresh_token: user.googleTokens?.refresh_token,
    expiry_date: user.googleTokens?.expiry_date,
  });

  oauth2Client.on('tokens', async (tokens) => {
    await connectDB();
    await User.findByIdAndUpdate(user._id, {
      $set: {
        "googleTokens.access_token": tokens.access_token || user.googleTokens?.access_token,
        "googleTokens.refresh_token": tokens.refresh_token || user.googleTokens?.refresh_token,
        "googleTokens.expiry_date": tokens.expiry_date || user.googleTokens?.expiry_date,
      }
    });
  });

  return oauth2Client;
}

export async function syncSheetCampaignToGoogleSheet(
  userId: string, 
  campaign: any, 
  reportData: any[], 
  additionalFields: string[] = []
): Promise<{ url: string | null, id: string | null }> {
  await connectDB();
  const user = await User.findById(userId);
  
  if (!user?.googleTokens?.refresh_token) {
    return { url: null, id: null };
  }

  const oauth2Client = buildOAuthClient(user);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  let spreadsheetId = campaign.reportSpreadsheetId;
  let spreadsheetUrl = campaign.reportSpreadsheetUrl;

  try {
    if (!spreadsheetId) {
      console.log(`[Sheet Sync] Creating new Report Spreadsheet for: ${campaign.name}`);
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: `Campaign Report: ${campaign.name}`.substring(0, 100) }
        }
      });
      spreadsheetId = createRes.data.spreadsheetId;
      spreadsheetUrl = createRes.data.spreadsheetUrl;
    }

    if (!spreadsheetId) return { url: null, id: null };

    const meta: any = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsArr = meta.data.sheets || [];
    let sheetId: number = (sheetsArr[0]?.properties?.sheetId as number) || 0;
    let sheetFound = false;

    for (const sheet of sheetsArr) {
      if (sheet?.properties?.title === "Report") {
        sheetId = (sheet.properties?.sheetId as number) || 0;
        sheetFound = true;
        break;
      }
    }

    if (!sheetFound) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId, title: "Report" }, fields: "title" } }] }
      });
    }

    const sheetName = "Report";
    const HEADERS = ["Name", "Phone", ...additionalFields, "Status", "Reply 1", "Reply 2", "Reply 3", "Reply 4", "Reply 5"];
    
    // ✅ Map data EXACTLY as the frontend UI table does
    const rows = reportData.map((d: any) => {
      const replies = d.replies || [];
      const paddedReplies = [...replies];
      while (paddedReplies.length < 5) paddedReplies.push("");
      
      const statusStr = d.isReplied ? "Replied" : d.status;
      
      return [
        String(d.name || "Unknown").trim(),
        String(d.phone || "").trim(),
        ...(d.additionalData || []),
        String(statusStr || "Unknown").trim(),
        ...paddedReplies.map(r => String(r || "").trim())
      ];
    });

    const values = [HEADERS, ...rows];

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A1:Z100000` });
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${sheetName}!A1`, valueInputOption: "RAW", requestBody: { values },
    });
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        }],
      },
    });

    console.log(`✅ [Google Sheets] Successfully updated Report Spreadsheet: ${spreadsheetUrl}`);
    return { url: spreadsheetUrl, id: spreadsheetId };

  } catch (error: any) {
    console.error(`❌ [Sheet Sync] Error writing to Google Sheet:`, error.message);
    return { url: null, id: null };
  }
}
