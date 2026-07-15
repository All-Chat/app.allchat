/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import ScheduledTrigger from "@/models/ScheduledTrigger";
import User from "@/models/User";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId)
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );

    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    let mediaFile: File | null = null;

    // ─── Parse body ───
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body.id = formData.get("id") as string;
      body.name = formData.get("name") as string;
      body.templateName = formData.get("templateName") as string;
      body.templateCategory = formData.get("templateCategory") as string;
      body.variables = JSON.parse((formData.get("variables") as string) || "[]");
      body.mappedVariables = JSON.parse(
        (formData.get("mappedVariables") as string) || "[]"
      );
      body.generateOtp = JSON.parse(
        (formData.get("generateOtp") as string) || "false"
      );
      body.otpLength = JSON.parse((formData.get("otpLength") as string) || "0");
      body.phoneNumbers = JSON.parse(
        (formData.get("phoneNumbers") as string) || "[]"
      );
      body.names = JSON.parse((formData.get("names") as string) || "[]");
      body.additionalFields = JSON.parse(
        (formData.get("additionalFields") as string) || "[]"
      );
      body.additionalFieldsData = JSON.parse(
        (formData.get("additionalFieldsData") as string) || "[]"
      );
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
      id,
      name,
      templateName,
      templateCategory,
      variables,
      mappedVariables,
      generateOtp,
      otpLength,
      phoneNumbers,
      names,
      mediaUrl,
      mediaType,
      languageCode,
      scheduledAt,
      additionalFields,
      additionalFieldsData,
    } = body;

    // ─── Validate ID ───
    if (!id || !mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing Campaign ID" },
        { status: 400 }
      );
    }

    if (!name || !templateName || !phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Name, template, and phone numbers are required.",
        },
        { status: 400 }
      );
    }

    // ─── Name uniqueness check ───
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingCampaign = await Campaign.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      userId, 
    });

    if (existingCampaign) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A campaign with this name already exists. Please use another name.",
        },
        { status: 400 }
      );
    }

    // ─── Handle media upload ───
    let finalMediaUrl = mediaUrl;
    if (mediaFile) {
      const user = await User.findById(userId);
      const token =
        user?.whatsappAccessToken || process.env.META_ACCESS_TOKEN;
      const phoneNumberId =
        user?.whatsappPhoneNumberId ||
        process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId)
        return NextResponse.json(
          {
            success: false,
            message: "WhatsApp credentials not configured for file upload.",
          },
          { status: 400 }
        );

      const mediaFormData = new FormData();
      mediaFormData.append("file", mediaFile);
      mediaFormData.append("messaging_product", "whatsapp");

      const uploadRes = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: mediaFormData,
        }
      );
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || uploadData.error || !uploadData.id) {
        console.error("Media upload error:", uploadData.error);
        return NextResponse.json(
          {
            success: false,
            message:
              uploadData.error?.message || "Failed to upload media to WhatsApp",
          },
          { status: 500 }
        );
      }
      finalMediaUrl = uploadData.id;
    }

    // ─── Build report data ───
    const reportData = phoneNumbers.map((phone: string, index: number) => ({
      name: names?.[index] || "",
      phone,
      status: "pending",
      replies: [],
      additionalData: additionalFieldsData?.[index] || [],
    }));

    // ─── Build update object ───
    const updateData: any = {
      name: name.trim(),
      templateName,
      templateCategory,
      variables,
      mappedVariables: mappedVariables || [],
      generateOtp: generateOtp || false,
      otpLength: generateOtp ? parseInt(otpLength, 10) : 0,
      phoneNumbers,
      names: names || [],
      mediaUrl: finalMediaUrl || "",
      mediaType: mediaType || "",
      languageCode: languageCode || "en",
      scheduledAt: scheduledAt || null,
      status: scheduledAt ? "scheduled" : "saved",
      sentCount: 0,
      failedCount: 0,
      totalMessages: phoneNumbers.length,
      totalDeducted: 0, // ✅ FIX: Reset spent amount
      liveStats: {      // ✅ FIX: Reset live stats so UI fetches new count instead of old cached stats
        total: phoneNumbers.length,
        replied: 0,
        read: 0,
        delivered: 0,
        sent: 0,
        failed: 0,
        invalid: 0,
        duplicate: 0,
        pending: 0,
        deliveredRead: 0,
        failedInvalid: 0,
        progress: 0,
      },
      reportData,
      additionalFields: additionalFields || [],
      additionalFieldsData: additionalFieldsData || [],
    };

    // ─── Update campaign ───
    const updatedCampaign = await Campaign.findOneAndUpdate(
      { _id: id, userId }, 
      { $set: updateData },
      { new: true, runValidators: false }
    );

    if (!updatedCampaign)
      return NextResponse.json(
        {
          success: false,
          message: "Campaign not found or not authorized",
        },
        { status: 404 }
      );

    // ─── Handle scheduled trigger ───
    try {
      await ScheduledTrigger.deleteMany({ campaignId: id });
      if (scheduledAt) {
        await ScheduledTrigger.create({
          userId,
          campaignId: id,
          expireAt: new Date(scheduledAt),
          processed: false,
        });
      }
    } catch (triggerErr) {
      console.error("⚠️ ScheduledTrigger error:", triggerErr);
    }

    return NextResponse.json({ success: true, campaign: updatedCampaign });
  } catch (error: any) {
    console.error("❌ Update Campaign Error:", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
