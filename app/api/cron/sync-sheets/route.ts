/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SheetSyncConfig from "@/models/SheetSyncConfig";

// Helper to calculate milliseconds
const getMs = (value: number, unit: string) => {
  if (unit === "seconds") return value * 1000;
  if (unit === "minutes") return value * 60 * 1000;
  if (unit === "hours") return value * 60 * 60 * 1000;
  return 5000;
};

export async function GET(req: Request) {
  try {
    // ✅ SECURE THIS ROUTE in production with a secret token (e.g., ?secret=YOUR_SECRET)
    // const secret = new URL(req.url).searchParams.get("secret");
    // if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectDB();
    
    // Find all sheets that have syncing turned ON
    const activeSyncs = await SheetSyncConfig.find({ isSyncing: true });

    const now = new Date();
    let processedCount = 0;

    for (const config of activeSyncs) {
      const intervalMs = getMs(config.intervalValue, config.intervalUnit);
      const lastSynced = config.lastSynced ? new Date(config.lastSynced) : new Date(0);
      const diffMs = now.getTime() - lastSynced.getTime();

      // If the time passed is greater than or equal to the interval, it's time to sync!
      if (diffMs >= intervalMs) {
        try {
          // Fetch the Google Sheet data
          const match = config.sheetUrl.match(/\/d\/(.*?)(\/|$)/);
          if (!match || !match[1]) continue;

          const docId = match[1];
          const csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;
          const response = await fetch(csvUrl);
          
          if (!response.ok) {
            throw new Error("Failed to fetch Google Sheet");
          }

          const text = await response.text();
          const lines = text.split("\n");
          
          // Basic CSV parsing
          const parseLine = (line: string) => {
            const cells: string[] = [];
            let curCell = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') inQuotes = !inQuotes;
              else if (char === ',' && !inQuotes) {
                cells.push(curCell.trim().replace(/^"|"$/g, ""));
                curCell = "";
              } else curCell += char;
            }
            cells.push(curCell.trim().replace(/^"|"$/g, ""));
            return cells;
          };

          const headers = parseLine(lines[0]);
          const rows = lines.slice(1, 5000).map(parseLine).filter((row: string[]) => row.some(cell => cell !== ""));

          // ✅ HERE YOU CAN SAVE THE ROWS TO YOUR DATABASE OR PROCESS THEM
          // For now, we just log it to the server console
          console.log(`[CRON] Synced ${rows.length} rows for config: ${config._id}`);

          // Update the config with success
          config.lastSynced = new Date();
          config.lastRunStatus = `Success (${rows.length} rows)`;
          await config.save();
          
          processedCount++;
        } catch (error: any) {
          // Update the config with the error message
          config.lastSynced = new Date();
          config.lastRunStatus = `Error: ${error.message}`;
          await config.save();
        }
      }
    }

    return NextResponse.json({ success: true, message: `Processed ${processedCount} sheets.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
