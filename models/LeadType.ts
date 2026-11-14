
import mongoose, { Schema, models } from "mongoose";

const ContactSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    // Lead Source
    source: {
      type: String,
      enum: ["WhatsApp", "Instagram", "Facebook", "Other"],
      default: "WhatsApp",
    },

    // Custom source when "Other" is selected
    customSource: {
      type: String,
      default: "",
      trim: true,
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const LeadTypeSchema = new Schema(
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

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },

    keywords: {
      type: [String],
      default: [],
      validate: {
        validator: (items: string[]) => items.length <= 100,
        message: "A maximum of 100 keywords is allowed.",
      },
    },

    contacts: {
      type: [ContactSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Recompile the model in development so an older cached schema
// does not continue being used.
if (process.env.NODE_ENV === "development" && models.LeadType) {
  delete mongoose.models.LeadType;
}

const LeadType =
  models.LeadType || mongoose.model("LeadType", LeadTypeSchema);

export default LeadType;
