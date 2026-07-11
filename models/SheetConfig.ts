import mongoose from "mongoose";

const SheetConfigSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    tenantId: {
      type: String,
      default: null,
    },
    createdBy: {
      type: String,
      required: true,
    },
    sheetUrl: {
      type: String,
      required: true,
    },
    nameField: {
      type: String,
      required: true,
    },
    numberField: {
      type: String,
      required: true,
    },
    additionalFields: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.models.SheetConfig || mongoose.model("SheetConfig", SheetConfigSchema);
