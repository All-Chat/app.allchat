import mongoose from "mongoose";

const limitItemSchema = new mongoose.Schema({
  max: { type: Number, default: -1 },
  period: {
    type: String,
    enum: ["day", "month", "year", "total", "unlimited"],
    default: "unlimited",
  },
}, { _id: false });

const usageItemSchema = new mongoose.Schema({
  count: { type: Number, default: 0 },
  resetAt: { type: Date, default: null },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // ==========================================
  // MULTI-TENANT CONFIGURATION
  // ==========================================
  isTenant: { type: Boolean, default: false },
  tenantId: { type: String, default: null, index: true }, // The unique ID for the tenant's workspace
  parentTenantId: { type: String, default: null, index: true }, // If this user is a sub-user, this points to the tenant's tenantId
  maxSubUsers: { type: Number, default: 0 }, // How many sub-users this tenant can create
  // ==========================================

  wabaId: { type: String, default: null },
  whatsappPhoneNumberId: { type: String, default: null },
  whatsappAccessToken: { type: String, default: null },
  
  balance: { type: Number, default: 0 },
  totalRecharged: { type: Number, default: 0 },
  pricePerMessage: { type: Number, default: 0.90 },
  priceMarketing: { type: Number, default: 0.90 },
  priceUtility: { type: Number, default: 0.50 },
  priceAuthentication: { type: Number, default: 0.30 },
  
  accountStatus: {
    type: String,
    enum: ["active", "expired", "suspended"],
    default: "active",
  },
  planExpiry: { type: Date, default: null },
  planDuration: { type: String, default: null },
  planActivatedAt: { type: Date, default: null },
  suspendedAt: { type: Date, default: null },
  suspendedReason: { type: String, default: null },
  
  limits: {
    tags: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
    workflows: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
    templates: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
    testMessages: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
    campaigns: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
    optNumbers: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
    forms: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
  },
  usage: {
    tags: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
    workflows: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
    templates: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
    testMessages: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
    campaigns: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
    optNumbers: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
    forms: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
  },
}, {
  timestamps: true,
});

if (mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.model("User", UserSchema);
