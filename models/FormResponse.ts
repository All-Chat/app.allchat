import mongoose from "mongoose";

const FormResponseSchema = new mongoose.Schema({
  formId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
  userId: { type: String, required: true, index: true },
  phone: { type: String }, // Phone number of the user who filled it
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, // The actual form answers
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.FormResponse || mongoose.model("FormResponse", FormResponseSchema);
