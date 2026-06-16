import mongoose from "mongoose";

const TemplateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // ← ADDED
  name: { type: String, required: true },
  category: { type: String, default: "MARKETING" },
  language: { type: String, default: "en_US" },
  components: { type: Array, default: [] },
  status: { type: String, default: "pending" },
  metaTemplateId: { type: String },
  error: { type: Object },
}, { timestamps: true });

export default mongoose.models.Template || mongoose.model("Template", TemplateSchema);