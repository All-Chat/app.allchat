import mongoose from "mongoose";

const OptNumberSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  phoneNumber: { type: String, required: true },
  workflowId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.OptNumber || mongoose.model("OptNumber", OptNumberSchema);
