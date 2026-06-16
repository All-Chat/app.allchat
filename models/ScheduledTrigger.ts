import mongoose from "mongoose";

const ScheduledTriggerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // ← ADDED
  campaignId: { type: String, required: true, index: true },
  expireAt: { type: Date, required: true },
  processed: { type: Boolean, default: false },
});

ScheduledTriggerSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ScheduledTrigger || mongoose.model("ScheduledTrigger", ScheduledTriggerSchema);