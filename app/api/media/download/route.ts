import { NextResponse } from "next/server";
import { getServerSession } from "next-auth"; // ADDED
import { authOptions } from "@/lib/auth";      // ADDED

export async function GET(req: Request) {
  try {
    // ADDED: Ensure user is logged in before proxying media
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mediaId = searchParams.get("mediaId");

    if (!mediaId) {
      return NextResponse.json({ error: "Media ID required" }, { status: 400 });
    }

    const token = process.env.META_ACCESS_TOKEN;

    // 1. Get the download URL from Meta using the Media ID
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const metaData = await metaRes.json();
    const url = metaData?.url;

    if (!url) {
      return NextResponse.json({ error: "Could not get Meta URL" }, { status: 400 });
    }

    // 2. Download the actual file from the URL
    const fileRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!fileRes.ok) {
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await fileRes.arrayBuffer();

    // 3. Send the file back to the frontend
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // Cache forever
      },
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Media Proxy Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}