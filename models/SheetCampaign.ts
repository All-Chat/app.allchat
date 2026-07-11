import mongoose from "mongoose";

const SheetCampaignSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    tenantId: { type: String, default: null },
    name: { type: String, required: true },
    sheetConfigId: { type: String, required: true },
    templateName: { type: String, required: true },
    languageCode: { type: String, default: "en" },
    templateCategory: { type: String, default: "MARKETING" },
    variableMappings: { type: [String], default: [] },
    mediaUrl: { type: String, default: "" },
    mediaType: { type: String, default: "" },
    status: { type: String, enum: ["saved", "scheduled", "running", "stopped", "completed", "failed"], default: "saved" },
    scheduledAt: { type: Date, default: null },
    totalMessages: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    totalDeducted: { type: Number, default: 0 },
    lastSynced: { type: Date, default: null },
    reportSheetId: { type: Number, default: null }, 
    // ✅ NEW FIELDS FOR THE REPORT SPREADSHEET
    reportSpreadsheetId: { type: String, default: null },
    reportSpreadsheetUrl: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.SheetCampaign || mongoose.model("SheetCampaign", SheetCampaignSchema);
