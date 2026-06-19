import mongoose from "mongoose";

const SettingsRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  userName: { type: String, required: true },
  requestType: { type: String, enum: ["add", "edit"], default: "add" },
  numberId: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, default: "WhatsApp Number" },
  wabaId: { type: String, default: null },
  whatsappPhoneNumberId: { type: String, default: null },
  whatsappAccessToken: { type: String, default: null }, 
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  adminNote: { type: String, default: "" }
}, { timestamps: true });

// ✅ FORCE MONGOOSE TO DROP THE CACHED MODEL SO IT USES THE NEW SCHEMA
if (mongoose.models.SettingsRequest) {
  delete mongoose.models.SettingsRequest;
}

export default mongoose.model("SettingsRequest", SettingsRequestSchema);
