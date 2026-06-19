/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Template from "@/models/Template";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits"; // ✅ LIMIT ADDED

const WHATSAPP_API = "https://graph.facebook.com/v25.0";

/**
 * WhatsApp Resumable Upload API
 * Uses the USER's token and WABA ID from the database
 */
async function uploadWhatsAppMedia(
  token: string,
  phoneNumberId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ mediaId: string | null; error?: string }> {
  try {
    const formData = new FormData();

    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
    const blob = new Blob([new Uint8Array(arrayBuffer as ArrayBuffer)], {
      type: mimeType,
    });

    formData.append("file", blob, fileName);
    formData.append("messaging_product", "whatsapp");

    const response = await fetch(
      `https://graph.facebook.com/v25.0/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    const result = await response.json();

    console.log("📤 MEDIA UPLOAD RESPONSE:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error("Media Upload Error:", result);
      return {
        mediaId: null,
        error: result?.error?.message || "Upload failed",
      };
    }

    return {
      mediaId: result.id,
    };
  } catch (error) {
    console.error(error);
    return {
      mediaId: null,
      error: error instanceof Error ? error.message : "Unknown error",
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

    // ✅ LIMIT ADDED: Check template creation limit
    const limitCheck = await checkLimit(userId, "templates");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Template limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} templates per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "templates",
            currentUsage: limitCheck.currentUsage,
            limit: limitCheck.limit,
            period: limitCheck.period,
            remaining: limitCheck.remaining,
          },
        },
        { status: 429 }
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
      headerComp &&
      ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format);

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
          fileType = imgRes.headers.get("content-type") || "application/octet-stream";

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
              message: "Failed to download the sample URL. Make sure it's publicly accessible.",
            },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { success: false, message: "Media header requires a sample file or URL." },
          { status: 400 }
        );
      }

      // Upload to WhatsApp using the USER's token and WABA ID from DB
      if (fileBuffer) {
        const result = await tryResumableUpload(
          META_TOKEN,
          process.env.META_APP_ID!,
          fileBuffer,
          fileType
        );

        if (result.handle) {
          headerComp.example = {
            header_handle: [result.handle],
          };
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
    if (category !== "AUTHENTICATION") {
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
                message: "Templates with variables {{1}}, {{2}}, etc. require sample values.",
              },
              { status: 400 }
            );
          }
        }
      }
    }

    // ==========================================
    // 6. BUILD META API PAYLOAD
    // ==========================================
    let metaComponents: any[] = [];

    if (category === "AUTHENTICATION") {
      // AUTHENTICATION templates are strictly formatted by Meta.
      // We must ignore custom body text and enforce the OTP button structure.
      metaComponents.push({
        type: "BODY",
        add_security_recommendation: true
      });

      // Optional: Code expiration footer
      const footerComp = components.find((c: any) => c.type.toUpperCase() === "FOOTER");
      if (footerComp && footerComp.code_expiration_minutes) {
        metaComponents.push({
          type: "FOOTER",
          code_expiration_minutes: Number(footerComp.code_expiration_minutes)
        });
      }

      // Mandatory: Exactly one OTP button
      metaComponents.push({
        type: "BUTTONS",
        buttons: [
          {
            type: "OTP",
            otp_type: "COPY_CODE",
            text: "Copy Code"
          }
        ]
      });
    } else {
      // MARKETING / UTILITY templates mapping
      metaComponents = components.map((comp: any) => {
        const compType = comp.type.toUpperCase();
        const metaComp: any = { type: compType };

        if (compType === "HEADER") {
          metaComp.format = comp.format;
          if (comp.text) metaComp.text = comp.text;
          if (comp.example) metaComp.example = comp.example;
        } else if (compType === "BODY") {
          metaComp.text = comp.text;
          if (comp.example) metaComp.example = comp.example;
        } else if (compType === "FOOTER") {
          metaComp.text = comp.text;
        } else if (compType === "BUTTONS") {
          metaComp.buttons = comp.buttons.map((btn: any) => {
            const metaBtn: any = { type: btn.type, text: btn.text };
            if (btn.type === "URL" && btn.url) metaBtn.url = btn.url;
            if (btn.type === "PHONE_NUMBER" && btn.phone_number) metaBtn.phone_number = btn.phone_number;
            return metaBtn;
          });
        }
        return metaComp;
      }).filter(Boolean);
    }

    const metaPayload = {
      name: safeName,
      category,
      language,
      components: metaComponents,
    };

    // ==========================================
    // 7. SUBMIT TO META (using USER's token + WABA ID)
    // ==========================================
    console.log(`📤 Creating template "${safeName}" with WABA: ${WABA_ID}, language: "${language}"`);
    console.log("📤 TEMPLATE PAYLOAD:", JSON.stringify(metaPayload, null, 2));

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

      console.error("Meta template error:", JSON.stringify(metaData.error, null, 2));

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

    // ✅ LIMIT ADDED: Increment usage after successful creation
    await incrementUsage(userId, "templates");

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

async function tryResumableUpload(
  META_TOKEN: string,
  APP_ID: string,
  fileBuffer: Buffer,
  fileType: string
): Promise<{ permissionMissing: any; handle?: string; error?: string }> {
  try {
    // STEP 1 - Create upload session
    const createSession = await fetch(
      `https://graph.facebook.com/v25.0/${APP_ID}/uploads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_length: fileBuffer.length,
          file_type: fileType,
        }),
      }
    );

    const sessionData = await createSession.json();

    console.log("SESSION:", sessionData);
    if (!createSession.ok) {
      console.log("SESSION ERROR:", sessionData);
      return {
        permissionMissing: false,
        error: JSON.stringify(sessionData),
      };
    }

    const uploadId = sessionData.id;

    // STEP 2 - Upload binary
    const uploadRes = await fetch(
      `https://graph.facebook.com/v25.0/${uploadId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          file_offset: "0",
        },
        body: Buffer.from(fileBuffer),
      }
    );

    const uploadData = await uploadRes.json();

    console.log("UPLOAD:", uploadData);
    if (!uploadRes.ok) {
      console.log("UPLOAD ERROR:", uploadData);
      return {
        permissionMissing: false,
        error: JSON.stringify(uploadData),
      };
    }

    return {
      permissionMissing: false,
      handle: uploadData.h,
    };
  } catch (err: any) {
    return {
      permissionMissing: false,
      error: err.message,
    };
  }
}
