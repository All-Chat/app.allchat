/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

type TenantSessionUser = Session["user"] & {
  id: string;
  tenantId?: string | null;
  isTenant?: boolean;
};

type TenantSession = Session & {
  user: TenantSessionUser;
};

// ✅ Shared team inbox message. A top-level message (parentMessageId: null)
// is a "thread". Replies reference parentMessageId. Scoped to teamId, which
// is always the TENANT'S tenantId — both the tenant and all its sub-users
// share the same teamId, so everyone on the team sees the same inbox.
//
// recipientId: null  -> visible to the whole team
// recipientId: <id>  -> private thread, visible only to sender + that recipient
const TeamMessageSchema = new mongoose.Schema({
  teamId: { type: String, index: true }, // = tenant's tenantId
  parentMessageId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  subject: { type: String, default: "" },
  body: { type: String, default: "" },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  senderName: { type: String },
  recipientId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true }, // null = whole team
  recipientName: { type: String, default: null },
  readBy: { type: [String], default: [] }, // array of userId strings who have read this message

  // ───── Media attachment fields ─────
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "TeamMessageMedia", default: null },
  mediaType: { type: String, default: null }, // "image" | "video" | "audio" | "document"
  mediaName: { type: String, default: null }, // original file name
  mediaMime: { type: String, default: null }, // e.g. "image/png"
  mediaSize: { type: Number, default: null }, // bytes

  createdAt: { type: Date, default: Date.now },
});
const TeamMessage = mongoose.models.TeamMessage || mongoose.model("TeamMessage", TeamMessageSchema);

// ✅ Binary blob storage for team inbox attachments. Kept in a separate
// collection so the lightweight TeamMessage documents (used in list/thread
// queries) never need to load full file bytes.
const TeamMessageMediaSchema = new mongoose.Schema({
  teamId: { type: String, index: true },
  data: { type: Buffer, required: true },
  mime: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const TeamMessageMedia =
  mongoose.models.TeamMessageMedia || mongoose.model("TeamMessageMedia", TeamMessageMediaSchema);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB cap

function classifyMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

// Resolve the team's shared inbox ID for any team member (tenant OR sub-user)
async function resolveTeamId(session: TenantSession): Promise<{ teamId: string | null; isTenant: boolean }> {
  if (session.user.isTenant && session.user.tenantId) {
    return { teamId: session.user.tenantId, isTenant: true };
  }
  // Sub-user: look up their parentTenantId from DB (session may not carry it)
  const dbUser = await User.findById(session.user.id).select("parentTenantId").lean();
  const parentTenantId = (dbUser as any)?.parentTenantId || null;
  return { teamId: parentTenantId, isTenant: false };
}

export async function GET(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as TenantSession | null;
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const myId = session.user.id;

    await connectDB();
    const { teamId } = await resolveTeamId(session);
    if (!teamId) {
      return NextResponse.json({ success: false, message: "No team inbox available for this account." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");

    // ==========================================
    // Fetch team member list (for avatars/names)
    // ==========================================
    const [tenant, subUsers] = await Promise.all([
      User.findOne({ tenantId: teamId }).select("name").lean(),
      User.find({ parentTenantId: teamId }).select("name").lean(),
    ]);
    const members = [
      ...(tenant ? [{ _id: (tenant as any)._id.toString(), name: (tenant as any).name, role: "owner" }] : []),
      ...subUsers.map((u: any) => ({ _id: u._id.toString(), name: u.name, role: "member" })),
    ];

    // ==========================================
    // SINGLE THREAD VIEW (with all replies)
    // ==========================================
    if (threadId) {
      const thread = await TeamMessage.findOne({ _id: threadId, teamId }).lean();
      if (!thread) {
        return NextResponse.json({ success: false, message: "Thread not found" }, { status: 404 });
      }

      // Privacy check: if this thread is private, only sender + recipient can view it
      const tSenderId = (thread as any).senderId?.toString();
      const tRecipientId = (thread as any).recipientId?.toString() || null;
      if (tRecipientId && tSenderId !== myId && tRecipientId !== myId) {
        return NextResponse.json({ success: false, message: "Thread not found" }, { status: 404 });
      }

      const replies = await TeamMessage.find({ teamId, parentMessageId: threadId })
        .sort({ createdAt: 1 })
        .lean();

      // Mark thread + all replies as read by this user
      const allIds = [threadId, ...replies.map((r: any) => r._id.toString())];
      await TeamMessage.updateMany(
        { _id: { $in: allIds }, readBy: { $ne: myId } },
        { $addToSet: { readBy: myId } }
      );

      return NextResponse.json({
        success: true,
        currentUserId: myId,
        thread: { ...thread, _id: (thread as any)._id.toString() },
        replies: replies.map((r: any) => ({ ...r, _id: r._id.toString() })),
        members,
      });
    }

    // ==========================================
    // THREAD LIST VIEW (inbox)
    // Visible: team-wide threads (recipientId: null), plus private threads
    // where I'm either the sender or the recipient.
    // ==========================================
    const threads = await TeamMessage.find({
      teamId,
      parentMessageId: null,
      $or: [{ recipientId: null }, { senderId: myId }, { recipientId: myId }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const threadIds = threads.map((t: any) => t._id);

    // Get last reply + reply count for each thread, and unread status
    const repliesAgg = await TeamMessage.aggregate([
      { $match: { teamId, parentMessageId: { $in: threadIds } } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: "$parentMessageId",
          count: { $sum: 1 },
          lastReply: { $last: "$$ROOT" },
        },
      },
    ]);
    const repliesMap: Record<string, any> = {};
    repliesAgg.forEach((r: any) => {
      repliesMap[r._id.toString()] = r;
    });

    const mappedThreads = threads
      .map((t: any) => {
        const replyInfo = repliesMap[t._id.toString()];
        const last = replyInfo?.lastReply || t;
        const lastActivity = last.createdAt || t.createdAt;
        const lastSender = last.senderName || t.senderName;
        const lastIsMedia = !!last.mediaId && !last.body;
        const lastSnippet = lastIsMedia
          ? `📎 ${last.mediaName || "Attachment"}`
          : (last.body || "").slice(0, 140);
        const isUnread = !t.readBy?.includes(myId) || (replyInfo && !replyInfo.lastReply.readBy?.includes(myId));

        return {
          _id: t._id.toString(),
          subject: t.subject,
          senderId: t.senderId?.toString(),
          senderName: t.senderName,
          recipientId: t.recipientId ? t.recipientId.toString() : null,
          recipientName: t.recipientName || null,
          createdAt: t.createdAt,
          lastActivity,
          lastSnippet,
          lastSender,
          replyCount: replyInfo?.count || 0,
          unread: !!isUnread,
        };
      })
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

    return NextResponse.json({ success: true, currentUserId: myId, threads: mappedThreads, members });
  } catch (error: any) {
    console.error("Error fetching team inbox:", error);
    return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as TenantSession | null;
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const myId = session.user.id;

    await connectDB();
    const { teamId } = await resolveTeamId(session);
    if (!teamId) {
      return NextResponse.json({ success: false, message: "No team inbox available for this account." }, { status: 403 });
    }

    // ─── Parse body: supports both JSON (text-only) and multipart FormData (with file) ───
    const contentType = req.headers.get("content-type") || "";
    let subject = "";
    let message = "";
    let parentMessageId: string | null = null;
    let recipientId: string | null = null;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      subject = String(formData.get("subject") || "");
      message = String(formData.get("message") || "");
      parentMessageId = (formData.get("parentMessageId") as string) || null;
      recipientId = (formData.get("recipientId") as string) || null;
      const f = formData.get("file");
      if (f instanceof File && f.size > 0) file = f;
    } else {
      const body = await req.json();
      subject = body.subject || "";
      message = body.message || "";
      parentMessageId = body.parentMessageId || null;
      recipientId = body.recipientId || null;
    }

    if ((!message || !String(message).trim()) && !file) {
      return NextResponse.json({ success: false, message: "Message or attachment is required" }, { status: 400 });
    }

    if (file && file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, message: "File too large (max 10MB)" }, { status: 400 });
    }

    const senderName = session.user.name || "Team Member";

    // ─── If a file was uploaded, persist its bytes and capture media metadata ───
    let mediaFields: Record<string, any> = {};
    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mediaDoc = await TeamMessageMedia.create({
        teamId,
        data: buffer,
        mime: file.type || "application/octet-stream",
      });
      mediaFields = {
        mediaId: mediaDoc._id,
        mediaType: classifyMime(file.type || ""),
        mediaName: file.name,
        mediaMime: file.type || "application/octet-stream",
        mediaSize: file.size,
      };
    }

    // New thread
    if (!parentMessageId) {
      if (!subject || !String(subject).trim()) {
        return NextResponse.json({ success: false, message: "Subject is required for a new thread" }, { status: 400 });
      }

      let recipientName: string | null = null;
      if (recipientId) {
        const recipientUser = await User.findById(recipientId).select("name").lean();
        recipientName = (recipientUser as any)?.name || null;
      }

      const newThread = await TeamMessage.create({
        teamId,
        parentMessageId: null,
        subject: String(subject).trim(),
        body: String(message || "").trim(),
        senderId: myId,
        senderName,
        recipientId: recipientId || null,
        recipientName,
        readBy: [myId], // sender has implicitly "read" their own message
        createdAt: new Date(),
        ...mediaFields,
      });
      return NextResponse.json({ success: true, thread: { ...newThread.toObject(), _id: newThread._id.toString() } });
    }

    // Reply to existing thread
    const parent = await TeamMessage.findOne({ _id: parentMessageId, teamId });
    if (!parent) {
      return NextResponse.json({ success: false, message: "Thread not found" }, { status: 404 });
    }

    // Privacy check: only sender + recipient can reply to a private thread
    const pSenderId = parent.senderId?.toString();
    const pRecipientId = parent.recipientId?.toString() || null;
    if (pRecipientId && pSenderId !== myId && pRecipientId !== myId) {
      return NextResponse.json({ success: false, message: "Thread not found" }, { status: 404 });
    }

    const reply = await TeamMessage.create({
      teamId,
      parentMessageId,
      subject: "",
      body: String(message || "").trim(),
      senderId: myId,
      senderName,
      recipientId: parent.recipientId || null,
      recipientName: parent.recipientName || null,
      readBy: [myId],
      createdAt: new Date(),
      ...mediaFields,
    });

    return NextResponse.json({ success: true, reply: { ...reply.toObject(), _id: reply._id.toString() } });
  } catch (error: any) {
    console.error("Error posting team inbox message:", error);
    return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = (await getServerSession(authOptions)) as TenantSession | null;
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { teamId } = await resolveTeamId(session);
    if (!teamId) {
      return NextResponse.json({ success: false, message: "No team inbox available for this account." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");
    if (!threadId) {
      return NextResponse.json({ success: false, message: "threadId is required" }, { status: 400 });
    }

    const thread = await TeamMessage.findOne({ _id: threadId, teamId });
    if (!thread) {
      return NextResponse.json({ success: false, message: "Thread not found" }, { status: 404 });
    }

    // Only the original sender can delete the thread (and its replies)
    if (thread.senderId.toString() !== session.user.id) {
      return NextResponse.json({ success: false, message: "Only the thread creator can delete it" }, { status: 403 });
    }

    // Collect media ids attached to thread + replies so we can clean up blobs too
    const related = await TeamMessage.find({
      $or: [{ _id: threadId }, { parentMessageId: threadId }],
    })
      .select("mediaId")
      .lean();
    const mediaIds = related.map((r: any) => r.mediaId).filter(Boolean);

    await TeamMessage.deleteMany({ $or: [{ _id: threadId }, { parentMessageId: threadId }] });
    if (mediaIds.length) {
      await TeamMessageMedia.deleteMany({ _id: { $in: mediaIds } });
    }

    return NextResponse.json({ success: true, message: "Thread deleted" });
  } catch (error: any) {
    console.error("Error deleting team inbox thread:", error);
    return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
  }
}
