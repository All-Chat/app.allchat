import { NextResponse } from "next/server";

const WHATSAPP_TOKEN = process.env.META_ACCESS_TOKEN;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const headerType = formData.get("headerType") as string; // Get type to enforce strict MIME
    
    if (!file) {
      return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
    }

    // Meta is very strict about file_type. We enforce it based on UI selection.
    let fileType = file.type;
    if (headerType === "image") fileType = "image/jpeg"; // or image/png
    if (headerType === "video") fileType = "video/mp4";
    if (headerType === "document") fileType = "application/pdf";

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileSize = fileBuffer.length;

    // STEP 1: Create Upload Session
    const sessionRes = await fetch(
      `https://graph.facebook.com/v19.0/${WABA_ID}/uploads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_length: fileSize,
          file_type: fileType,
        }),
      }
    );

    const sessionData = await sessionRes.json();
    
    if (!sessionRes.ok || !sessionData.id) {
      console.error("❌ Meta Session Error:", sessionData);
      return NextResponse.json({ 
        success: false, 
        message: sessionData.error?.error_user_msg || sessionData.error?.message || "Failed to create upload session. Check Token & WABA ID."
      }, { status: 400 });
    }

    // STEP 2: Upload Binary File
    const uploadRes = await fetch(
      `https://graph.facebook.com/v19.0/${sessionData.id}`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${WHATSAPP_TOKEN}`, // Must be OAuth for binary
          "Content-Type": fileType,
        },
        body: fileBuffer,
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.h) {
      console.error("❌ Meta Binary Error:", uploadData);
      return NextResponse.json({ 
        success: false, 
        message: uploadData.error?.error_user_msg || "Failed to upload binary file."
      }, { status: 400 });
    }

    return NextResponse.json({ success: true, handle: uploadData.h });

  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}