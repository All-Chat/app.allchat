import mongoose from "mongoose";

const SheetSyncConfigSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    tenantId: { type: String, default: null },
    createdBy: { type: String, required: true },
    name: { type: String, required: true }, // ✅ NEW: Sheet Name
    sheetUrl: { type: String, required: true },
    nameField: { type: String, required: true },
    numberField: { type: String, required: true },
    additionalFields: { type: [String], default: [] },
    isSyncing: { type: Boolean, default: false },
    intervalValue: { type: Number, default: 5 },
    intervalUnit: { type: String, enum: ["seconds", "minutes", "hours"], default: "minutes" },
    lastSynced: { type: Date, default: null },
    lastRunStatus: { type: String, default: null }, 
  },
  { timestamps: true }
);

export default mongoose.models.SheetSyncConfig || mongoose.model("SheetSyncConfig", SheetSyncConfigSchema);
