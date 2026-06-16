import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  userId: mongoose.Types.ObjectId;
  phone: string;
  text: string;
  direction: "in" | "out";
  messageType: "text" | "image" | "video" | "document" | "audio" | "sticker" | "template" | "interactive";
  mediaUrl?: string;
  contactName?: string;
  profilePicUrl?: string;
  whatsappMessageId?: string;
  metaMessageId?: string;       // ADDED: To match your webhook inbound payload
  status?: "sent" | "delivered" | "read" | "failed" | "invalid" | "undelivered"; // ADDED: "invalid" & "undelivered" from webhook
  templateName?: string;
  templateHeaderType?: "text" | "image" | "video" | "document" | "none";
  templateHeaderText?: string;
  templateBodyText?: string;
  templateFooter?: string;
  templateButtons?: string;
  templateLanguage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    phone: { 
      type: String, 
      required: true 
    },
    text: { type: String, default: "" },
    direction: { type: String, enum: ["in", "out"], required: true },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "document", "audio", "sticker", "template", "interactive"],
      default: "text",
    },
    mediaUrl: { type: String, default: null },
    contactName: { type: String, default: null },
    profilePicUrl: { type: String, default: null },
    whatsappMessageId: { type: String, default: null },
    metaMessageId: { type: String, default: null }, // ADDED: Webhook uses this for inbound
    status: { 
      type: String, 
      enum: ["sent", "delivered", "read", "failed", "invalid", "undelivered"], // ADDED missing statuses
      default: "sent" 
    },
    templateName: { type: String, default: null },
    templateHeaderType: { type: String, default: null },
    templateHeaderText: { type: String, default: null },
    templateBodyText: { type: String, default: null },
    templateFooter: { type: String, default: null },
    templateButtons: { type: String, default: null },
    templateLanguage: { type: String, default: null },
  },
  { timestamps: true }
);

// ─── Indexes ───
// Sparse index so nulls don't take up index space
MessageSchema.index({ whatsappMessageId: 1 }, { sparse: true });
MessageSchema.index({ metaMessageId: 1 }, { sparse: true });

// Primary query index: Fetching chats and messages for a specific user
MessageSchema.index({ userId: 1, phone: 1, createdAt: -1 });

// Secondary index: Sorting user's messages globally by time
MessageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);