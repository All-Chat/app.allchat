import mongoose from "mongoose";

// Sub-schema for interactive buttons inside steps
const ButtonSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: "" },
    nextStepId: { type: String, default: null },
    phoneNumber: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { _id: false }
);

// Sub-schema for individual flow steps
const StepSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    message: { type: String, default: "" },
    waitType: { type: String, enum: ["wait", "none"], default: "none" },
    nodeType: { type: String, default: "message" }, // e.g., message, mediaNode, callButton, formNode
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // Stores media URLs, form fields, delays, etc.
    buttons: [ButtonSchema],
  },
  { _id: false }
);

// Sub-schema for triggers
const TriggerSchema = new mongoose.Schema(
  {
    keyword: { type: String, required: true },
    matchMode: { 
      type: String, 
      enum: ["exact", "contains"], 
      default: "contains" 
    },
  },
  { _id: false }
);

const WorkflowSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    name: {
      type: String,
      default: "Untitled Workflow",
    },
    triggers: [TriggerSchema],
    // Using Map of StepSchema allows keys to be the dynamic step IDs
    steps: {
      type: Map,
      of: StepSchema,
      default: {},
    },
    rootStepId: {
      type: String,
      required: true,
    },
  },
  { 
    timestamps: true // Automatically adds createdAt and updatedAt
  }
);

export default mongoose.models.Workflow ||
  mongoose.model("Workflow", WorkflowSchema);
