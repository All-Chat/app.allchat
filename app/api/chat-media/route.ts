/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/chat-media/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mediaId = searchParams.get("id");
    if (!mediaId) return new NextResponse("Missing media ID", { status: 400 });

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

    await connectDB();
    
    // ✅ Fetch current user to determine tenant hierarchy
    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId whatsappAccessToken whatsappNumbers").lean();
    if (!currentUser) return new NextResponse("User not found", { status: 404 });

    // ✅ Find all users in the tenant group to check for the correct access token
    let tenantIdToSearch = null;
    if (currentUser.isTenant) {
      tenantIdToSearch = currentUser.tenantId || currentUser._id.toString();
    } else if (currentUser.parentTenantId) {
      tenantIdToSearch = currentUser.parentTenantId;
    }

    const usersToCheck = [currentUser];
    if (tenantIdToSearch) {
      const tenantUser = await User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("whatsappAccessToken whatsappNumbers").lean();
      if (tenantUser) usersToCheck.push(tenantUser);
      
      const subUsers = await User.find({ parentTenantId: tenantIdToSearch }).select("whatsappAccessToken whatsappNumbers").lean();
      subUsers.forEach(u => usersToCheck.push(u));
    }

    let accessToken = process.env.META_ACCESS_TOKEN;

    // ✅ Look for the token attached to any user in the tenant group
    for (const u of usersToCheck) {
      if (Array.isArray(u?.whatsappNumbers) && u.whatsappNumbers.length > 0) {
        const active = u.whatsappNumbers.find((n: any) => n.isActive) || u.whatsappNumbers[0];
        if (active?.whatsappAccessToken) {
          accessToken = active.whatsappAccessToken;
          break; // Found a valid token
        }
      } else if (u?.whatsappAccessToken) {
         accessToken = u.whatsappAccessToken;
         break; 
      }
    }

    if (!accessToken) return new NextResponse("Token not configured", { status: 500 });

    // 1. Ask Meta for the temporary media URL
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      return new NextResponse("Failed to fetch media URL from Meta", { status: metaRes.status });
    }

    const metaData = await metaRes.json();
    const mediaUrl = metaData.url;
    const mimeType = metaData.mime_type || "application/octet-stream";

    // 2. Fetch the actual file content using the URL (requires auth header)
    const fileRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!fileRes.ok) {
      return new NextResponse("Failed to download media file", { status: fileRes.status });
    }

    // 3. Stream the file back to the browser
    const arrayBuffer = await fileRes.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Media proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
