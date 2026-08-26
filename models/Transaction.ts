import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, required: true, index: true }, // e.g., "recharge", "test_message", "refund", "campaign"
  amount: { type: Number, required: true },
  description: { type: String, default: "" },
  status: { type: String, default: "success", index: true }, // e.g., "success", "failed", "pending"
  createdAt: { type: Date, default: Date.now, index: true },
  metadata: { 
    type: Object, 
    default: {} 
  } // Stores campaignName, templateName, phone, wamid, etc.
});

export default mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema);
