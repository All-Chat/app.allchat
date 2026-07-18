import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tenantId: { type: String, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  
  name: { type: String, required: true },
  templateName: { type: String, required: true },
  templateCategory: { type: String, default: "MARKETING" },
  senderPhoneId: { type: String, default: null }, 
  
  variables: { type: [String], default: [] },
  mappedVariables: { type: [[String]], default: [] }, 
  generateOtp: { type: Boolean, default: false },
  otpLength: { type: Number, default: 0 },

  phoneNumbers: { type: [String], required: true },
  names: { type: [String], default: [] },
  languageCode: { type: String, default: "en" },
  
  additionalFields: { type: [String], default: [] },
  additionalFieldsData: { type: [[String]], default: [] },
  
  reportData: {
    type: [
      {
        phone: String,
        name: String,
        status: String,
        sentWamid: String,
        error: String,
        replies: [String],
        reply: String,
        deliveredAt: Date, 
        readAt: Date,         
        repliedAt: Date,      
        replyTimes: [Date],   
        tags: [String],
        additionalData: { type: [String], default: [] },
      }
    ],
    default: []
  },
  stats: {
    replied:   { type: Number, default: 0 },
    read:      { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    sent:      { type: Number, default: 0 },
    failed:    { type: Number, default: 0 },
    invalid:   { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
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
  
  // ✅ NEW: Add these two fields to store the URLs permanently in the database
  sheetUrl: { type: String, default: null },
  standaloneSheetUrl: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema);
