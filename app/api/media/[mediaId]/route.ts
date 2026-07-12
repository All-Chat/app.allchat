/* eslint-disable @typescript-eslint/no-explicit-any */
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Ensure this route is not cached, as it relies on session and DB data
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    // Next.js 15+: params is now a Promise and must be awaited
    const { mediaId } = await params;

    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

    const user = await User.findById(session.user.id);
    if (!user) return new Response("Unauthorized", { status: 401 });

    let payer = user;
    if (user.parentTenantId) {
      const parent = await User.findOne({ tenantId: user.parentTenantId });
      if (parent) payer = parent;
    }

    let ACCESS_TOKEN = payer?.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";
    if (payer?.whatsappNumbers && payer.whatsappNumbers.length > 0) {
      const active = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0];
      ACCESS_TOKEN = active?.whatsappAccessToken || ACCESS_TOKEN;
    }

    if (!ACCESS_TOKEN) return new Response("Token missing", { status: 400 });

    // 1. Ask Meta for the media URL
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (!metaRes.ok) {
      console.error("Meta API Error:", await metaRes.text());
      return new Response("Failed to fetch media URL from Meta", { status: metaRes.status });
    }

    const metaData = await metaRes.json();
    if (!metaData.url) return new Response("Media URL not found", { status: 404 });

    // 2. Fetch the actual image/file from the URL (requires Auth token)
    const fileRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    });

    if (!fileRes.ok) return new Response("Failed to fetch media file", { status: fileRes.status });

    // 3. Stream the file back to the browser
    const headers = new Headers();
    headers.set("Content-Type", metaData.mime_type || fileRes.headers.get("Content-Type") || "application/octet-stream");
    
    // Pass Content-Length so the browser can show download/load progress
    const contentLength = fileRes.headers.get("Content-Length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    
    headers.set("Cache-Control", "public, max-age=3600");

    return new Response(fileRes.body, { headers });
  } catch (error: any) {
    console.error("Media Proxy Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
