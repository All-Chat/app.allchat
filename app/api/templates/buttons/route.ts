/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Template from "@/models/Template"; 
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    await connectDB();
    
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let name = searchParams.get("name") || "";

    // ✅ FIX: Remove any leading/trailing quotes from the name
    name = name.replace(/^["']|["']$/g, "").trim();

    if (!name) {
      return NextResponse.json({ success: true, buttons: [] });
    }

    // Find template matching the name and user
    const template = await Template.findOne({ name, userId }).lean();

    let buttons: string[] = [];
    
    if (template && Array.isArray(template.components)) {
      const buttonsComponent = template.components.find(
        (c: any) => c.type === "BUTTONS" && Array.isArray(c.buttons)
      );

      if (buttonsComponent) {
        buttons = buttonsComponent.buttons
          .map((b: any) => {
            if (typeof b === "string") return b;
            return b?.text || b?.title || b?.label || "";
          })
          .filter((text: string) => text && text.trim().length > 0);
      }
    }

    return NextResponse.json({ success: true, buttons });
  } catch (error) {
    console.error("Error fetching template buttons:", error);
    return NextResponse.json(
      { success: false, buttons: [], error: "Failed to fetch buttons" },
      { status: 500 }
    );
  }
}
