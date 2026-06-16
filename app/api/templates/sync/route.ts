import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Template from "@/models/Template";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST() {
  try {
    await connectDB();

    // 1. Get the logged-in user from the session
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Fetch the user's WABA ID and Token from the DB
    const user = await User.findById(session.user.id);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const wabaId = user.wabaId;
    const token = user.whatsappAccessToken;

    if (!wabaId || !token) {
      return NextResponse.json(
        { success: false, error: "Missing WhatsApp Business Account ID or Access Token in your settings" },
        { status: 400 }
      );
    }

    // 3. Fetch from Meta API using the user's credentials
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTemplates: any[] = [];
    let url: string | null = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?limit=100`;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json() as {
        data?: Array<{
          id?: string;
          name?: string;
          status?: string;
          language?: string;
          category?: string;
          components?: unknown[];
        }>;
        paging?: { next?: string };
        error?: unknown;
      };

      if (!res.ok) {
        console.error("❌ Meta API Error:", JSON.stringify(data));
        return NextResponse.json(
          { success: false, error: data },
          { status: 400 }
        );
      }

      allTemplates.push(...(data.data || []));
      url = data.paging?.next || null;
    }

    // 4. Sync into DB (Scoped to this specific user)
    let syncedCount = 0;
    let errorCount = 0;

    for (const t of allTemplates) {
      try {
        if (!t.id) continue;

        await Template.findOneAndUpdate(
          // Filter by metaTemplateId AND userId so users don't overwrite each other
          { metaTemplateId: t.id, userId: session.user.id },
          {
            userId: session.user.id, // Associate template with the logged-in user
            name: t.name || "Unnamed",
            status: t.status || "UNKNOWN",
            metaTemplateId: t.id,
            language: t.language || "en_US",
            category: t.category || "UTILITY",
            components: t.components || [],
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        syncedCount++;
      } catch (dbSaveError) {
        console.error(`❌ Failed to save template ${t.name}:`, dbSaveError);
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Synced successfully",
      syncedCount,
      errorCount,
      totalFromMeta: allTemplates.length,
    });

  } catch (err: unknown) {
    console.error("❌ UNCAUGHT SYNC ERROR:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}