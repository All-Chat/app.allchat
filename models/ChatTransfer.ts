import mongoose from "mongoose";

const ChatTransferSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true },
  transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  transferredAt: { type: Date, default: Date.now },
});

// Ensure one active transfer per phone per tenant
ChatTransferSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

export default mongoose.models.ChatTransfer || mongoose.model("ChatTransfer", ChatTransferSchema);
