/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sheetUrl } = await req.json();
    if (!sheetUrl) return NextResponse.json({ error: "Google Sheet URL is required" }, { status: 400 });

    const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
    if (!match || !match[1]) {
      return NextResponse.json({ error: "Invalid Google Sheet URL format" }, { status: 400 });
    }

    const docId = match[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;

    const response = await fetch(csvUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch sheet. Ensure sharing is set to 'Anyone with the link'." },
        { status: 400 }
      );
    }

    const text = await response.text();
    
    // ✅ FIX: Split by \r\n or \n to prevent hidden carriage returns from breaking headers
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    
    if (lines.length === 0) {
      return NextResponse.json({ headers: [], rows: [] });
    }

    const parseLine = (line: string) => {
      const cells: string[] = [];
      let curCell = "";
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cells.push(curCell.trim().replace(/^"|"$/g, ""));
          curCell = "";
        } else {
          curCell += char;
        }
      }
      cells.push(curCell.trim().replace(/^"|"$/g, ""));
      return cells;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1, 51).map(line => parseLine(line)).filter(row => row.some(cell => cell !== ""));

    return NextResponse.json({ headers, rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
