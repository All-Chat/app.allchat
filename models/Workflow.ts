import mongoose from "mongoose";

const WorkflowSchema = new mongoose.Schema({
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
  // Using Mixed type allows us to save the dynamic Record<string, Step> structure 
  // including the new `position: { x, y }` coordinates for the React Flow canvas.
  steps: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  rootStepId: {
    type: String,
    required: true,
  },
});

export default mongoose.models.Workflow ||
  mongoose.model("Workflow", WorkflowSchema);
