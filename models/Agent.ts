// models/Agent.js
import mongoose from 'mongoose';

const AgentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  details: { type: String, required: true },
  language: { type: String, enum: ['english', 'hindi'], default: 'english' },
  fallbackMessage: { type: String, required: true },
  supportEmail: { type: String, required: true },
  active: { type: Boolean, default: false }, // NEW: only one can be true per user
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Agent || mongoose.model('Agent', AgentSchema);
