/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Template from "@/models/Template";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const WHATSAPP_API = "https://graph.facebook.com/v25.0";

/**
 * WhatsApp Resumable Upload API
 * Uses the USER's token and WABA ID from the database
 */
async function tryResumableUpload(
  token: string,
  wabaId: string,
  fileBuffer: Buffer,
  fileType: string
): Promise<{ handle: string | null; permissionMissing: boolean; error: string }> {
  try {
    const fileSize = fileBuffer.length;

    console.log(`📤 Uploading to WABA ${wabaId}, file size: ${fileSize}, type: ${fileType}`);

    // Step 1: Create upload session
    const sessionRes = await fetch(`${WHATSAPP_API}/${wabaId}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_length: fileSize, file_type: fileType }),
    });

    const sessionData = await sessionRes.json();

    if (!sessionRes.ok || sessionData.error || !sessionData.id) {
      const errMsg = sessionData.error?.message || "Unknown error";
      const errCode = sessionData.error?.code;
      const errSubcode = sessionData.error?.error_subcode;

      console.error("❌ Upload session failed:", JSON.stringify(sessionData.error || sessionData, null, 2));

      return {
  handle: null,
  permissionMissing: false,
  error: JSON.stringify(sessionData),
};

      return {
        handle: null,
        permissionMissing: false,
        error: errMsg,
      };
    }

    console.log(`✅ Upload session created: ${sessionData.id}`);

    // Step 2: Upload the file bytes
    const uploadRes = await fetch(`${WHATSAPP_API}/${sessionData.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(fileBuffer),
    });

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || uploadData.error || !uploadData.h) {
      const errMsg = uploadData.error?.message || "Upload failed";
      console.error("❌ File upload failed:", errMsg);
      return {
        handle: null,
        permissionMissing: false,
        error: errMsg,
      };
    }

    console.log(`✅ Upload succeeded, handle: ${uploadData.h}`);
    return { handle: uploadData.h, permissionMissing: false, error: "" };
  } catch (err) {
    console.error("❌ Resumable Upload error:", err);
    return {
      handle: null,
      permissionMissing: false,
      error: err instanceof Error ? err.message : "Unknown upload error",
    };
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();

    // ==========================================
    // 1. AUTH CHECK
    // ==========================================
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // ==========================================
    // 2. GET CREDENTIALS FROM DATABASE (NOT .env)
    // ==========================================
    const user = await User.findById(userId);

    const META_TOKEN = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";
    const WABA_ID = user?.wabaId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
    const PHONE_NUMBER_ID = user?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    if (!META_TOKEN || !WABA_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "WhatsApp credentials not configured. Please update your Settings with your Access Token and WhatsApp Business Account ID.",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 🚨 CRITICAL CHECK: WABA ID ≠ Phone Number ID
    // They are DIFFERENT numbers. If they're the same,
    // the user entered the wrong ID in Settings.
    // ==========================================
    if (WABA_ID === PHONE_NUMBER_ID) {
      console.error(
        `❌ WABA ID (${WABA_ID}) is the same as Phone Number ID (${PHONE_NUMBER_ID}). These must be different!`
      );
      return NextResponse.json(
        {
          success: false,
          message:
            "❌ Your WhatsApp Business Account ID (WABA ID) and Phone Number ID are the SAME — they should be DIFFERENT.\n\n" +
            "📱 Phone Number ID: Used for SENDING messages\n" +
            "🏢 WABA ID: Used for CREATING templates and uploading media\n\n" +
            "How to find your real WABA ID:\n" +
            "1. Go to Meta Business Settings → Business Assets → WhatsApp Accounts\n" +
            "2. Click your WhatsApp account\n" +
            "3. The ID at the top is your WABA ID (it's a different number than your Phone Number ID)\n\n" +
            "Update the WABA ID in your Settings page and try again.",
          wrongWabaId: true,
        },
        { status: 400 }
      );
    }

    console.log(`🏢 Using WABA ID: ${WABA_ID}`);
    console.log(`📱 Using Phone Number ID: ${PHONE_NUMBER_ID}`);

    // ==========================================
    // 3. PARSE FORM DATA
    // ==========================================
    const formData = await req.formData();

    const name = (formData.get("name") as string) || "";
    const category = (formData.get("category") as string) || "MARKETING";
    const language = (formData.get("language") as string) || "en";
    const componentsStr = formData.get("components") as string;
    const sampleFile = formData.get("sampleFile") as File | null;
    const sampleSource = (formData.get("sampleSource") as string) || "upload";
    const sampleUrl = (formData.get("sampleUrl") as string) || "";

    if (!name || !componentsStr) {
      return NextResponse.json(
        { success: false, message: "Name and components are required" },
        { status: 400 }
      );
    }

    let components: any[];
    try {
      components = JSON.parse(componentsStr);
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid components JSON" },
        { status: 400 }
      );
    }

    const safeName = `${name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/__+/g, "_")
      .substring(0, 40)}_${Date.now()}`;

    // ==========================================
    // 4. HANDLE SAMPLE MEDIA
    // ==========================================
    const headerComp = components.find((c: any) => c.type === "HEADER");
    const isMediaHeader =
      headerComp && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format);

    if (isMediaHeader) {
      let fileBuffer: Buffer | null = null;
      let fileType: string = "application/octet-stream";

      // Source 1: File upload
      if (sampleSource === "upload" && sampleFile && sampleFile.size > 0) {
        fileBuffer = Buffer.from(await sampleFile.arrayBuffer());
        fileType = sampleFile.type || "application/octet-stream";
      }
      // Source 2: URL download
      else if (sampleSource === "url" && sampleUrl.trim()) {
        try {
          console.log(`📥 Downloading sample from URL: ${sampleUrl}`);
          const imgRes = await fetch(sampleUrl.trim());
          if (!imgRes.ok) throw new Error("Failed to download URL");
          fileBuffer = Buffer.from(await imgRes.arrayBuffer());
          fileType =
            imgRes.headers.get("content-type") || "application/octet-stream";

          if (fileBuffer.length > 5 * 1024 * 1024) {
            return NextResponse.json(
              { success: false, message: "Sample media exceeds 5MB limit." },
              { status: 400 }
            );
          }
        } catch (err) {
          console.error("URL download error:", err);
          return NextResponse.json(
            {
              success: false,
              message:
                "Failed to download the sample URL. Make sure it's publicly accessible.",
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            message: "Media header requires a sample file or URL.",
          },
          { status: 400 }
        );
      }

      // Upload to WhatsApp using the USER's token and WABA ID from DB
      if (fileBuffer) {
        const result = await tryResumableUpload(
          META_TOKEN,
          WABA_ID,
          fileBuffer,
          fileType
        );

        if (result.handle) {
          headerComp.example = { header_handle: [result.handle] };
          console.log("✅ Applied header_handle to payload");
        } else if (result.permissionMissing) {
          return NextResponse.json(
            {
              success: false,
              permissionMissing: true,
              message:
                `❌ Cannot upload media — your token is missing the 'whatsapp_business_management' permission.\n\n` +
                `🔧 How to fix:\n` +
                `1. Go to Meta Business Settings → Apps → Your App → App Review\n` +
                `2. Request 'whatsapp_business_management' permission\n` +
                `3. Once approved, generate a NEW token with BOTH permissions:\n` +
                `   ✅ whatsapp_business_messaging\n` +
                `   ✅ whatsapp_business_management\n` +
                `4. Update the token in your Settings page\n\n` +
                `✅ For now, you CAN create TEXT-ONLY templates (header type = None or Text).`,
            },
            { status: 403 }
          );
        } else {
          return NextResponse.json(
            {
              success: false,
              message: `Failed to upload media to WhatsApp: ${result.error}`,
            },
            { status: 500 }
          );
        }
      }
    }

    // ==========================================
    // 5. VALIDATE BODY VARIABLES
    // ==========================================
    const bodyComp = components.find((c: any) => c.type === "BODY");
    if (bodyComp && bodyComp.text) {
      const variableMatches = bodyComp.text.match(/\{\{(\d+)\}\}/g);
      if (variableMatches && variableMatches.length > 0) {
        const hasBodyExample =
          bodyComp.example?.body_text &&
          bodyComp.example.body_text.length > 0 &&
          bodyComp.example.body_text[0].length > 0;
        if (!hasBodyExample) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Templates with variables {{1}}, {{2}}, etc. require sample values.",
            },
            { status: 400 }
          );
        }
      }
    }

    // ==========================================
    // 6. BUILD META API PAYLOAD
    // ==========================================
    const metaComponents = components.map((comp: any) => {
      const metaComp: any = { type: comp.type.toUpperCase() };

      if (comp.type.toUpperCase() === "HEADER") {
        metaComp.format = comp.format;
        if (comp.text) metaComp.text = comp.text;
        if (comp.example) metaComp.example = comp.example;
      } else if (comp.type.toUpperCase() === "BODY") {
        metaComp.text = comp.text;
        if (comp.example) metaComp.example = comp.example;
      } else if (comp.type.toUpperCase() === "FOOTER") {
        metaComp.text = comp.text;
      } else if (comp.type.toUpperCase() === "BUTTONS") {
        metaComp.buttons = comp.buttons.map((btn: any) => {
          const metaBtn: any = { type: btn.type, text: btn.text };
          if (btn.type === "URL" && btn.url) metaBtn.url = btn.url;
          if (btn.type === "PHONE_NUMBER" && btn.phone_number)
            metaBtn.phone_number = btn.phone_number;
          return metaBtn;
        });
      }

      return metaComp;
    });

    const metaPayload = {
      name: safeName,
      category,
      language,
      components: metaComponents,
    };

    // ==========================================
    // 7. SUBMIT TO META (using USER's token + WABA ID)
    // ==========================================
    console.log(
      `📤 Creating template "${safeName}" with WABA: ${WABA_ID}, language: "${language}"`
    );

    const metaRes = await fetch(
      `${WHATSAPP_API}/${WABA_ID}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaData = await metaRes.json();

    if (!metaRes.ok || metaData.error) {
      const errorMessage =
        metaData.error?.error_user_msg ||
        metaData.error?.message ||
        "Meta rejected template";

      console.error(
        "Meta template error:",
        JSON.stringify(metaData.error, null, 2)
      );

      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: 400 }
      );
    }

    // ==========================================
    // 8. SAVE TO LOCAL DB
    // ==========================================
    const template = await Template.create({
      userId,
      name: safeName,
      category,
      language,
      components,
      status: "submitted",
      metaTemplateId: metaData.id,
    });

    console.log(`✅ Template "${safeName}" submitted successfully!`);

    return NextResponse.json({
      success: true,
      message: "Template submitted successfully! Pending Meta approval.",
      meta: metaData,
      template,
    });
  } catch (err: any) {
    console.error("Error in /api/templates/create:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}