/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";

type TenantSessionUser = Session["user"] & {
  id: string;
  tenantId?: string | null;
  isTenant?: boolean;
};
type TenantSession = Session & { user: TenantSessionUser };

// Re-use the same schema/model name registered in the main inbox route so
// mongoose doesn't try to redefine the model.
const TeamMessageMediaSchema = new mongoose.Schema({
  teamId: { type: String, index: true },
  data: { type: Buffer, required: true },
  mime: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const TeamMessageMedia =
  mongoose.models.TeamMessageMedia || mongoose.model("TeamMessageMedia", TeamMessageMediaSchema);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = (await getServerSession(authOptions)) as TenantSession | null;
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const media = await TeamMessageMedia.findById(id).lean();
    if (!media) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    const buffer = Buffer.isBuffer((media as any).data)
      ? (media as any).data
      : Buffer.from((media as any).data?.buffer || (media as any).data);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": (media as any).mime || "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("Error serving team inbox media:", error);
    return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
  }
}
