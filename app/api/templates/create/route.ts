/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Template from "@/models/Template";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits";

export const runtime = "nodejs";

const GRAPH_API = "https://graph.facebook.com/v25.0";

const MAX_MEDIA_SIZE: Record<string, number> = {
  IMAGE: 5 * 1024 * 1024,
  VIDEO: 16 * 1024 * 1024,
  DOCUMENT: 100 * 1024 * 1024,
};

const MIME_TYPES: Record<string, string[]> = {
  IMAGE: ["image/jpeg", "image/png"],
  VIDEO: ["video/mp4"],
  DOCUMENT: ["application/pdf"],
};

const EXTENSIONS: Record<string, string> = {
  IMAGE: ".jpg",
  VIDEO: ".mp4",
  DOCUMENT: ".pdf",
};

function getMimeTypeFromName(fileName: string): string | null {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";

  return null;
}

// ==========================================
// META TEMPLATE SAMPLE RESUMABLE UPLOAD
// ==========================================

async function uploadTemplateSample(
  token: string,
  appId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ handle?: string; error?: string }> {
  try {
    if (!appId) {
      return { error: "META_APP_ID is missing in environment variables." };
    }

    const params = new URLSearchParams({
      file_name: fileName,
      file_length: String(fileBuffer.length),
      file_type: mimeType,
    });

    // STEP 1: Create upload session
    const sessionResponse = await fetch(
      `${GRAPH_API}/${appId}/uploads?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const sessionData = await sessionResponse.json();

    console.log("META UPLOAD SESSION:", sessionData);

    if (!sessionResponse.ok || !sessionData.id) {
      return {
        error:
          sessionData?.error?.error_user_msg ||
          sessionData?.error?.message ||
          JSON.stringify(sessionData),
      };
    }

    // STEP 2: Upload binary file
    const uploadResponse = await fetch(
      `${GRAPH_API}/${sessionData.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: "0",
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(fileBuffer),
      }
    );

    const uploadData = await uploadResponse.json();

    console.log("META BINARY UPLOAD:", uploadData);

    if (!uploadResponse.ok || !uploadData.h) {
      return {
        error:
          uploadData?.error?.error_user_msg ||
          uploadData?.error?.message ||
          JSON.stringify(uploadData),
      };
    }

    return { handle: uploadData.h };
  } catch (error) {
    console.error("Template sample upload error:", error);

    return {
      error: error instanceof Error ? error.message : "Unknown upload error",
    };
  }
}

// ==========================================
// DOWNLOAD SAMPLE MEDIA FROM URL
// ==========================================

async function downloadSampleFromUrl(
  url: string,
  expectedMimeTypes: string[]
): Promise<{
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    const response = await fetch(url, { redirect: "follow" });

    if (!response.ok) {
      return {
        error: `Could not download sample URL. HTTP ${response.status}`,
      };
    }

    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (contentType && !expectedMimeTypes.includes(contentType)) {
      return {
        error: `URL returned ${contentType}. Expected ${expectedMimeTypes.join(" or ")}.`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = contentType || expectedMimeTypes[0];

    let extension = ".jpg";

    if (mimeType === "video/mp4") extension = ".mp4";
    if (mimeType === "application/pdf") extension = ".pdf";
    if (mimeType === "image/png") extension = ".png";

    return {
      buffer,
      mimeType,
      fileName: `template-sample${extension}`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to download sample URL.",
    };
  }
}

// ==========================================
// CREATE TEMPLATE API
// ==========================================

export async function POST(req: Request) {
  try {
    await connectDB();

    // 1. AUTH CHECK
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. TEMPLATE LIMIT CHECK
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

    // 3. GET USER CREDENTIALS
    const user = await User.findById(userId);

    const META_TOKEN =
      user?.whatsappAccessToken ||
      process.env.META_ACCESS_TOKEN ||
      "";

    const WABA_ID =
      user?.wabaId ||
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
      "";

    const PHONE_NUMBER_ID =
      user?.whatsappPhoneNumberId ||
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      "";

    const APP_ID = process.env.META_APP_ID || "";

    if (!META_TOKEN || !WABA_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "WhatsApp credentials not configured. Please update Settings.",
        },
        { status: 400 }
      );
    }

    if (PHONE_NUMBER_ID && WABA_ID === PHONE_NUMBER_ID) {
      return NextResponse.json(
        {
          success: false,
          wrongWabaId: true,
          message:
            "WABA ID and Phone Number ID must be different. Use your WhatsApp Business Account ID for template creation.",
        },
        { status: 400 }
      );
    }

    // 4. PARSE FORM DATA
    const formData = await req.formData();

    const name = String(formData.get("name") || "").trim();
    const category = String(formData.get("category") || "MARKETING").toUpperCase();
    const language = String(formData.get("language") || "en");

    const componentsStr = formData.get("components");
    const sampleFile = formData.get("sampleFile");
    const sampleSource = String(formData.get("sampleSource") || "upload");
    const sampleUrl = String(formData.get("sampleUrl") || "").trim();

    if (!name || typeof componentsStr !== "string") {
      return NextResponse.json(
        { success: false, message: "Name and components are required." },
        { status: 400 }
      );
    }

    let components: any[];

    try {
      components = JSON.parse(componentsStr);

      if (!Array.isArray(components)) {
        throw new Error("Components must be an array.");
      }
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid components JSON." },
        { status: 400 }
      );
    }

    const safeName = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/__+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 40);

    if (!safeName) {
      return NextResponse.json(
        { success: false, message: "Template name is invalid." },
        { status: 400 }
      );
    }

    // ==========================================
    // 5. HANDLE HEADER SAMPLE MEDIA
    // ==========================================

    const headerComp = components.find(
      (component: any) =>
        String(component.type).toUpperCase() === "HEADER"
    );

    const headerFormat = String(headerComp?.format || "").toUpperCase();

    const isMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(
      headerFormat
    );

    if (isMediaHeader) {
      const allowedMimeTypes = MIME_TYPES[headerFormat];

      let fileBuffer: Buffer | null = null;
      let fileType = "";
      let fileName = "";

      // SOURCE 1: UPLOADED FILE
      if (
        sampleSource === "upload" &&
        sampleFile instanceof File &&
        sampleFile.size > 0
      ) {
        fileBuffer = Buffer.from(await sampleFile.arrayBuffer());

        fileName =
          sampleFile.name ||
          `template-sample${EXTENSIONS[headerFormat]}`;

        const browserMime = (sampleFile.type || "").toLowerCase();
        const extensionMime = getMimeTypeFromName(fileName);

        fileType = browserMime || extensionMime || "";

        if (
          (!browserMime || browserMime === "application/octet-stream") &&
          extensionMime &&
          allowedMimeTypes.includes(extensionMime)
        ) {
          fileType = extensionMime;
        }

        if (!allowedMimeTypes.includes(fileType)) {
          return NextResponse.json(
            {
              success: false,
              message: `Unsupported ${headerFormat.toLowerCase()} file. Accepted: ${allowedMimeTypes.join(", ")}.`,
              receivedMimeType: browserMime || "unknown",
              fileName,
            },
            { status: 400 }
          );
        }
      }

      // SOURCE 2: PUBLIC URL
      else if (sampleSource === "url" && sampleUrl) {
        const downloaded = await downloadSampleFromUrl(
          sampleUrl,
          allowedMimeTypes
        );

        if (!downloaded.buffer || !downloaded.mimeType) {
          return NextResponse.json(
            {
              success: false,
              message:
                downloaded.error || "Could not download sample media.",
            },
            { status: 400 }
          );
        }

        fileBuffer = downloaded.buffer;
        fileType = downloaded.mimeType;
        fileName =
          downloaded.fileName ||
          `template-sample${EXTENSIONS[headerFormat]}`;
      } else {
        return NextResponse.json(
          {
            success: false,
            message: "Media header requires a sample file or URL.",
          },
          { status: 400 }
        );
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return NextResponse.json(
          { success: false, message: "The selected sample file is empty." },
          { status: 400 }
        );
      }

      // FILE SIZE VALIDATION
      const maxSize = MAX_MEDIA_SIZE[headerFormat];

      if (fileBuffer.length > maxSize) {
        return NextResponse.json(
          {
            success: false,
            message: `${headerFormat} sample exceeds the ${Math.floor(maxSize / (1024 * 1024))} MB limit.`,
          },
          { status: 400 }
        );
      }

      if (!APP_ID) {
        return NextResponse.json(
          {
            success: false,
            message: "META_APP_ID is missing in environment variables.",
          },
          { status: 500 }
        );
      }

      // UPLOAD SAMPLE TO META
      const uploadResult = await uploadTemplateSample(
        META_TOKEN,
        APP_ID,
        fileBuffer,
        fileName,
        fileType
      );

      if (!uploadResult.handle) {
        return NextResponse.json(
          {
            success: false,
            message: `Failed to upload template sample to Meta: ${uploadResult.error || "Unknown error"}`,
          },
          { status: 400 }
        );
      }

      // ATTACH META HANDLE TO HEADER
      headerComp.example = {
        ...(headerComp.example || {}),
        header_handle: [uploadResult.handle],
      };

      console.log("Template header handle attached successfully.");
    }

    // ==========================================
    // 6. VALIDATE BODY VARIABLES
    // ==========================================

    if (category !== "AUTHENTICATION") {
      const bodyComp = components.find(
        (component: any) =>
          String(component.type).toUpperCase() === "BODY"
      );

      if (bodyComp?.text) {
        const variableMatches = bodyComp.text.match(/\{\{(\d+)\}\}/g);

        if (variableMatches?.length) {
          const hasBodyExample =
            Array.isArray(bodyComp.example?.body_text) &&
            bodyComp.example.body_text.length > 0 &&
            Array.isArray(bodyComp.example.body_text[0]) &&
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
    }

    // ==========================================
    // 7. BUILD META TEMPLATE COMPONENTS
    // ==========================================

    let metaComponents: any[] = [];

    if (category === "AUTHENTICATION") {
      metaComponents.push({
        type: "BODY",
        add_security_recommendation: true,
      });

      const footerComp = components.find(
        (component: any) =>
          String(component.type).toUpperCase() === "FOOTER"
      );

      if (footerComp?.code_expiration_minutes) {
        metaComponents.push({
          type: "FOOTER",
          code_expiration_minutes: Number(
            footerComp.code_expiration_minutes
          ),
        });
      }

      metaComponents.push({
        type: "BUTTONS",
        buttons: [
          {
            type: "OTP",
            otp_type: "COPY_CODE",
            text: "Copy Code",
          },
        ],
      });
    } else {
      metaComponents = components.map((comp: any) => {
        const compType = String(comp.type || "").toUpperCase();
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
          metaComp.buttons = (comp.buttons || []).map((button: any) => {
            const metaButton: any = {
              type: button.type,
              text: button.text,
            };

            if (button.type === "URL" && button.url) {
              metaButton.url = button.url;
            }

            if (button.type === "PHONE_NUMBER" && button.phone_number) {
              metaButton.phone_number = button.phone_number;
            }

            return metaButton;
          });
        }

        return metaComp;
      });
    }

    const metaPayload = {
      name: safeName,
      category,
      language,
      components: metaComponents,
    };

    // ==========================================
    // 8. SUBMIT TEMPLATE TO META
    // ==========================================

    console.log("META TEMPLATE PAYLOAD:", JSON.stringify(metaPayload, null, 2));

    const metaResponse = await fetch(
      `${GRAPH_API}/${WABA_ID}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaData = await metaResponse.json();

    if (!metaResponse.ok || metaData.error) {
      const errorMessage =
        metaData.error?.error_user_msg ||
        metaData.error?.message ||
        "Meta rejected the template.";

      console.error("Meta template creation error:", metaData.error || metaData);

      return NextResponse.json(
        {
          success: false,
          message: errorMessage,
          metaError: metaData.error || null,
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 9. SAVE TEMPLATE IN DATABASE
    // ==========================================

    const tenantId =
      (session.user as any)?.parentTenantId ||
      (session.user as any)?.tenantId ||
      null;

    const template = await Template.create({
      userId,
      tenantId,
      createdBy: userId,
      name: safeName,
      category,
      language,
      components,
      status: "submitted",
      metaTemplateId: metaData.id,
    });

    await incrementUsage(userId, "templates");

    return NextResponse.json({
      success: true,
      message: "Template submitted successfully! Pending Meta approval.",
      meta: metaData,
      template,
    });
  } catch (error) {
    console.error("Error in /api/templates/create:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
