import { NextResponse } from "next/server";
import { google } from "googleapis";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return sendPopupHTML(`${process.env.NEXTAUTH_URL}/settings?google_error=true`);
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    // If user cancels the Google login
    if (error) {
      return sendPopupHTML(`${process.env.NEXTAUTH_URL}/settings?google_error=true`);
    }

    if (!code) {
      return sendPopupHTML(`${process.env.NEXTAUTH_URL}/settings?google_error=true`);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    
    // Create a new Google Sheet
    const sheet = await drive.files.create({
      requestBody: {
        name: "All Chat CRM - Campaign Reports",
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
    });

    // Save tokens and Sheet ID to user
    await User.findByIdAndUpdate(session.user.id, {
      googleSheetId: sheet.data.id,
      googleTokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        expiry_date: tokens.expiry_date
      }
    });

    // Return HTML that closes the popup and redirects the main window
    return sendPopupHTML(`${process.env.NEXTAUTH_URL}/settings?google_success=true`);

  } catch (error) {
    console.error("❌ Google Callback Error:", error);
    return sendPopupHTML(`${process.env.NEXTAUTH_URL}/settings?google_error=true`);
  }
}

// Helper function to return HTML that closes the popup
function sendPopupHTML(redirectUrl: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connecting...</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 40px; background: #f8fafc; }
          h3 { color: #334155; }
        </style>
      </head>
      <body>
        <h3>Authentication complete. Closing window...</h3>
        <script>
          // Redirect the main window (the one that opened the popup)
          if (window.opener && !window.opener.closed) {
            window.opener.location.href = "${redirectUrl}";
          }
          // Close this popup window
          window.close();
        </script>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
