/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Workflow from "@/models/Workflow";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decrementUsage } from "@/lib/limits";

export async function DELETE(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // MANUAL URL PARSING (this bypasses Next.js params bug completely)
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const id = parts[parts.length - 1];

    if (!id || id === "workflow") {
      return NextResponse.json(
        { success: false, error: "Invalid ID" },
        { status: 400 }
      );
    }

    // Delete workflow ONLY if it belongs to this user
    const deleted = await Workflow.findOneAndDelete({ 
      _id: id, 
      userId: userId 
    });

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Workflow not found or not authorized" },
        { status: 404 }
      );
    }

    // ✅ DECREMENT USAGE AFTER SUCCESSFUL DELETION
    await decrementUsage(userId, "workflows");

    return NextResponse.json({
      success: true,
      deleted,
    });
  } catch (err: any) {
    console.error("DELETE ERROR:", err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
