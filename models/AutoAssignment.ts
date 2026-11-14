
import mongoose, { Schema, models, model } from "mongoose";

const AutoAssignmentSchema = new Schema(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    counter: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const AutoAssignment =
  models.AutoAssignment ||
  model("AutoAssignment", AutoAssignmentSchema);

export default AutoAssignment;
