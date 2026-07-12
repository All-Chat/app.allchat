/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SheetSyncConfig from "@/models/SheetSyncConfig";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limitCheck = await checkLimit(userId, "sheetSyncs" as any);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Sheet Sync limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} per ${limitCheck.period}.`,
          limitExceeded: true,
          limitInfo: {
            resource: "sheetSyncs",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
      );
    }

    // ✅ Added 'name' to destructuring
    const { sheetUrl, nameField, numberField, additionalFields, name } = await req.json();
    
    if (!sheetUrl || !nameField || !numberField || !name) {
      return NextResponse.json({ error: "Sheet Name, URL, Name Field, and Number Field are required" }, { status: 400 });
    }

    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const newConfig = await SheetSyncConfig.create({
      userId,
      tenantId,
      createdBy: userId,
      name, // ✅ Save name
      sheetUrl,
      nameField,
      numberField,
      additionalFields: additionalFields || [],
    });

    await incrementUsage(userId, "sheetSyncs" as any);

    return NextResponse.json({ success: true, config: newConfig });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
