import mongoose from "mongoose";

const CampaignReportSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
  // ✅ NEW: Stores the original index from the phoneNumbers array
  index: { type: Number, required: true, index: true }, 
  
  phone: { type: String, required: true, index: true },
  name: { type: String, default: "" },
  additionalData: { type: [String], default: [] },
  
  status: { type: String, default: "pending", index: true },
  sentWamid: { type: String, default: null, index: true },
  error: { type: String, default: null },
  
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  repliedAt: { type: Date, default: null },
  
  replies: { type: [String], default: [] },
  replyTimes: { type: [Date], default: [] },
  tags: { type: [String], default: [] },
  
  charged: { type: Boolean, default: false },
  chargedAmount: { type: Number, default: 0 },
  
  createdAt: { type: Date, default: Date.now }
});

CampaignReportSchema.index({ campaignId: 1, phone: 1 }, { unique: true });

export default mongoose.models.CampaignReport || mongoose.model("CampaignReport", CampaignReportSchema);
