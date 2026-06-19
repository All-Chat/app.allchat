import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  templateName: { type: String, required: true },
  templateCategory: { type: String, default: "MARKETING" },
  
  // ✅ ADDED/UPDATED VARIABLE FIELDS
  variables: { type: [String], default: [] },
  mappedVariables: { type: [[String]], default: [] }, // Array of arrays for per-contact variables
  generateOtp: { type: Boolean, default: false },
  otpLength: { type: Number, default: 0 },

  phoneNumbers: { type: [String], required: true },
  names: { type: [String], default: [] },
  languageCode: { type: String, default: "en" },
  
  // ==========================================
  // 🔴 FIX: Explicitly define reportData structure so Mongoose saves tags
  // ==========================================
  reportData: {
    type: [
      {
        phone: String,
        name: String,
        status: String,
        sentWamid: String,
        replies: [String],
        tags: [String], // <--- This allows tags to be saved permanently!
      }
    ],
    default: []
  },
  
  mediaUrl: { type: String, default: null },
  mediaType: { type: String, default: null },
  status: {
    type: String,
    // ✅ FIX: Added "paused" and "stopped" to the enum to prevent Mongoose validation errors
    enum: ["saved", "scheduled", "running", "paused", "stopped", "completed", "failed"],
    default: "saved",
  },
  scheduledAt: { type: Date, default: null },
  totalMessages: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  
  // ==========================================
  // 🔴 NEW: TOTAL AMOUNT DEDUCTED
  // ==========================================
  totalDeducted: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Campaign || mongoose.model("Campaign", CampaignSchema);
