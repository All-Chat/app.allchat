import mongoose from "mongoose";

const OptNumberSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  
  // ==========================================
  // 🔴 MULTI-TENANT DATA ISOLATION
  // ==========================================
  tenantId: { type: String, default: null, index: true },
  createdBy: { type: String, default: null, index: true },

  phoneNumber: { type: String, required: true },
  workflowId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.OptNumber || mongoose.model("OptNumber", OptNumberSchema);
