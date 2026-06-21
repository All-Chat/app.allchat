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
