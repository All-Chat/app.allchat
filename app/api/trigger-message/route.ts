/* eslint-disable @typescript-eslint/no-explicit-any */
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";
import { getServerSession } from "next-auth"; // ADDED
import { authOptions } from "@/lib/auth";      // ADDED

export async function POST(req: Request) {
  try {
    // ADDED: Ensure user is logged in before sending
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { phone } = await req.json();

    if (!phone) {
      return Response.json(
        { success: false, error: "Phone missing" },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppMessage(
      phone,
      "🚀 Test message from trigger system"
    );

    return Response.json({ success: true, result });
  } catch (error: any) {
    console.error("❌ API ERROR:", error);

    return Response.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}