import mongoose from "mongoose";

const FormSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  fields: [{
    id: String,
    label: String,
    type: { type: String, enum: ["text", "email", "number", "textarea", "select", "checkbox"], default: "text" },
    required: Boolean,
    options: [String] // For select/checkbox
  }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Form || mongoose.model("Form", FormSchema);
