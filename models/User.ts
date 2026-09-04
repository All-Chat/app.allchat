import mongoose from "mongoose";

/* =========================================================
   LIMIT SCHEMA
========================================================= */

const limitItemSchema = new mongoose.Schema(
  {
    max: { type: Number, default: -1 },
    period: {
      type: String,
      enum: ["day", "month", "year", "total", "unlimited"],
      default: "unlimited",
    },
  },
  { _id: false }
);

/* =========================================================
   USAGE SCHEMA
========================================================= */

const usageItemSchema = new mongoose.Schema(
  {
    count: { type: Number, default: 0 },
    resetAt: { type: Date, default: null },
  },
  { _id: false }
);

/* =========================================================
   WHATSAPP NUMBER SCHEMA
========================================================= */

const whatsappNumberSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Default Number" },
    wabaId: { type: String, default: null },
    whatsappPhoneNumberId: { type: String, default: null },
    whatsappAccessToken: { type: String, default: null },
    displayPhoneNumber: { type: String, default: null },
    verifiedName: { type: String, default: null },
    phoneStatus: { type: String, default: "UNKNOWN" },
    isActive: { type: Boolean, default: false },
    source: { type: String, default: "manual" },
    addedAt: { type: Date, default: Date.now },
    businessId: { type: String, default: null },
    setupStatus: {
      type: String,
      enum: ["PROCESSING", "WAITING_CREDIT_LINE", "CREDIT_LINE_READY", "SUBSCRIBING", "REGISTERING", "READY", "FAILED"],
      default: "PROCESSING",
    },
    creditLineStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "READY", "FAILED", "CONNECTED"], // Added CONNECTED
      default: "PENDING",
    },
    creditLineId: { type: String, default: null },
    creditLineError: { type: String, default: null },
    subscriptionStatus: {
      type: String,
      enum: ["PENDING", "SUBSCRIBING", "SUBSCRIBED", "FAILED", "CONNECTED"], // Added CONNECTED
      default: "PENDING",
    },
    subscriptionError: { type: String, default: null },
    registrationStatus: {
      type: String,
      enum: ["PENDING", "REGISTERING", "REGISTERED", "FAILED", "PROCESSING"], // Added PROCESSING
      default: "PENDING",
    },
    registrationError: { type: String, default: null },
    registrationPin: { type: String, default: null },
    pinbotEmbeddedDetailStatus: {
      type: String,
      enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    pinbotEmbeddedDetailResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    pinbotEmbeddedDetailError: { type: String, default: null },
    pinbotEmbeddedDetailAt: { type: Date, default: null },
    setupError: { type: String, default: null },
    setupStartedAt: { type: Date, default: null },
    nextSetupAttemptAt: { type: Date, default: null },
    setupCompletedAt: { type: Date, default: null },
  },
  { _id: true, timestamps: true }
);

/* =========================================================
   USER SCHEMA
========================================================= */

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    isTenant: { type: Boolean, default: false },
    tenantId: { type: String, default: null, index: true },
    parentTenantId: { type: String, default: null, index: true },
    maxSubUsers: { type: Number, default: 0 },

    wabaId: { type: String, default: null },
    whatsappPhoneNumberId: { type: String, default: null },
    whatsappAccessToken: { type: String, default: null },
    whatsappNumbers: { type: [whatsappNumberSchema], default: [] },

    balance: { type: Number, default: 0 },
    totalRecharged: { type: Number, default: 0 },
    pricePerMessage: { type: Number, default: 0.9 },
    priceMarketing: { type: Number, default: 0.9 },
    priceUtility: { type: Number, default: 0.5 },
    priceAuthentication: { type: Number, default: 0.3 },

    maxEnabledCountries: { type: Number, default: 0 },
    enabledCountries: [
      {
        name: { type: String, default: "" },
        code: { type: String, default: "" },
        priceMarketing: { type: Number, default: 0.9 },
        priceUtility: { type: Number, default: 0.5 },
        priceAuthentication: { type: Number, default: 0.3 },
      },
    ],

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

    whiteLabel: {
      enabled: { type: Boolean, default: false },
      appName: { type: String, default: "" },
      logoUrl: { type: String, default: "" },
      primaryColor: { type: String, default: "#10b981" },
      supportEmail: { type: String, default: "" },
      brandUrl: { type: String, default: "" },
    },

    googleSheetId: { type: String, default: null },
    googleTokens: {
      access_token: { type: String, default: null },
      refresh_token: { type: String, default: null },
      scope: { type: String, default: null },
      expiry_date: { type: Number, default: null },
    },
    hideIntegrations: { type: Boolean, default: false },
    hiddenSidebarLinks: { type: [String], default: [] },
    
    /* =====================================================
       HIDDEN REPORT ACTIONS (NEW)
    ===================================================== */
    hiddenReportActions: {
      type: [String],
      default: [],
    },

    limits: {
      tags: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      workflows: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      templates: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      testMessages: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      campaigns: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      optNumbers: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      forms: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      whatsappNumbers: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) },
      aiAgents: { type: limitItemSchema, default: () => ({ max: -1, period: "unlimited" }) }, // ✅ ADDED LIMIT
    },
    usage: {
      tags: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      workflows: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      templates: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      testMessages: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      campaigns: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      optNumbers: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      forms: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      whatsappNumbers: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) },
      aiAgents: { type: usageItemSchema, default: () => ({ count: 0, resetAt: null }) }, // ✅ ADDED USAGE
    },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);
export default User;
