import mongoose from "mongoose";

const FormResponseSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
  userId: { type: String, required: true, index: true },
  phone: { type: String },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["incomplete", "complete"], default: "incomplete" }, // 🔴 NEW
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.FormResponse || mongoose.model("FormResponse", FormResponseSchema);
