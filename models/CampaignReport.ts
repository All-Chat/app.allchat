import mongoose from "mongoose";

const CampaignReportSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
  // Contact details
  phone: { type: String, required: true, index: true },
  name: { type: String, default: "" },
  additionalData: { type: [String], default: [] },
  
  // Message status & tracking
  status: { type: String, default: "pending", index: true }, // pending, queued, sent, delivered, read, failed, invalid, duplicate, replied
  sentWamid: { type: String, default: null, index: true },
  error: { type: String, default: null },
  
  // Timestamps
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  repliedAt: { type: Date, default: null },
  
  // Replies
  replies: { type: [String], default: [] },
  replyTimes: { type: [Date], default: [] },
  
  // Tags
  tags: { type: [String], default: [] },
  
  // Billing
  charged: { type: Boolean, default: false },
  chargedAmount: { type: Number, default: 0 },
});

// Compound index to quickly find/update a specific contact in a campaign
CampaignReportSchema.index({ campaignId: 1, phone: 1 }, { unique: true });

export default mongoose.models.CampaignReport || mongoose.model("CampaignReport", CampaignReportSchema);
