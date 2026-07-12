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
    if (!sheetUrl) {
      return NextResponse.json({ error: "Google Sheet URL is required" }, { status: 400 });
    }

    // Extract the Document ID from the Google Sheet URL
    const match = sheetUrl.match(/\/d\/(.*?)(\/|$)/);
    if (!match || !match[1]) {
      return NextResponse.json({ error: "Invalid Google Sheet URL format" }, { status: 400 });
    }

    const docId = match[1];
    // Convert to CSV export URL
    const csvUrl = `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`;

    const response = await fetch(csvUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch sheet. Make sure the sheet is publicly viewable (Anyone with the link)." },
        { status: 400 }
      );
    }

    const text = await response.text();
    const firstLine = text.split("\n")[0];
    
    // Basic CSV parsing for headers
    const headers = firstLine.split(",").map((header) => header.trim().replace(/^"|"$/g, ""));

    return NextResponse.json({ headers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
