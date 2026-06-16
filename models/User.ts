import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  // ==========================================
  // MULTI-TENANT WHATSAPP CONFIGURATION
  // ==========================================
  wabaId: {
    type: String,
    default: null,
  },
  whatsappPhoneNumberId: {
    type: String,
    default: null,
  },
  whatsappAccessToken: {
    type: String,
    default: null,
  },
  // ==========================================
  // BILLING & BALANCE
  // ==========================================
  balance: {
    type: Number,
    default: 0,
  },
  totalRecharged: {
    type: Number,
    default: 0,
  },
  pricePerMessage: {
    type: Number,
    default: 0.90,
  },
  // ==========================================
  // ACCOUNT & PLAN
  // ==========================================
  accountStatus: {
    type: String,
    enum: ["active", "expired", "suspended"],
    default: "active",
  },
  planExpiry: {
    type: Date,
    default: null,
  },
  planDuration: {
    type: String,
    default: null,
  },
  planActivatedAt: {
    type: Date,
    default: null,
  },
  suspendedAt: {
    type: Date,
    default: null,
  },
  suspendedReason: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

if (mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.model("User", UserSchema);