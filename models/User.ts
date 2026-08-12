import mongoose from "mongoose";

/*
 * ============================================================
 * LIMIT SCHEMA
 * ============================================================
 */

const limitItemSchema = new mongoose.Schema(
  {
    max: {
      type: Number,
      default: -1,
    },

    period: {
      type: String,
      enum: [
        "day",
        "month",
        "year",
        "total",
        "unlimited",
      ],
      default: "unlimited",
    },
  },
  {
    _id: false,
  }
);

/*
 * ============================================================
 * USAGE SCHEMA
 * ============================================================
 */

const usageItemSchema = new mongoose.Schema(
  {
    count: {
      type: Number,
      default: 0,
    },

    resetAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

/*
 * ============================================================
 * WHATSAPP NUMBER SCHEMA
 * ============================================================
 *
 * Every WhatsApp number connected through Embedded Signup
 * gets its own setup/credit-line/registration information.
 */

const whatsappNumberSchema = new mongoose.Schema(
  {
    /*
     * Basic WhatsApp information
     */

    name: {
      type: String,
      default: "Default Number",
    },

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

    displayPhoneNumber: {
      type: String,
      default: null,
    },

    verifiedName: {
      type: String,
      default: null,
    },

    phoneStatus: {
      type: String,
      default: "UNKNOWN",
    },

    /*
     * Whether this is the number currently selected
     * as the active WhatsApp number.
     */

    isActive: {
      type: Boolean,
      default: false,
    },

    /*
     * ========================================================
     * BUSINESS PORTFOLIO
     * ========================================================
     *
     * This is required by Pinbot's credit-line API.
     */

    businessId: {
      type: String,
      default: null,
    },

    /*
     * ========================================================
     * EMBEDDED SIGNUP
     * ========================================================
     */

    source: {
      type: String,
      enum: [
        "embedded_signup",
        "manual",
        "api",
        "unknown",
      ],
      default: "unknown",
    },

    /*
     * ========================================================
     * AUTOMATIC SETUP STATUS
     * ========================================================
     *
     * WAITING_CREDIT_LINE
     * RELAYING_DETAILS
     * ASSIGNING_CREDIT_LINE
     * SUBSCRIBING_WABA
     * REGISTERING_PHONE
     * SETTING_PIN
     * PROCESSING
     * READY
     * ERROR
     */

    setupStatus: {
      type: String,
      enum: [
        "PENDING",
        "WAITING_CREDIT_LINE",
        "RELAYING_DETAILS",
        "ASSIGNING_CREDIT_LINE",
        "SUBSCRIBING_WABA",
        "REGISTERING_PHONE",
        "SETTING_PIN",
        "PROCESSING",
        "READY",
        "ERROR",
      ],
      default: "PENDING",
    },

    /*
     * ========================================================
     * CREDIT LINE STATUS
     * ========================================================
     */

    creditLineStatus: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "CONNECTED",
        "FAILED",
      ],
      default: "PENDING",
    },

    /*
     * ========================================================
     * WABA SUBSCRIPTION STATUS
     * ========================================================
     */

    subscriptionStatus: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "CONNECTED",
        "FAILED",
      ],
      default: "PENDING",
    },

    /*
     * ========================================================
     * PHONE REGISTRATION STATUS
     * ========================================================
     */

    registrationStatus: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "REGISTERED",
        "FAILED",
      ],
      default: "PENDING",
    },

    /*
     * ========================================================
     * REGISTRATION / TWO-STEP VERIFICATION PIN
     * ========================================================
     *
     * This is the 6-digit PIN used by the automatic
     * registration process.
     */

    registrationPin: {
      type: String,
      default: null,
    },

    /*
     * ========================================================
     * SETUP ERROR
     * ========================================================
     *
     * If Pinbot or Meta fails, the worker stores the error
     * here so it can be displayed/debugged later.
     */

    setupError: {
      type: String,
      default: null,
    },

    /*
     * ========================================================
     * SETUP TIMING
     * ========================================================
     */

    setupStartedAt: {
      type: Date,
      default: null,
    },

    /*
     * The worker will process the number after this time.
     *
     * We use this for the 3-4 minute Pinbot synchronization
     * period.
     */

    nextSetupAttemptAt: {
      type: Date,
      default: null,
    },

    setupCompletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: true,
  }
);

/*
 * ============================================================
 * USER SCHEMA
 * ============================================================
 */

const UserSchema = new mongoose.Schema(
  {
    /*
     * ========================================================
     * BASIC USER INFORMATION
     * ========================================================
     */

    name: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    /*
     * ========================================================
     * TENANT SYSTEM
     * ========================================================
     */

    isTenant: {
      type: Boolean,
      default: false,
    },

    tenantId: {
      type: String,
      default: null,
      index: true,
    },

    parentTenantId: {
      type: String,
      default: null,
      index: true,
    },

    maxSubUsers: {
      type: Number,
      default: 0,
    },

    /*
     * ========================================================
     * DEFAULT / PRIMARY WHATSAPP INFORMATION
     * ========================================================
     *
     * These are kept because your existing application already
     * uses them.
     */

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

    /*
     * ========================================================
     * WHATSAPP NUMBERS
     * ========================================================
     *
     * Multiple WhatsApp numbers can belong to one user.
     */

    whatsappNumbers: {
      type: [whatsappNumberSchema],
      default: [],
    },

    /*
     * ========================================================
     * BALANCE / PRICING
     * ========================================================
     */

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
      default: 0.9,
    },

    priceMarketing: {
      type: Number,
      default: 0.9,
    },

    priceUtility: {
      type: Number,
      default: 0.5,
    },

    priceAuthentication: {
      type: Number,
      default: 0.3,
    },

    /*
     * ========================================================
     * COUNTRY SETTINGS
     * ========================================================
     */

    maxEnabledCountries: {
      type: Number,
      default: 0,
    },

    enabledCountries: [
      {
        name: {
          type: String,
          default: "",
        },

        // Example: "91", "1", "44"
        code: {
          type: String,
          default: "",
        },

        priceMarketing: {
          type: Number,
          default: 0.9,
        },

        priceUtility: {
          type: Number,
          default: 0.5,
        },

        priceAuthentication: {
          type: Number,
          default: 0.3,
        },
      },
    ],

    /*
     * ========================================================
     * ACCOUNT STATUS
     * ========================================================
     */

    accountStatus: {
      type: String,

      enum: [
        "active",
        "expired",
        "suspended",
      ],

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

    /*
     * ========================================================
     * WHITE LABEL
     * ========================================================
     */

    whiteLabel: {
      enabled: {
        type: Boolean,
        default: false,
      },

      appName: {
        type: String,
        default: "",
      },

      logoUrl: {
        type: String,
        default: "",
      },

      primaryColor: {
        type: String,
        default: "#10b981",
      },

      supportEmail: {
        type: String,
        default: "",
      },

      brandUrl: {
        type: String,
        default: "",
      },
    },

    /*
     * ========================================================
     * GOOGLE SHEETS
     * ========================================================
     */

    googleSheetId: {
      type: String,
      default: null,
    },

    googleTokens: {
      access_token: {
        type: String,
        default: null,
      },

      refresh_token: {
        type: String,
        default: null,
      },

      scope: {
        type: String,
        default: null,
      },

      expiry_date: {
        type: Number,
        default: null,
      },
    },

    /*
     * ========================================================
     * INTEGRATIONS
     * ========================================================
     */

    hideIntegrations: {
      type: Boolean,
      default: false,
    },

    /*
     * ========================================================
     * HIDDEN SIDEBAR LINKS
     * ========================================================
     */

    hiddenSidebarLinks: {
      type: [String],
      default: [],
    },

    /*
     * ========================================================
     * LIMITS
     * ========================================================
     */

    limits: {
      tags: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      workflows: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      templates: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      testMessages: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      campaigns: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      optNumbers: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      forms: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },

      whatsappNumbers: {
        type: limitItemSchema,

        default: () => ({
          max: -1,
          period: "unlimited",
        }),
      },
    },

    /*
     * ========================================================
     * USAGE
     * ========================================================
     */

    usage: {
      tags: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      workflows: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      templates: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      testMessages: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      campaigns: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      optNumbers: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      forms: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },

      whatsappNumbers: {
        type: usageItemSchema,

        default: () => ({
          count: 0,
          resetAt: null,
        }),
      },
    },
  },
  {
    timestamps: true,
  }
);

/*
 * ============================================================
 * MONGOOSE HOT-RELOAD FIX
 * ============================================================
 *
 * Important for Next.js development mode.
 */

if (mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.model(
  "User",
  UserSchema
);
