/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Loader2, Inbox, PenSquare, X, Send, ArrowLeft, Trash2,
  MessageSquare, Users, Mail, MailOpen, Search, ChevronDown, Lock, Globe2,
  Paperclip, Link, FileText, Image as ImageIcon, Video, Music
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type Member = { _id: string; name: string; role: string };

type ThreadListItem = {
  _id: string;
  subject: string;
  senderId: string;
  senderName: string;
  recipientId?: string | null;
  recipientName?: string | null;
  createdAt: string;
  lastActivity: string;
  lastSnippet: string;
  lastSender: string;
  replyCount: number;
  unread: boolean;
};

type ThreadMessage = {
  _id: string;
  body: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  mediaId?: string | null;
  mediaType?: "image" | "video" | "audio" | "document" | null;
  mediaName?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
};

const formatTime = (date: string) => {
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const formatBytes = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with backend cap

// Soft, low-contrast pastel pairs (light background + muted text), similar
// to a "stat card" look — easy on the eyes instead of bright saturated gradients.
const AVATAR_PALETTE = [
  { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
  { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
  { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
  { bg: "bg-lime-50", text: "text-lime-600", ring: "ring-lime-100" },
  { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
];

const avatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

function Avatar({ name, size = 9 }: { name: string; size?: number }) {
  const c = avatarColor(name || "?");
  const sizeClass = size === 9 ? "w-9 h-9 text-xs" : size === 8 ? "w-8 h-8 text-[11px]" : "w-5 h-5 text-[9px]";
  return (
    <span className={`${sizeClass} shrink-0 rounded-xl ${c.bg} ${c.text} flex items-center justify-center font-bold ring-1 ${c.ring}`}>
      {name?.charAt(0).toUpperCase()}
    </span>
  );
}

export default function TeamInboxPage() {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadDetail, setThreadDetail] = useState<{ thread: ThreadListItem & { body: string } & ThreadMessage; replies: ThreadMessage[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeRecipient, setComposeRecipient] = useState<string>("all"); // "all" or member._id
  const [recipientMenuOpen, setRecipientMenuOpen] = useState(false);
  const [composeFile, setComposeFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replying, setReplying] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composeFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  // Tries a few common endpoints to figure out who is logged in. If your
  // app already exposes a "current user" / session API, this will pick it
  // up automatically; otherwise it falls back to whatever /api/tenant/inbox
  // returns. Without a valid currentUserId, every message will render on
  // the left, since we can't tell which ones are "yours".
  const fetchCurrentUser = async () => {
    const candidates = ["/api/auth/me", "/api/auth/session", "/api/user/me", "/api/tenant/me"];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const id = data?.user?._id || data?._id || data?.userId || data?.id;
        if (id) {
          setCurrentUserId(id);
          return;
        }
      } catch {
        // try next candidate
      }
    }
  };

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/inbox");
      const data = await res.json();
      if (data.success) {
        setThreads(data.threads || []);
        setMembers(data.members || []);
        if (data.currentUserId) setCurrentUserId(data.currentUserId);
      } else {
        toast.error(data.message || "Failed to load inbox");
      }
    } catch {
      toast.error("Failed to load inbox");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchThreads();
  }, []);

  useEffect(() => {
    if (!loading && !currentUserId) {
      // eslint-disable-next-line no-console
      console.warn(
        "[TeamInbox] currentUserId is empty — left/right message alignment can't work until your API returns who's logged in (e.g. data.currentUserId from /api/tenant/inbox, or one of /api/auth/me, /api/auth/session, /api/user/me)."
      );
    }
  }, [loading, currentUserId]);

  const openThread = async (threadId: string) => {
    setSelectedThreadId(threadId);
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/tenant/inbox?threadId=${threadId}`);
      const data = await res.json();
      if (data.success) {
        setThreadDetail({ thread: data.thread, replies: data.replies });
        setMembers(data.members || []);
        if (data.currentUserId) setCurrentUserId(data.currentUserId);
        setThreads(prev => prev.map(t => t._id === threadId ? { ...t, unread: false } : t));
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
      } else {
        toast.error(data.message || "Failed to load thread");
      }
    } catch {
      toast.error("Failed to load thread");
    } finally {
      setThreadLoading(false);
    }
  };

  const handleComposeFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error("File too large (max 10MB)");
      e.target.value = "";
      return;
    }
    setComposeFile(f);
    e.target.value = "";
  };

  const handleReplyFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error("File too large (max 10MB)");
      e.target.value = "";
      return;
    }
    setReplyFile(f);
    e.target.value = "";
  };

  const handleCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeSubject.trim() || (!composeBody.trim() && !composeFile)) return;
    setSending(true);
    try {
      let res: Response;
      if (composeFile) {
        const formData = new FormData();
        formData.append("subject", composeSubject);
        formData.append("message", composeBody);
        formData.append("recipientId", composeRecipient === "all" ? "" : composeRecipient);
        formData.append("file", composeFile);
        res = await fetch("/api/tenant/inbox", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/tenant/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: composeSubject,
            message: composeBody,
            recipientId: composeRecipient === "all" ? null : composeRecipient,
          }),
        });
      }
      const data = await res.json();
      if (data.success) {
        toast.success(composeRecipient === "all" ? "Message sent to team" : "Message sent");
        setShowCompose(false);
        setComposeSubject("");
        setComposeBody("");
        setComposeRecipient("all");
        setComposeFile(null);
        fetchThreads();
      } else {
        toast.error(data.message || "Failed to send");
      }
    } catch {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!replyText.trim() && !replyFile) || !selectedThreadId) return;
    setReplying(true);
    try {
      let res: Response;
      if (replyFile) {
        const formData = new FormData();
        formData.append("message", replyText);
        formData.append("parentMessageId", selectedThreadId);
        formData.append("file", replyFile);
        res = await fetch("/api/tenant/inbox", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/tenant/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: replyText, parentMessageId: selectedThreadId }),
        });
      }
      const data = await res.json();
      if (data.success) {
        setReplyText("");
        setReplyFile(null);
        await openThread(selectedThreadId);
        fetchThreads();
      } else {
        toast.error(data.message || "Failed to reply");
      }
    } catch {
      toast.error("Failed to reply");
    } finally {
      setReplying(false);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!window.confirm("Delete this entire conversation? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/tenant/inbox?threadId=${threadId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Conversation deleted");
        setSelectedThreadId(null);
        setThreadDetail(null);
        fetchThreads();
      } else {
        toast.error(data.message || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const filteredThreads = threads.filter(t =>
    !search.trim() ||
    t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.lastSnippet.toLowerCase().includes(search.toLowerCase()) ||
    t.senderName.toLowerCase().includes(search.toLowerCase())
  );

  const selectedRecipientLabel = composeRecipient === "all"
    ? "Entire team"
    : members.find(m => m._id === composeRecipient)?.name || "Select recipient";

  const isMine = (senderId: string) => senderId === currentUserId;

  return (
    // ✅ Fixed-height shell: the page itself never scrolls. Only the thread
    // list and the message area (below) get their own independent scrollbars.
    <div className="h-screen bg-slate-50 text-gray-900 overflow-hidden flex flex-col">
      <Sidebar />
      <div className="md:ml-64 flex-1 flex flex-col min-h-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-sky-50 rounded-2xl ring-1 ring-sky-100">
                <Inbox className="w-6 h-6 text-sky-500" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Team Inbox</h1>
                <p className="text-gray-500 text-sm">Internal chat between you and your team members.</p>
              </div>
            </div>
            <button
              onClick={() => setShowCompose(true)}
              className="flex items-center gap-2 px-5 py-3 bg-sky-50 text-sky-600 font-bold rounded-xl ring-1 ring-sky-100 hover:bg-sky-100 transition-all"
            >
              <PenSquare size={18} /> New Message
            </button>
          </div>

          {members.length > 0 && (
            <div className="flex items-center gap-2 mb-6 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm overflow-x-auto shrink-0">
              <Users size={16} className="text-slate-400 shrink-0" />
              <span className="text-xs font-bold text-slate-500 shrink-0">Team:</span>
              {members.map(m => (
                <span key={m._id} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 shrink-0">
                  <Avatar name={m.name} size={4 as any} />
                  {m.name} {m.role === "owner" && <span className="text-sky-500">(Owner)</span>}
                </span>
              ))}
            </div>
          )}

          {/* ✅ This card now fills the remaining viewport height (flex-1 min-h-0)
              instead of growing with content via minHeight, so its two
              children can each scroll independently inside a fixed box. */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-5 flex-1 min-h-0">

            <div className={`md:col-span-2 border-r border-slate-200 flex flex-col bg-slate-50/40 min-h-0 ${selectedThreadId ? "hidden md:flex" : "flex"}`}>
              <div className="p-3 border-b border-slate-100 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-200 focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              {/* ✅ Thread list: independent scrollbar, constrained to the
                  remaining height of this column. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : filteredThreads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 px-4 text-center">
                    <MessageSquare className="w-10 h-10 mb-3 text-slate-200" />
                    <p className="font-medium text-slate-500 text-sm">No conversations yet</p>
                    <p className="text-xs text-slate-400 mt-1">Start one with &quot;New Message&quot;</p>
                  </div>
                ) : (
                  filteredThreads.map(t => (
                    <button
                      key={t._id}
                      onClick={() => openThread(t._id)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-white transition-colors flex gap-3 ${selectedThreadId === t._id ? "bg-white shadow-sm" : ""}`}
                    >
                      <Avatar name={t.senderName} size={9} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate flex items-center gap-1.5 ${t.unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}>
                            {t.recipientId ? <Lock size={11} className="text-slate-400 shrink-0" /> : <Globe2 size={11} className="text-slate-300 shrink-0" />}
                            {t.subject}
                          </p>
                          <span className="text-[10px] text-slate-400 shrink-0">{formatTime(t.lastActivity)}</span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${t.unread ? "text-slate-700 font-medium" : "text-slate-400"}`}>
                          <span className="font-semibold">{t.lastSender}:</span> {t.lastSnippet}
                        </p>
                        {t.replyCount > 0 && (
                          <span className="text-[10px] text-sky-500 font-bold mt-1 inline-block">{t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}</span>
                        )}
                      </div>
                      {t.unread && <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 mt-2" />}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className={`md:col-span-3 flex flex-col min-h-0 ${selectedThreadId ? "flex" : "hidden md:flex"}`}>
              {!selectedThreadId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                  <MailOpen className="w-14 h-14 mb-3" />
                  <p className="text-sm font-medium text-slate-400">Select a conversation to view</p>
                </div>
              ) : threadLoading || !threadDetail ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
              ) : (
                <>
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2 bg-white shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={() => { setSelectedThreadId(null); setThreadDetail(null); }} className="md:hidden p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                        <ArrowLeft size={18} />
                      </button>
                      <div className="min-w-0">
                        <h2 className="font-bold text-lg truncate text-slate-800">{threadDetail.thread.subject}</h2>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          {threadDetail.thread.recipientId ? (
                            <><Lock size={10} /> Private with {threadDetail.thread.recipientName || "team member"}</>
                          ) : (
                            <><Globe2 size={10} /> Visible to entire team</>
                          )}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteThread(threadDetail.thread._id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0" title="Delete conversation">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* ✅ Message area: independent scrollbar, constrained to the
                      remaining height of this column (header + reply box are
                      shrink-0 so they stay fixed). */}
                  <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
                    <MessageBubble
                      senderName={threadDetail.thread.senderName}
                      body={threadDetail.thread.body}
                      createdAt={threadDetail.thread.createdAt}
                      mine={isMine(threadDetail.thread.senderId)}
                      mediaId={threadDetail.thread.mediaId}
                      mediaType={threadDetail.thread.mediaType}
                      mediaName={threadDetail.thread.mediaName}
                      mediaSize={threadDetail.thread.mediaSize}
                    />

                    {threadDetail.replies.map(r => (
                      <MessageBubble
                        key={r._id}
                        senderName={r.senderName}
                        body={r.body}
                        createdAt={r.createdAt}
                        mine={isMine(r.senderId)}
                        mediaId={r.mediaId}
                        mediaType={r.mediaType}
                        mediaName={r.mediaName}
                        mediaSize={r.mediaSize}
                      />
                    ))}
                  </div>

                  {replyFile && (
                    <div className="px-3 pt-2 bg-white shrink-0">
                      <div className="flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-1.5 rounded-full text-xs font-medium border border-sky-100 w-fit shadow-sm">
                        <FileTypeIcon type={classifyMimeClient(replyFile.type)} />
                        <span className="truncate max-w-[160px]">{replyFile.name}</span>
                        <span className="text-sky-400">{formatBytes(replyFile.size)}</span>
                        <button onClick={() => setReplyFile(null)} className="ml-1 hover:bg-sky-200 rounded-full p-0.5 transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleReply} className="p-3 border-t border-slate-100 flex items-end gap-2 bg-white shrink-0">
                    <input
                      type="file"
                      ref={replyFileInputRef}
                      onChange={handleReplyFilePick}
                      className="hidden"
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                    />
                    <button
                      type="button"
                      onClick={() => replyFileInputRef.current?.click()}
                      className="p-2.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors shrink-0"
                      title="Attach a file"
                    >
                      <Paperclip size={18} />
                    </button>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(e as any); } }}
                      placeholder="Type a reply..."
                      rows={1}
                      className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-sky-200 focus:bg-white outline-none transition-all"
                    />
                    <button
                      type="submit"
                      disabled={replying || (!replyText.trim() && !replyFile)}
                      className="p-2.5 bg-sky-50 text-sky-600 ring-1 ring-sky-100 rounded-xl disabled:opacity-50 hover:bg-sky-100 transition-all shrink-0"
                    >
                      {replying ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCompose && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowCompose(false); setRecipientMenuOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setShowCompose(false); setRecipientMenuOpen(false); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-sky-50 ring-1 ring-sky-100 rounded-lg">
                <Mail size={16} className="text-sky-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">New Message</h2>
            </div>
            <p className="text-sm text-slate-500 mb-6">Send to the entire team, or pick one person for a private message.</p>

            <form onSubmit={handleCompose} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">To</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setRecipientMenuOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-100 transition-all"
                  >
                    <span className="flex items-center gap-2">
                      {composeRecipient === "all" ? (
                        <Globe2 size={15} className="text-sky-500" />
                      ) : (
                        <Avatar name={selectedRecipientLabel} size={5 as any} />
                      )}
                      {selectedRecipientLabel}
                    </span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${recipientMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {recipientMenuOpen && (
                    <div className="absolute z-10 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => { setComposeRecipient("all"); setRecipientMenuOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-sky-50 transition-colors ${composeRecipient === "all" ? "bg-sky-50 font-semibold text-sky-600" : "text-slate-700"}`}
                      >
                        <Globe2 size={15} className="text-sky-500" /> Entire team
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      {members.map(m => (
                        <button
                          key={m._id}
                          type="button"
                          onClick={() => { setComposeRecipient(m._id); setRecipientMenuOpen(false); }}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-sky-50 transition-colors ${composeRecipient === m._id ? "bg-sky-50 font-semibold text-sky-600" : "text-slate-700"}`}
                        >
                          <Avatar name={m.name} size={5 as any} />
                          {m.name} {m.role === "owner" && <span className="text-sky-400 text-xs">(Owner)</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  required
                  placeholder="e.g. Today's campaign plan"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Message</label>
                <textarea
                  value={composeBody}
                  onChange={e => setComposeBody(e.target.value)}
                  rows={5}
                  placeholder="Write your message..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Attachment (optional)</label>
                <input
                  type="file"
                  ref={composeFileInputRef}
                  onChange={handleComposeFilePick}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                />
                {composeFile ? (
                  <div className="flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-2 rounded-xl text-sm font-medium border border-sky-100 w-fit">
                    <FileTypeIcon type={classifyMimeClient(composeFile.type)} />
                    <span className="truncate max-w-[200px]">{composeFile.name}</span>
                    <span className="text-sky-400 text-xs">{formatBytes(composeFile.size)}</span>
                    <button type="button" onClick={() => setComposeFile(null)} className="ml-1 hover:bg-sky-200 rounded-full p-0.5 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => composeFileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-sky-600 transition-all w-full justify-center"
                  >
                    <Paperclip size={16} /> Attach image, video, or document
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-sky-50 text-sky-600 ring-1 ring-sky-100 font-bold rounded-xl hover:bg-sky-100 transition-all disabled:opacity-50"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {composeRecipient === "all" ? "Send to Team" : `Send to ${selectedRecipientLabel}`}
              </button>
            </form>
          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}

function classifyMimeClient(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function FileTypeIcon({ type, size = 14 }: { type?: string | null; size?: number }) {
  if (type === "image") return <ImageIcon size={size} className="shrink-0" />;
  if (type === "video") return <Video size={size} className="shrink-0" />;
  if (type === "audio") return <Music size={size} className="shrink-0" />;
  return <FileText size={size} className="shrink-0" />;
}

function MessageBubble({
  senderName,
  body,
  createdAt,
  mine,
  mediaId,
  mediaType,
  mediaName,
  mediaSize,
}: {
  senderName: string;
  body: string;
  createdAt: string;
  mine: boolean;
  mediaId?: string | null;
  mediaType?: "image" | "video" | "audio" | "document" | null;
  mediaName?: string | null;
  mediaSize?: number | null;
}) {
  const mediaSrc = mediaId ? `/api/tenant/inbox/media/${mediaId}` : null;

  return (
    <div className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
      <Avatar name={senderName} size={8} />
      <div className={`flex-1 min-w-0 flex flex-col ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`max-w-[80%] px-4 py-2.5 ${
            mine
              ? "bg-sky-50 text-slate-700 ring-1 ring-sky-100 rounded-2xl rounded-tr-sm"
              : "bg-white border border-slate-200 text-slate-700 rounded-2xl rounded-tl-sm"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[11px] font-bold ${mine ? "text-sky-600" : "text-slate-700"}`}>{mine ? "You" : senderName}</span>
            <span className="text-[10px] text-slate-400">{formatTime(createdAt)}</span>
          </div>

          {mediaSrc && mediaType === "image" && (
            <div className="mb-1.5 max-w-[220px] sm:max-w-[280px]">
              <img src={mediaSrc} alt={mediaName || "Image"} className="rounded-xl max-w-full object-cover shadow-sm" />
            </div>
          )}
          {mediaSrc && mediaType === "video" && (
            <div className="mb-1.5 max-w-[220px] sm:max-w-[280px]">
              <video src={mediaSrc} controls className="rounded-xl max-w-full object-cover shadow-sm" />
            </div>
          )}
          {mediaSrc && mediaType === "audio" && (
            <div className="mb-1.5 w-56 sm:w-64">
              <audio src={mediaSrc} controls className="w-full outline-none" />
            </div>
          )}
          {mediaSrc && mediaType === "document" && (
            <a
              href={mediaSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-1.5 flex items-center gap-3 bg-white/80 rounded-xl p-2.5 hover:bg-white transition-colors shadow-sm border border-slate-100"
            >
              <FileText className="w-7 h-7 text-rose-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate max-w-[160px]">{mediaName || "Document"}</p>
                <p className="text-[11px] text-sky-600 font-medium">{formatBytes(mediaSize)} · Click to download</p>
              </div>
            </a>
          )}

          {body && <p className="text-sm whitespace-pre-wrap break-words">{body}</p>}
        </div>
      </div>
    </div>
  );
}
