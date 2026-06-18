import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  workflowId: { type: mongoose.Schema.Types.ObjectId, ref: "Workflow" },
  currentStepId: { type: String, default: null },
  
  // 🔴 NEW FORM FIELDS
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", default: null },
  formFieldIndex: { type: Number, default: 0 },
  
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.Session || mongoose.model("Session", SessionSchema);
