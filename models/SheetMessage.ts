import mongoose from "mongoose";

const SheetMessageSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    campaignId: { type: String, default: null }, // ✅ NEW: Strictly separate reports
    phone: { type: String, required: true },
    name: { type: String, default: "" },
    text: { type: String, default: "" },
    direction: { type: String, enum: ["in", "out"], required: true },
    status: { type: String, default: "sent" },
    messageType: { type: String, default: "text" },
    mediaUrl: { type: String, default: null },
    whatsappMessageId: { type: String, default: null },
    templateName: { type: String, default: null },
    templateLanguage: { type: String, default: null },
    whatsappPhoneNumberId: { type: String, default: null },
    replies: { type: [String], default: [] },
    additionalData: { type: [String], default: [] },
    isSheetCampaign: { type: Boolean, default: true }
  },
  { 
    timestamps: true,
    strict: false 
  }
);

export default mongoose.models.SheetMessage || mongoose.model("SheetMessage", SheetMessageSchema, "messages");
