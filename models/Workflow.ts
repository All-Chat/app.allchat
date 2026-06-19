import mongoose from "mongoose";

const WorkflowSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    index: true 
  },
  
  // ==========================================
  // 🔴 MULTI-TENANT DATA ISOLATION
  // ==========================================
  tenantId: { type: String, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

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
        default: "contains" 
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
  // ✅ ADDED: Active field for deactivation/activation
  active: {
    type: Boolean,
    default: true,
  },
});

export default mongoose.models.Workflow ||
  mongoose.model("Workflow", WorkflowSchema);
