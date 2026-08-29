/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OptNumber from "@/models/OptNumber";
import Contact from "@/models/Contact";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const numbers = await OptNumber.find({ userId }).sort({ createdAt: -1 }).lean();
    const contacts = await Contact.find({ userId }).select("phone name").lean();
    
    const contactMap = new Map();
    for (const c of contacts) {
      if (c.phone) {
        const last10 = String(c.phone).replace(/\D/g, '').slice(-10);
        contactMap.set(last10, c.name || "Unknown");
      }
    }
    
    const numbersWithNames = numbers.map(n => {
      const last10 = String(n.phoneNumber).replace(/\D/g, '').slice(-10);
      const name = contactMap.get(last10) || "Unknown";
      return { ...n, name };
    });

    return NextResponse.json({ numbers: numbersWithNames });
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

    const limitCheck = await checkLimit(userId, "optNumbers");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: `Opt-in number limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} numbers per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "optNumbers",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
      );
    }

    const { phoneNumber, name } = await req.json();
    if (!phoneNumber || !phoneNumber.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const existing = await OptNumber.findOne({ userId, phoneNumber: phoneNumber.trim() });
    if (existing) return NextResponse.json({ error: "Number already exists" }, { status: 400 });

    const tenantId = (session.user as any)?.parentTenantId || (session.user as any)?.tenantId || null;

    const optNumber = await OptNumber.create({ 
      userId, 
      tenantId, 
      createdBy: userId, 
      phoneNumber: phoneNumber.trim() 
    });

    await incrementUsage(userId, "optNumbers");

    // ✅ NEW: Save the optional name to the Live Chat (Contact collection)
    if (name && name.trim()) {
      await Contact.findOneAndUpdate(
        { userId, phone: phoneNumber.trim() },
        { $set: { name: name.trim() } },
        { upsert: true }
      );
    }

    return NextResponse.json({ success: true, optNumber });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
