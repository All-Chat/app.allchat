import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const GRAPH_API = "https://graph.facebook.com/v25.0";

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png"],
  video: ["video/mp4"],
  document: ["application/pdf"],
};

const MAX_SIZE: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

function mimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";

  return null;
}

export async function POST(req: Request) {
  try {
    await connectDB();

    // AUTH CHECK
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // GET USER TOKEN
    const user = await User.findById(userId);

    const token =
      user?.whatsappAccessToken ||
      process.env.META_ACCESS_TOKEN ||
      "";

    const appId = process.env.META_APP_ID || "";

    if (!token || !appId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "WhatsApp access token or META_APP_ID is not configured.",
        },
        { status: 500 }
      );
    }

    // PARSE FORM DATA
    const formData = await req.formData();

    const file = formData.get("file");
    const headerType = String(
      formData.get("headerType") || ""
    ).toLowerCase();

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { success: false, message: "No file provided." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES[headerType]) {
      return NextResponse.json(
        {
          success: false,
          message: "headerType must be image, video, or document.",
        },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const extensionMime = mimeFromFileName(file.name);
    const browserMime = (file.type || "").toLowerCase();

    let mimeType = browserMime || extensionMime || "";

    if (
      (!browserMime || browserMime === "application/octet-stream") &&
      extensionMime &&
      ALLOWED_TYPES[headerType].includes(extensionMime)
    ) {
      mimeType = extensionMime;
    }

    // MIME VALIDATION
    if (!ALLOWED_TYPES[headerType].includes(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          message: `Unsupported ${headerType} file. Accepted: ${ALLOWED_TYPES[headerType].join(", ")}.`,
          receivedMimeType: browserMime || "unknown",
          fileName: file.name,
        },
        { status: 400 }
      );
    }

    // FILE SIZE VALIDATION
    if (fileBuffer.length > MAX_SIZE[headerType]) {
      return NextResponse.json(
        {
          success: false,
          message: `${headerType} file exceeds the ${Math.floor(
            MAX_SIZE[headerType] / (1024 * 1024)
          )} MB limit.`,
        },
        { status: 400 }
      );
    }

    // STEP 1: CREATE META UPLOAD SESSION
    const params = new URLSearchParams({
      file_name: file.name || "template-sample",
      file_length: String(fileBuffer.length),
      file_type: mimeType,
    });

    const sessionResponse = await fetch(
      `${GRAPH_API}/${appId}/uploads?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const sessionData = await sessionResponse.json();

    console.log("META UPLOAD SESSION:", sessionData);

    if (!sessionResponse.ok || !sessionData.id) {
      return NextResponse.json(
        {
          success: false,
          message:
            sessionData.error?.error_user_msg ||
            sessionData.error?.message ||
            "Failed to create Meta upload session.",
          metaError: sessionData.error || null,
        },
        { status: 400 }
      );
    }

    // STEP 2: UPLOAD BINARY FILE
    const uploadResponse = await fetch(
      `${GRAPH_API}/${sessionData.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: "0",
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(fileBuffer),
      }
    );

    const uploadData = await uploadResponse.json();

    console.log("META BINARY UPLOAD:", uploadData);

    if (!uploadResponse.ok || !uploadData.h) {
      return NextResponse.json(
        {
          success: false,
          message:
            uploadData.error?.error_user_msg ||
            uploadData.error?.message ||
            "Failed to upload binary file to Meta.",
          metaError: uploadData.error || null,
        },
        { status: 400 }
      );
    }

    // SUCCESS
    return NextResponse.json({
      success: true,
      handle: uploadData.h,
      mimeType,
      fileName: file.name,
      size: fileBuffer.length,
    });
  } catch (error) {
    console.error("Template sample upload route error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
