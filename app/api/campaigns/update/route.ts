/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import ScheduledTrigger from "@/models/ScheduledTrigger";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    let mediaFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body.id = formData.get("id") || null;
      body.name = formData.get("name");
      body.templateName = formData.get("templateName");
      body.templateCategory = formData.get("templateCategory");
      body.variables = JSON.parse((formData.get("variables") as string) || "[]");
      body.phoneNumbers = JSON.parse((formData.get("phoneNumbers") as string) || "[]");
      body.names = JSON.parse((formData.get("names") as string) || "[]");
      
      // ✅ NEW: Parse additional fields
      body.additionalFields = JSON.parse((formData.get("additionalFields") as string) || "[]");
      body.additionalFieldsData = JSON.parse((formData.get("additionalFieldsData") as string) || "[]");
      
      body.mediaUrl = (formData.get("mediaUrl") as string) || "";
      body.mediaType = (formData.get("mediaType") as string) || "";
      body.languageCode = (formData.get("languageCode") as string) || "en";
      body.scheduledAt = formData.get("scheduledAt") === "null" || !formData.get("scheduledAt") ? null : (formData.get("scheduledAt") as string);
      mediaFile = formData.get("file") as File | null;
    } else {
      body = await req.json();
    }

    const { id, name, templateName, templateCategory, variables, phoneNumbers, names, mediaUrl, mediaType, languageCode, scheduledAt, additionalFields, additionalFieldsData } = body;

    if (!id) return NextResponse.json({ success: false, message: "Campaign ID required" }, { status: 400 });
    if (!name || !templateName || !phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json({ success: false, message: "Name, template, and phone numbers are required." }, { status: 400 });
    }

    // ✅ NEW: Name uniqueness check (excluding current campaign ID, case-insensitive)
    const existingCampaign = await Campaign.findOne({ 
      _id: { $ne: id }, 
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") }, 
      userId 
    });
    if (existingCampaign) return NextResponse.json({ success: false, message: "A campaign with this name already exists. Please use another name." }, { status: 400 });

    let finalMediaUrl = mediaUrl;
    if (mediaFile) {
      const user = await User.findById(userId);
      const token = user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
      const phoneNumberId = user?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) return NextResponse.json({ success: false, message: "WhatsApp credentials not configured for file upload." }, { status: 400 });

      const mediaFormData = new FormData();
      mediaFormData.append("file", mediaFile);
      mediaFormData.append("messaging_product", "whatsapp");

      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: mediaFormData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        console.error("Media upload error:", uploadData.error);
        return NextResponse.json({ success: false, message: uploadData.error?.message || "Failed to upload media to WhatsApp" }, { status: 500 });
      }
      finalMediaUrl = uploadData.id;
    }

    // ✅ Updated reportData mapping to include additionalData
    const reportData = phoneNumbers.map((phone: string, index: number) => ({ 
      name: names?.[index] || "", 
      phone, 
      status: "pending", 
      replies: [],
      additionalData: additionalFieldsData?.[index] || []
    }));

    const updatedCampaign = await Campaign.findOneAndUpdate(
      { _id: id, userId },
      { 
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
        status: scheduledAt ? "scheduled" : "saved", 
        sentCount: 0, 
        failedCount: 0, 
        totalMessages: phoneNumbers.length, 
        reportData,
        // ✅ NEW: Save additional fields
        additionalFields: additionalFields || [],
        additionalFieldsData: additionalFieldsData || []
      },
      { new: true }
    );

    if (!updatedCampaign) return NextResponse.json({ success: false, message: "Campaign not found or not authorized" }, { status: 404 });

    await ScheduledTrigger.deleteMany({ campaignId: id });
    if (scheduledAt) {
      await ScheduledTrigger.create({ userId, campaignId: id, expireAt: new Date(scheduledAt), processed: false });
    }

    return NextResponse.json({ success: true, campaign: updatedCampaign });
  } catch (error: any) {
    console.error("❌ Update Campaign Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
