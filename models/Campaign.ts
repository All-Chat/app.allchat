import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  templateName: { type: String, required: true },
  templateCategory: { type: String, default: "MARKETING" },
  variables: { type: [String], default: [] },
  phoneNumbers: { type: [String], required: true },
  names: { type: [String], default: [] },
  languageCode: { type: String, default: "en" },
  reportData: { type: [Object], default: [] },
  mediaUrl: { type: String, default: null },
  mediaType: { type: String, default: null },
  status: {
    type: String,
    enum: ["saved", "scheduled", "running", "completed", "failed"],
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