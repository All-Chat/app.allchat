/* eslint-disable @typescript-eslint/no-explicit-any */
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
    
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    // 1. Check if user cancelled or Google blocked it immediately
    if (errorParam) {
      return sendDebugHTML(`Google rejected the request: ${errorParam}`);
    }

    // 2. Check if session is missing (Cookie/HTTPS issue)
    if (!session?.user?.id) {
      return sendDebugHTML("Session expired or missing. Please go back to /settings, refresh, and try again.");
    }

    if (!code) {
      return sendDebugHTML("No authorization code received from Google.");
    }

    const redirectUri = `${process.env.NEXTAUTH_URL}/api/google-sheets/callback`;
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // 3. Try to exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    
    // 4. Create Google Sheet
    const sheet = await drive.files.create({
      requestBody: {
        name: "All Chat CRM - Campaign Reports",
        mimeType: "application/vnd.google-apps.spreadsheet",
      },
    });

    // 5. Save to DB
    await User.findByIdAndUpdate(session.user.id, {
      googleSheetId: sheet.data.id,
      googleTokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        expiry_date: tokens.expiry_date
      }
    });

    // Success! Close popup and redirect main window
    return sendPopupHTML(`${process.env.NEXTAUTH_URL}/settings?google_success=true`);

  } catch (error: any) {
    console.error("❌ Google Callback Error:", error);
    // Show the EXACT error message on the screen
    const errorMsg = error?.response?.data?.error_description || error?.message || "Unknown server error.";
    return sendDebugHTML(`<b style="color:red">Error Details:</b><br><pre style="white-space: pre-wrap; word-wrap: break-word;">${errorMsg}</pre>`);
  }
}

// HTML for Debugging (Shows the exact error)
function sendDebugHTML(message: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Google Auth Debug</title>
        <style>
          body { font-family: monospace; text-align: center; padding: 40px; background: #f8fafc; color: #334155; }
          .box { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 600px; margin: auto; }
          button { margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="box">
          <h3>Google Auth Debug</h3>
          <p>${message}</p>
          <button onclick="window.close()">Close Window</button>
        </div>
      </body>
    </html>
  `;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

// HTML for Success (Closes popup)
function sendPopupHTML(redirectUrl: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Success</title></head>
      <body>
        <h3>Success! Closing window...</h3>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.location.href = "${redirectUrl}";
          }
          window.close();
        </script>
      </body>
    </html>
  `;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
