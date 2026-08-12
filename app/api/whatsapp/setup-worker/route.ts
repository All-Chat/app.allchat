/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import {
  runWhatsAppSetupWorker,
} from "@/lib/whatsapp-setup-worker";

export async function POST(req: Request) {
  try {
    /*
     * Protect this endpoint.
     *
     * Set WHATSAPP_WORKER_SECRET in .env.local.
     */

    const authHeader =
      req.headers.get(
        "authorization"
      );

    const expected =
      process.env.WHATSAPP_WORKER_SECRET;

    if (
      !expected ||
      authHeader !==
        `Bearer ${expected}`
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    await runWhatsAppSetupWorker();

    return NextResponse.json({
      success: true,
      message:
        "WhatsApp setup worker executed.",
    });
  } catch (error: any) {
    console.error(
      "[WhatsApp Worker API]",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "Worker failed.",
      },
      {
        status: 500,
      }
    );
  }
}
