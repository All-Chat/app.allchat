import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get("number") || "";

  // Clean up the number
  const cleanNumber = decodeURIComponent(number);

  // Return an HTML page that forces the dialer to open
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Calling...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            text-align: center; 
            padding: 40px 20px; 
            background-color: #f0f2f5; 
            height: 100vh; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            align-items: center;
          }
          .card {
            background: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            max-width: 320px;
            width: 100%;
          }
          .btn { 
            display: block; 
            padding: 15px 20px; 
            background-color: #25D366; 
            color: white; 
            text-decoration: none; 
            border-radius: 12px; 
            font-size: 18px; 
            font-weight: bold;
            margin-top: 20px;
          }
          p { color: #666; font-size: 14px; margin-bottom: 0; }
        </style>
        <script>
          // Automatically try to open the dialer
          window.onload = function() {
            window.location.href = "tel:${cleanNumber}";
          };
        </script>
      </head>
      <body>
        <div class="card">
          <h2 style="margin-top: 0; color: #111;">Opening Dialer...</h2>
          <p>If the phone dialer does not open automatically, please tap the button below:</p>
          <a href="tel:${cleanNumber}" class="btn">📞 Call ${cleanNumber}</a>
        </div>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
