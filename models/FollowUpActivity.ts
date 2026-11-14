import mongoose, { Schema, models } from "mongoose";

const FollowUpActivitySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tenantId: { type: String, default: null, index: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    agentName: { type: String, default: "" },
    leadTypeId: {
      type: Schema.Types.ObjectId,
      ref: "LeadType",
      required: true,
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    contactName: { type: String, required: true },
    phone: { type: String, required: true },
    personContacted: { type: String, required: true, trim: true },
    occurredAt: { type: Date, required: true, index: true },
    interactionType: {
      type: String,
      enum: ["Call", "WhatsApp", "Meeting", "Email", "Other"],
      required: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    outcome: {
      type: String,
      enum: [
        "Interested",
        "Not Interested",
        "No Answer",
        "Call Back Requested",
        "Negotiation in Progress",
        "Meeting Scheduled",
        "Converted",
        "Other",
      ],
      required: true,
    },
    nextFollowUpAt: { type: Date, default: null },
    reminderId: {
      type: Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

FollowUpActivitySchema.index({
  tenantId: 1,
  leadTypeId: 1,
  contactId: 1,
  occurredAt: -1,
});

FollowUpActivitySchema.index({
  userId: 1,
  leadTypeId: 1,
  contactId: 1,
  occurredAt: -1,
});

const FollowUpActivity =
  models.FollowUpActivity ||
  mongoose.model("FollowUpActivity", FollowUpActivitySchema);

export default FollowUpActivity;
