import mongoose from "mongoose";

const WorkflowSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  // ==========================================
  // 🔴 MULTI-TENANT DATA ISOLATION
  // ==========================================
  tenantId: { type: String, default: null, index: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },

  // ==========================================
  // 🔴 WABA PHONE NUMBER LINKING
  // When a webhook fires, we use this field
  // to find workflows for the RIGHT user + number.
  // ==========================================
  wabaPhoneNumberId: { type: String, default: null, index: true },
  wabaPhoneNumber: { type: String, default: null },

  name: {
    type: String,
    default: "Untitled Workflow",
  },
  triggers: [
    {
      keyword: { type: String, required: true },
      matchMode: {
        type: String,
        enum: ["exact", "contains"],
        default: "contains",
      },
    },
  ],
  steps: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  rootStepId: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
});

// ✅ CRITICAL: Compound index for fast webhook lookup
WorkflowSchema.index({ wabaPhoneNumberId: 1, active: 1 });
WorkflowSchema.index({ userId: 1, wabaPhoneNumberId: 1, active: 1 });

export default mongoose.models.Workflow ||
  mongoose.model("Workflow", WorkflowSchema);
