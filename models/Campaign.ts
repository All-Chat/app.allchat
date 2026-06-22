import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
  // ==========================================
  // 🔴 MULTI-TENANT DATA ISOLATION
  // ==========================================
  tenantId: { type: String, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  
  name: { type: String, required: true },
  templateName: { type: String, required: true },
  templateCategory: { type: String, default: "MARKETING" },
  
  // ✅ NEW: Stores the _id of the selected WhatsApp number
  senderPhoneId: { type: String, default: null }, 
  
  variables: { type: [String], default: [] },
  mappedVariables: { type: [[String]], default: [] }, 
  generateOtp: { type: Boolean, default: false },
  otpLength: { type: Number, default: 0 },

  phoneNumbers: { type: [String], required: true },
  names: { type: [String], default: [] },
  languageCode: { type: String, default: "en" },
  
  reportData: {
    type: [
      {
        phone: String,
        name: String,
        status: String,
        sentWamid: String,
        replies: [String],
        tags: [String], 
      }
    ],
    default: []
  },
  
  mediaUrl: { type: String, default: null },
  mediaType: { type: String, default: null },
  status: {
    type: String,
    enum: ["saved", "scheduled", "running", "paused", "stopped", "completed", "failed"],
    default: "saved",
  },
  scheduledAt: { type: Date, default: null },
  totalMessages: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  
  totalDeducted: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema);
