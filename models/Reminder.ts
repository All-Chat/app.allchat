
import mongoose, { Schema, models } from "mongoose";

const ReminderNotificationSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    offsetMinutes: {
      type: Number,
      required: true,
    },
    notifyAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "notified", "completed"],
      default: "pending",
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const ReminderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tenantId: {
      type: String,
      default: null,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    leadTypeId: {
      type: Schema.Types.ObjectId,
      ref: "LeadType",
      required: true,
    },

    contactId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    contactName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    followUpAt: {
      type: Date,
      required: true,
    },

    notifications: {
      type: [ReminderNotificationSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

ReminderSchema.index({
  status: 1,
  followUpAt: 1,
});

ReminderSchema.index({
  tenantId: 1,
  status: 1,
});

ReminderSchema.index({
  "notifications.status": 1,
  "notifications.notifyAt": 1,
});

const Reminder =
  models.Reminder || mongoose.model("Reminder", ReminderSchema);

export default Reminder;
