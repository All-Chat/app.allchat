/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Template from "@/models/Template";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const WHATSAPP_API = "https://graph.facebook.com/v25.0";

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
    // 2. GET CREDENTIALS FROM DATABASE
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

    if (WABA_ID === PHONE_NUMBER_ID) {
      return NextResponse.json(
        {
          success: false,
          message: "Your WABA ID and Phone Number ID are the SAME. They must be different.",
          wrongWabaId: true,
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 3. PARSE REQUEST DATA
    // ==========================================
    const bodyReq = await req.json();
    const { id, name, category, language, body: newBodyText } = bodyReq;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Template ID is required" },
        { status: 400 }
      );
    }

    // ==========================================
    // 4. FIND TEMPLATE IN DB (FIX CAST ERROR)
    // ==========================================
    let query: any = { userId };
    if (mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id) {
      query._id = id;
    } else {
      query.metaTemplateId = id;
    }

    const template = await Template.findOne(query);

    if (!template) {
      return NextResponse.json(
        { success: false, message: "Template not found or you do not have permission to edit it." },
        { status: 404 }
      );
    }

    // ==========================================
    // 5. CONSTRUCT COMPONENTS FOR PAYLOAD
    // ==========================================
    // We preserve the original components (like Headers, Footers, Buttons) 
    // and update the BODY text and Category.
    let components = template.components || [];
    
    let hasBody = false;
    components = components.map((comp: any) => {
      if (comp.type === "BODY") {
        hasBody = true;
        const updatedBodyText = newBodyText !== undefined ? newBodyText : comp.text;
        
        // Preserve examples if variables still exist in the new text
        let example = undefined;
        if (comp.example?.body_text) {
          const variableMatches = updatedBodyText.match(/\{\{(\d+)\}\}/g);
          if (variableMatches && variableMatches.length > 0) {
            example = comp.example;
          }
        }
        
        return {
          ...comp,
          text: updatedBodyText,
          example: example
        };
      }
      return comp;
    });

    if (!hasBody && newBodyText) {
      components.push({
        type: "BODY",
        text: newBodyText
      });
    }

    // ==========================================
    // 6. VALIDATE BODY VARIABLES
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
    // 7. BUILD META API PAYLOAD
    // ==========================================
    let metaComponents: any[] = [];

    if (category === "AUTHENTICATION") {
      metaComponents.push({
        type: "BODY",
        add_security_recommendation: true
      });

      const footerComp = components.find((c: any) => c.type.toUpperCase() === "FOOTER");
      if (footerComp && footerComp.code_expiration_minutes) {
        metaComponents.push({
          type: "FOOTER",
          code_expiration_minutes: Number(footerComp.code_expiration_minutes)
        });
      }

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

    // Meta's Update API only accepts `category` and `components`. 
    // You CANNOT update `name` or `language` after creation.
    const metaPayload = {
      category: category || template.category,
      components: metaComponents,
    };

    // ==========================================
    // 8. SUBMIT UPDATE TO META
    // ==========================================
    console.log(`📤 Updating template ${template.metaTemplateId}...`);
    console.log("📤 UPDATE PAYLOAD:", JSON.stringify(metaPayload, null, 2));

    const metaRes = await fetch(
      `${WHATSAPP_API}/${template.metaTemplateId}`,
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
        "Meta rejected the template update.";

      console.error("Meta template update error:", JSON.stringify(metaData.error, null, 2));

      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: 400 }
      );
    }

    // ==========================================
    // 9. UPDATE LOCAL DB
    // ==========================================
    if (category) template.category = category;
    
    // Save the updated components back to the DB
    template.components = components;
    
    // Meta resets status to PENDING after an edit
    template.status = metaData.status || "pending";
    
    await template.save();

    console.log(`✅ Template "${template.name}" updated successfully!`);

    return NextResponse.json({
      success: true,
      message: "Template updated successfully! Meta is reviewing the changes.",
      meta: metaData,
      template,
    });
  } catch (err: any) {
    console.error("Error in /api/templates/update:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
