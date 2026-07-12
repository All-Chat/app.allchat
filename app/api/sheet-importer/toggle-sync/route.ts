/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SheetSyncConfig from "@/models/SheetSyncConfig";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { configId, isSyncing, intervalValue, intervalUnit } = await req.json();
    
    if (!configId) return NextResponse.json({ error: "Config ID is required" }, { status: 400 });

    // If turning on, we reset lastSynced so the background worker picks it up immediately
    const updateData: any = { isSyncing, intervalValue, intervalUnit };
    if (isSyncing) {
      updateData.lastSynced = null; 
      updateData.lastRunStatus = "Waiting for first run...";
    } else {
      updateData.lastRunStatus = "Stopped";
    }

    const updatedConfig = await SheetSyncConfig.findOneAndUpdate(
      { _id: configId, userId },
      updateData,
      { new: true }
    );

    if (!updatedConfig) return NextResponse.json({ error: "Config not found" }, { status: 404 });

    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
