import mongoose from "mongoose";

const ContactSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  phone: { type: String, required: true, index: true },
  name: { type: String, default: "Unknown" },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

// This ensures one user can't have duplicate phone numbers
ContactSchema.index({ userId: 1, phone: 1 }, { unique: true });

export default mongoose.models.Contact ||
  mongoose.model("Contact", ContactSchema);
