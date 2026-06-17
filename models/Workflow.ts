import mongoose from "mongoose";

const WorkflowSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // ← ADDED
  name: {
    type: String,
    default: "Untitled Workflow",
  },
  triggers: [
    {
      keyword: { type: String, required: true },
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
});

export default mongoose.models.Workflow ||
  mongoose.model("Workflow", WorkflowSchema);
