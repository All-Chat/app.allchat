import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  mediaId: { type: String, required: true }, // The ID returned by Meta
  type: { type: String, enum: ["image", "video", "audio", "document"], required: true },
  filename: { type: String, default: "Unknown" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Media ||
  mongoose.model("Media", MediaSchema);
