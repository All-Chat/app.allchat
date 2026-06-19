/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import ScheduledTrigger from "@/models/ScheduledTrigger";
import User from "@/models/User";
import Contact from "@/models/Contact";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/limits"; // ✅ LIMIT ADDED

export async function POST(req: Request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // ✅ LIMIT ADDED: Check campaign creation limit
    const limitCheck = await checkLimit(userId, "campaigns");
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `Campaign limit reached. You have used ${limitCheck.currentUsage}/${limitCheck.limit} campaigns per ${limitCheck.period}. Contact admin to increase your limit.`,
          limitExceeded: true,
          limitInfo: {
            resource: "campaigns",
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
    // PARSE FORMDATA OR JSON
    // ==========================================
    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    let mediaFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body.name = formData.get("name");
      body.templateName = formData.get("templateName");
      body.templateCategory = formData.get("templateCategory");
      body.variables = JSON.parse((formData.get("variables") as string) || "[]");
      body.phoneNumbers = JSON.parse((formData.get("phoneNumbers") as string) || "[]");
      body.names = JSON.parse((formData.get("names") as string) || "[]");
      body.mediaUrl = (formData.get("mediaUrl") as string) || "";
      body.mediaType = (formData.get("mediaType") as string) || "";
      body.languageCode = (formData.get("languageCode") as string) || "en";
      body.scheduledAt =
        formData.get("scheduledAt") === "null" || !formData.get("scheduledAt")
          ? null
          : (formData.get("scheduledAt") as string);
      mediaFile = formData.get("file") as File | null;
    } else {
      body = await req.json();
    }

    const {
      name, templateName, templateCategory, variables, phoneNumbers, names,
      mediaUrl, mediaType, languageCode, scheduledAt,
    } = body;

    if (!name || !templateName || !phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json(
        { success: false, message: "Name, template, and phone numbers are required." },
        { status: 400 }
      );
    }

    // ==========================================
    // UPLOAD FILE TO WHATSAPP IF PROVIDED
    // ==========================================
    let finalMediaUrl = mediaUrl;

    if (mediaFile) {
      const user = await User.findById(userId);
      const token = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
      const phoneNumberId = user?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

      if (!token || !phoneNumberId) {
        return NextResponse.json(
          { success: false, message: "WhatsApp credentials not configured for file upload." },
          { status: 400 }
        );
      }

      const mediaFormData = new FormData();
      mediaFormData.append("file", mediaFile);
      mediaFormData.append("messaging_product", "whatsapp");

      const uploadRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: mediaFormData }
      );

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        console.error("Media upload error:", uploadData.error);
        return NextResponse.json(
          { success: false, message: uploadData.error?.message || "Failed to upload media to WhatsApp" },
          { status: 500 }
        );
      }

      finalMediaUrl = uploadData.id;
      console.log("✅ Media uploaded to WhatsApp. ID:", finalMediaUrl);
    }

    // ==========================================
    // DUPLICATE NAME CHECK
    // ==========================================
    const existingCampaign = await Campaign.findOne({ name: name.trim(), userId });
    if (existingCampaign) {
      return NextResponse.json(
        { success: false, message: "A campaign with this name already exists." },
        { status: 400 }
      );
    }

    // ==========================================
    // FETCH EXISTING TAGS FROM CONTACTS DB
    // ==========================================
    const existingContacts = await Contact.find({ 
      userId, 
      phone: { $in: phoneNumbers } 
    }).select('phone tags');
    
    const contactTagsMap = new Map();
    existingContacts.forEach(c => {
      contactTagsMap.set(c.phone, c.tags || []);
    });

    // ==========================================
    // CREATE CAMPAIGN
    // ==========================================
    const reportData = phoneNumbers.map((phone: string, index: number) => ({
      name: names?.[index] || "",
      phone,
      status: "pending",
      replies: [],
      tags: contactTagsMap.get(phone) || [],
    }));

    const newCampaign = await Campaign.create({
      userId,
      name: name.trim(),
      templateName,
      templateCategory,
      variables,
      phoneNumbers,
      names: names || [],
      mediaUrl: finalMediaUrl,
      mediaType,
      languageCode: languageCode || "en",
      scheduledAt: scheduledAt || null,
      totalMessages: phoneNumbers.length,
      status: scheduledAt ? "scheduled" : "saved",
      sentCount: 0,
      failedCount: 0,
      reportData,
    });

    if (scheduledAt) {
      await ScheduledTrigger.create({
        userId,
        campaignId: newCampaign._id,
        expireAt: new Date(scheduledAt),
        processed: false,
      });
    }

    // ✅ LIMIT ADDED: Increment campaign usage after successful creation
    await incrementUsage(userId, "campaigns");

    return NextResponse.json({ success: true, campaign: newCampaign });
  } catch (error: any) {
    console.error("❌ Save Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
