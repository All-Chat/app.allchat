/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Form from "@/models/Form";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const forms = await Form.find({ userId }).sort({ createdAt: -1 });
    return NextResponse.json({ forms });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ CHECK LIMIT BEFORE CREATING
    const limitCheck = await checkLimit(userId, "forms");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Form limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} forms per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "forms",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
      );
    }

    const { name, fields, completionMessage, abandonmentMessage } = await req.json();
    if (!name || !fields) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    // ==========================================
    // 🔴 MULTI-TENANT DATA ISOLATION
    // ==========================================
    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const form = await Form.create({
      userId,
      tenantId, // ✅ ATTACH TENANT ID FOR AGGREGATED VIEWS
      createdBy: userId, // ✅ TRACK WHO CREATED IT
      name,
      fields,
      completionMessage: completionMessage || "✅ Thank you! Your form has been submitted successfully.",
      abandonmentMessage: abandonmentMessage || "It seems you are busy right now. We have paused the form. Click the button below whenever you are ready to start over.",
    });

    // ✅ INCREMENT USAGE AFTER SUCCESSFUL CREATION
    await incrementUsage(userId, "forms");

    return NextResponse.json({ success: true, form });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
