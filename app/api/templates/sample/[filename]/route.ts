import { NextResponse } from "next/server";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import os from "os";

const TMP_DIR = join(os.tmpdir(), "wati-samples");

export async function GET(
  req: Request,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params;

    const filePath = join(TMP_DIR, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: "File not found or expired" },
        { status: 404 }
      );
    }

    const fileBuffer = readFileSync(filePath);

    const ext = filename.split(".").pop()?.toLowerCase() || "";

    const contentTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      "3gp": "video/3gpp",
      pdf: "application/pdf",
      doc: "application/msword",
      docx:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    try {
      unlinkSync(filePath);
    } catch {}

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error serving sample file:", error);

    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
