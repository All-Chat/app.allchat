import mongoose from "mongoose";

const SettingsRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  userName: { type: String, required: true },
  wabaId: { type: String, default: null },
  whatsappPhoneNumberId: { type: String, default: null },
  whatsappAccessToken: { type: String, default: null }, // Stores the new requested token
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  adminNote: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.models.SettingsRequest || mongoose.model("SettingsRequest", SettingsRequestSchema);
