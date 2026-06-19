import mongoose from "mongoose";

const TagSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
  // ==========================================
  // 🔴 MULTI-TENANT DATA ISOLATION
  // ==========================================
  tenantId: { type: String, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

  name: { type: String, required: true, trim: true },
  isCampaignSpecific: { type: Boolean, default: false },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  campaignName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Tag || mongoose.model("Tag", TagSchema);
