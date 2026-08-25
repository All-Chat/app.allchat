/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Form from "@/models/Form";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET() {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Use .lean() for faster query and lower memory usage
    const forms = await Form.find({ userId }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ forms });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
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
      tenantId, 
      createdBy: userId, 
      name,
      fields,
      completionMessage: completionMessage || "✅ Thank you! Your form has been submitted successfully.",
      abandonmentMessage: abandonmentMessage || "It seems you are busy right now. We have paused the form. Click the button below whenever you are ready to start over.",
    });

    // ✅ Fire-and-forget usage increment (don't block the API response)
    incrementUsage(userId, "forms").catch(() => {});

    return NextResponse.json({ success: true, form });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
