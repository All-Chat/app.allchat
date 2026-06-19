import mongoose from "mongoose";

const FormSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  
  // ==========================================
  // 🔴 MULTI-TENANT DATA ISOLATION
  // ==========================================
  tenantId: { type: String, default: null, index: true },
  createdBy: { type: String, default: null, index: true },

  name: { type: String, required: true },
  fields: [{
    id: String,
    label: String,
    type: { type: String, enum: ["text", "email", "number", "textarea", "select", "checkbox"], default: "text" },
    required: Boolean,
    options: [String], // For select/checkbox
    // Delay & Reminder Settings
    delayMessage: { type: String, default: "" },
    delaySeconds: { type: Number, default: 0 },
    repeatCount: { type: Number, default: 0 }
  }],
  // Custom Messages
  completionMessage: { type: String, default: "✅ Thank you! Your form has been submitted successfully." },
  abandonmentMessage: { type: String, default: "It seems you are busy right now. We have paused the form. Click the button below whenever you are ready to start over." },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Form || mongoose.model("Form", FormSchema);
