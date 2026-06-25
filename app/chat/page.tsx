/* =====================================================================
   LIVE CHAT PAGE - MULTI-WABA SUPPORT
   =====================================================================
   Flow:
   1. User logs in → session.user.id = MongoDB _id
   2. Fetch user document → get name
   3. Fetch whatsappNumbers[] from /api/user/whatsapp-numbers
   4. Dropdown shows: "All Numbers" + each number's `name` field
   5. User selects a number → we use its `whatsappPhoneNumberId` to:
      - Filter /api/chats and /api/chat
      - Pass to /api/whatsapp when sending free-text messages
   6. Outgoing messages show sender name based on `whatsappPhoneNumberId`
   ===================================================================== */

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react/jsx-no-undef */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Search, Send, Loader2, MessageSquare, CheckCheck,
  MoreVertical, Paperclip, Smile, Mic, Phone, Video,
  FileText, ArrowDown, X, Lock, Tag, ExternalLink,
  Image as ImageIcon, ArrowLeft, ChevronDown, Radio, AlertCircle,
  Check,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

// ─── Type Definitions ───────────────────────────────────────────────────────
type TemplateButton = {
  type: "quick_reply" | "url" | "phone_number";
  text: string;
  url?: string;
  phone_number?: string;
  index?: number;
};

type Message = {
  _id: string;
  phone: string;
  text: string;
  direction: "in" | "out";
  createdAt?: string;
  timestamp?: string;
  messageType?: "text" | "image" | "video" | "document" | "audio" | "sticker" | "template";
  mediaUrl?: string | null;
  contactName?: string;
  whatsappMessageId?: string;
  status?: "sent" | "delivered" | "read" | "failed";
  templateName?: string;
  templateHeaderType?: "text" | "image" | "video" | "document" | "none";
  templateHeaderText?: string;
  templateBodyText?: string;
  templateFooter?: string;
  templateButtons?: TemplateButton[] | string;
  templateLanguage?: string;
  whatsappPhoneNumberId?: string;
  fromPhone?: string;
  senderNumber?: string;
};

type Chat = {
  _id: string;
  name?: string;
  phone?: string;
  lastMessage: string;
  lastDirection?: string;
  lastMessageType?: string;
  updatedAt: string;
  whatsappPhoneNumberId?: string;
};

// ─── WhatsApp Number type (matches your DB schema exactly) ─────────────
type WhatsappNumber = {
  _id: string;
  name: string;
  wabaId?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  isActive?: boolean;
};

// ─── Utility Functions ──────────────────────────────────────────────────────
const getAvatarGradient = (id: string) => {
  const colors = [
    "from-pink-500 to-rose-500",
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-amber-500 to-orange-500",
    "from-indigo-500 to-blue-600",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getAvatarText = (name: string | undefined, id: string | undefined) => {
  if (name && name.trim() !== "" && name !== "Unknown") return name.trim().charAt(0).toUpperCase();
  if (id) return id.replace(/\D/g, "").substring(0, 2);
  return "?";
};

const getMessageDate = (msg: Message) => msg.createdAt || msg.timestamp || "";

const parseTemplateButtons = (buttons: TemplateButton[] | string | undefined): TemplateButton[] => {
  if (!buttons) return [];
  if (typeof buttons === "string") { try { return JSON.parse(buttons); } catch { return []; } }
  return Array.isArray(buttons) ? buttons : [];
};

const handleUnauthorized = (res: Response) => {
  if (res.status === 401) { window.location.href = "/signin"; return true; }
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ChatPage() {
  const { data: session, status } = useSession();

  // ─── State ────────────────────────────────────────────────────────────────
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatData, setActiveChatData] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");

  // ✅ WABA Number state
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsappNumber[]>([]);
  const [selectedWabaId, setSelectedWabaId] = useState<string>("all");
  const [loadingNumbers, setLoadingNumbers] = useState(true);

  const [showChatList, setShowChatList] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCount = useRef(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fetchedContacts = useRef<Set<string>>(new Set());
  const isFetchingChats = useRef(false);
  const isFetchingMessages = useRef(false);

  // ─── ✅ Fetch WhatsApp Numbers from DB ─────────────────────────────────
  // Calls /api/user/whatsapp-numbers which returns user.whatsappNumbers[]
  // Each item has: _id, name, wabaId, whatsappPhoneNumberId, whatsappAccessToken, isActive
  const fetchWhatsappNumbers = useCallback(async () => {
    setLoadingNumbers(true);
    try {
      const res = await fetch("/api/user/whatsapp-numbers");
      if (!res.ok) { setLoadingNumbers(false); return; }
      const data = await res.json();

      let numbers: WhatsappNumber[] = [];
      if (data.success && Array.isArray(data.numbers)) numbers = data.numbers;
      else if (Array.isArray(data)) numbers = data;
      else if (data.user?.whatsappNumbers) numbers = data.user.whatsappNumbers;
      else if (Array.isArray(data.whatsappNumbers)) numbers = data.whatsappNumbers;

      setWhatsappNumbers(numbers);

      // Auto-select first number if only one exists
      if (numbers.length === 1 && numbers[0].whatsappPhoneNumberId) {
        setSelectedWabaId(numbers[0].whatsappPhoneNumberId);
      }
    } catch (err) {
      console.error("Failed to fetch WhatsApp numbers:", err);
    } finally {
      setLoadingNumbers(false);
    }
  }, []);

  // ─── ✅ Get Sender Name for Outgoing Messages ────────────────────────────
  // Matches message.whatsappPhoneNumberId to a number in whatsappNumbers[]
  // Returns the number's `name` field (e.g. "The Real Leads" or "TataMotors")
  const getSenderName = useCallback((msg: Message): string | null => {
    if (msg.direction !== "out") return null;

    // Exact match by whatsappPhoneNumberId
    if (msg.whatsappPhoneNumberId) {
      const match = whatsappNumbers.find(
        (n) => n.whatsappPhoneNumberId === msg.whatsappPhoneNumberId
      );
      if (match?.name) return match.name;
    }

    // If a specific number is selected in dropdown, use its name
    if (selectedWabaId !== "all") {
      const sel = whatsappNumbers.find((n) => n.whatsappPhoneNumberId === selectedWabaId);
      if (sel?.name) return sel.name;
    }

    // Fallback: first number if only one
    if (whatsappNumbers.length === 1 && whatsappNumbers[0]?.name) {
      return whatsappNumbers[0].name;
    }

    return null;
  }, [whatsappNumbers, selectedWabaId]);

  // ─── Fetch Contact Name ─────────────────────────────────────────────────────
  const fetchContactName = useCallback(async (phoneId: string) => {
    if (fetchedContacts.current.has(phoneId)) return;
    fetchedContacts.current.add(phoneId);
    try {
      const cleanPhone = phoneId.replace(/\+/g, "");
      const res = await fetch(`/api/contacts?phone=${encodeURIComponent(cleanPhone)}`);
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      if (data.success && data.contact?.name && data.contact.name.trim() !== "") {
        setContactNames((prev) => {
          if (prev[phoneId] === data.contact.name) return prev;
          return { ...prev, [phoneId]: data.contact.name };
        });
      }
    } catch { /* silent */ }
  }, []);

  // ─── Resolve Display Name ────────────────────────────────────────────────────
  const getResolvedName = useCallback((chat: Chat): string => {
    if (contactNames[chat._id]?.trim()) return contactNames[chat._id];
    if (chat.name?.trim() && chat.name !== "Unknown") return chat.name;
    if (chat.phone?.trim() && chat.phone !== "Unknown") return chat.phone;
    return chat._id;
  }, [contactNames]);

  const getDisplayName = (chat: Chat | null) => {
    if (!chat) return "";
    const name = getResolvedName(chat);
    return name !== "Unknown" ? name : chat._id;
  };

  const getAvatarLabel = (chat: Chat) => getAvatarText(getResolvedName(chat), chat.phone || chat._id);

  // ─── Scroll Helpers ──────────────────────────────────────────────────────────
  const checkScrollPosition = () => {
    const c = chatContainerRef.current;
    if (!c) return;
    setShowScrollBtn(c.scrollHeight - c.scrollTop - c.clientHeight >= 120);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    chatContainerRef.current?.scrollTo({ top: chatContainerRef.current?.scrollHeight, behavior });
  };

  useEffect(() => {
    const c = chatContainerRef.current;
    if (!c) return;
    if (c.scrollHeight - c.scrollTop - c.clientHeight < 120) scrollToBottom("smooth");
  }, [messages]);

  useEffect(() => {
    if (activeChat) setTimeout(() => scrollToBottom("instant"), 50);
  }, [activeChat]);

  // ─── ✅ Load Chats (passes whatsappPhoneNumberId to filter) ─────────────────
  const loadChats = useCallback(async () => {
    if (isFetchingChats.current) return;
    isFetchingChats.current = true;
    try {
      const params = new URLSearchParams();
      if (selectedWabaId && selectedWabaId !== "all") {
        params.set("whatsappPhoneNumberId", selectedWabaId);
      }

      const res = await fetch(`/api/chats?${params.toString()}`);
      if (handleUnauthorized(res)) return;
      const data = await res.json();

      if (data.success && data.chats) {
        setChats((prev) => {
          if (prev.length === data.chats.length) {
            let changed = false;
            for (let i = 0; i < prev.length; i++) {
              if (
                prev[i]._id !== data.chats[i]._id ||
                prev[i].lastMessage !== data.chats[i].lastMessage ||
                prev[i].updatedAt !== data.chats[i].updatedAt
              ) { changed = true; break; }
            }
            if (!changed) return prev;
          }
          return data.chats;
        });

        data.chats.forEach((chat: Chat) => {
          if (!chat.name || chat.name === "Unknown" || !chat.name.trim()) {
            fetchContactName(chat._id);
          }
        });

        if (activeChat) {
          const current = data.chats.find((c: Chat) => c._id === activeChat);
          if (current) setActiveChatData(current);
        } else if (data.chats.length > 0) {
          setActiveChat(data.chats[0]._id);
          setActiveChatData(data.chats[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setLoading(false);
      isFetchingChats.current = false;
    }
  }, [activeChat, fetchContactName, selectedWabaId]);

  // ─── ✅ Load Messages (passes whatsappPhoneNumberId to filter) ───────────────
  const loadMessages = useCallback(async () => {
    if (!activeChat || isFetchingMessages.current) return;
    isFetchingMessages.current = true;
    try {
      const cleanPhone = activeChat.replace(/\+/g, "");
      const params = new URLSearchParams({ phone: cleanPhone });
      if (selectedWabaId && selectedWabaId !== "all") {
        params.set("whatsappPhoneNumberId", selectedWabaId);
      }

      const res = await fetch(`/api/chat?${params.toString()}`);
      if (handleUnauthorized(res)) { isFetchingMessages.current = false; return; }
      const data = await res.json();

      if (data.success) {
        const newMessages: Message[] = data.messages || [];
        if (newMessages.length > prevMessageCount.current) {
          const latest = newMessages[newMessages.length - 1];
          if (latest.direction === "in") {
            setIsTyping(true);
            setTimeout(() => setIsTyping(false), 1500);
          }
        }
        prevMessageCount.current = newMessages.length;
        setMessages(newMessages);

        for (const msg of newMessages) {
          if (msg.contactName?.trim() && msg.contactName !== "Unknown") {
            const key = activeChat!;
            const contactName = msg.contactName.trim();
            setContactNames((prev) => {
              if (prev[key] === contactName) return prev;
              return { ...prev, [key]: contactName };
            });
            break;
          }
        }
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      isFetchingMessages.current = false;
    }
  }, [activeChat, selectedWabaId]);

  // ─── ✅ Handle WABA Number Change ─────────────────────────────────────────
  const handleWabaChange = (newId: string) => {
    setSelectedWabaId(newId);
    setActiveChat(null);
    setActiveChatData(null);
    setMessages([]);
    prevMessageCount.current = 0;
    setShowChatList(true);
  };

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "authenticated") {
      fetchWhatsappNumbers();
    } else if (status === "unauthenticated") {
      window.location.href = "/signin";
    }
  }, [status, fetchWhatsappNumbers]);

  // Load chats AFTER numbers are fetched
  useEffect(() => {
    if (status === "authenticated" && !loadingNumbers) {
      loadChats();
    }
  }, [status, loadingNumbers, selectedWabaId, loadChats]);

  useEffect(() => {
    prevMessageCount.current = 0;
    setMessages([]);
    setShowProfile(false);
    if (activeChat) {
      loadMessages();
      fetchContactName(activeChat);
    }
  }, [activeChat, loadMessages, fetchContactName]);

  // Poll for new messages every 3 seconds
  useEffect(() => {
    if (status !== "authenticated" || loadingNumbers) return;
    const interval = setInterval(() => {
      loadChats();
      if (activeChat) loadMessages();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChat, loadChats, loadMessages, status, loadingNumbers]);

  // ─── File Handling ────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  // ─── ✅ Send Free-Text Message (passes whatsappPhoneNumberId) ─────────────────
  const sendMessage = async () => {
    if ((!text && !selectedFile) || !activeChat) return;
    setSending(true);
    try {
      const cleanPhone = activeChat.replace(/\+/g, "");

      // Build body with whatsappPhoneNumberId
      const baseBody: Record<string, string> = { phone: cleanPhone, text: text || "" };
      if (selectedWabaId && selectedWabaId !== "all") {
        baseBody.whatsappPhoneNumberId = selectedWabaId;
      }

      let data;
      if (selectedFile) {
        const formData = new FormData();
        Object.entries(baseBody).forEach(([k, v]) => formData.append(k, v));
        formData.append("file", selectedFile);
        const res = await fetch("/api/whatsapp", { method: "POST", body: formData });
        if (handleUnauthorized(res)) return;
        data = await res.json();
      } else {
        const res = await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(baseBody),
        });
        if (handleUnauthorized(res)) return;
        data = await res.json();
      }

      if (data.success) {
        setText("");
        setSelectedFile(null);
        loadMessages();
        fetchContactName(activeChat);
        setTimeout(() => loadChats(), 500);
      } else {
        toast.error(data.message || "Failed to send");
      }
    } catch {
      toast.error("Error sending message");
    } finally {
      setSending(false);
    }
  };

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat._id);
    setActiveChatData(chat);
    setShowChatList(false);
  };

  const handleBackToChats = () => setShowChatList(true);

  // ─── Formatting ───────────────────────────────────────────────────────────────
  const formatTime = (d: string | undefined) => {
    if (!d) return "";
    const date = new Date(d);
    return isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (d: string | undefined) => {
    if (!d) return "UNKNOWN";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "UNKNOWN";
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "TODAY";
    if (date.toDateString() === yesterday.toDateString()) return "YESTERDAY";
    return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
  };

  const groupedMessages = () => {
    const groups: { date: string; messages: Message[] }[] = [];
    messages.forEach((msg) => {
      const dateStr = formatDate(getMessageDate(msg));
      const existing = groups.find((g) => g.date === dateStr);
      if (existing) existing.messages.push(msg);
      else groups.push({ date: dateStr, messages: [msg] });
    });
    return groups;
  };

  const getMediaSrc = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `/api/media/download?mediaId=${url}`;
  };

  const renderStatusIcon = (msg: Message) => {
    if (msg.direction !== "out") return null;
    if (msg.status === "read") return <CheckCheck className="w-[18px] h-[18px] text-blue-500 shrink-0" />;
    if (msg.status === "delivered") return <CheckCheck className="w-[18px] h-[18px] text-gray-400 shrink-0" />;
    return <Check className="w-[18px] h-[18px] text-gray-400 shrink-0" />;
  };

  const renderMediaContent = (msg: Message) => {
    const type = msg.messageType || "text";
    const src = getMediaSrc(msg.mediaUrl);

    if (type === "image" && src)
      return (
        <div className="mb-1 max-w-[220px] sm:max-w-[300px]">
          <img src={src} alt="Image" className="rounded-xl max-w-full object-cover shadow-sm" />
          {msg.text && <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words mt-1.5">{msg.text}</p>}
        </div>
      );
    if (type === "video" && src)
      return (
        <div className="mb-1 max-w-[220px] sm:max-w-[300px]">
          <video src={src} controls className="rounded-xl max-w-full object-cover shadow-sm" />
          {msg.text && <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words mt-1.5">{msg.text}</p>}
        </div>
      );
    if (type === "audio" && src)
      return (
        <div className="mb-1 w-56 sm:w-72">
          <audio controls className="w-full outline-none"><source src={src} type="audio/ogg" /></audio>
        </div>
      );
    if (type === "document" && src)
      return (
        <a href={src} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-3 bg-white/80 rounded-xl p-3 hover:bg-white transition-colors shadow-sm">
          <FileText className="w-8 h-8 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{msg.text || "Document.pdf"}</p>
            <p className="text-[11px] text-indigo-600 font-medium">Click to download</p>
          </div>
        </a>
      );
    return <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{msg.text}</p>;
  };

  // ─── ✅ Render Template Bubble (exactly like WhatsApp) ────────────────────
  const renderTemplateContent = (msg: Message) => {
    const src = getMediaSrc(msg.mediaUrl);
    const buttons = parseTemplateButtons(msg.templateButtons);
    const headerType = msg.templateHeaderType ||
      (msg.messageType === "image" || msg.messageType === "video" || msg.messageType === "document" ? msg.messageType : undefined);
    const hasImg = (headerType === "image" || msg.messageType === "image") && src;
    const hasVid = (headerType === "video" || msg.messageType === "video") && src;
    const hasDoc = (headerType === "document" || msg.messageType === "document") && src;

    return (
      <>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Tag size={10} className="text-emerald-600 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 whitespace-nowrap">
            {msg.templateName}
          </span>
        </div>

        {hasImg && (
          <div className="mb-2 -mx-2.5 -mt-0.5 overflow-hidden rounded-t-xl">
            <img src={src!} alt="" className="w-full max-h-56 sm:max-h-72 object-cover" />
          </div>
        )}

        {hasVid && (
          <div className="mb-2">
            <video src={src!} controls className="rounded-xl max-w-full max-h-56 sm:max-h-72 object-cover" />
          </div>
        )}

        {hasDoc && (
          <a
            href={src!}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 flex items-center gap-3 bg-white/80 rounded-xl p-3 hover:bg-white transition-colors shadow-sm"
          >
            <FileText className="w-8 h-8 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{msg.templateHeaderText || "Document"}</p>
              <p className="text-[11px] text-indigo-600 font-medium">Tap to download</p>
            </div>
          </a>
        )}

        {headerType === "text" && msg.templateHeaderText && (
          <p className="text-[14px] font-bold text-gray-900 whitespace-pre-wrap break-words mb-1">
            {msg.templateHeaderText}
          </p>
        )}

        {(msg.templateBodyText || msg.text) && (
          <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
            {msg.templateBodyText || msg.text}
          </p>
        )}

        {msg.templateFooter && (
          <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">{msg.templateFooter}</p>
        )}

        {buttons.length > 0 && (
          <div className="mt-2 border-t border-gray-200/80 pt-1">
            {buttons.map((btn, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (btn.type === "url" && btn.url) window.open(btn.url, "_blank");
                  if (btn.type === "phone_number" && btn.phone_number) window.open(`tel:${btn.phone_number}`);
                }}
                className="w-full py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors border-t border-gray-100 first:border-t-0"
              >
                {btn.type === "url" && <ExternalLink size={14} />}
                {btn.type === "phone_number" && <Phone size={14} />}
                {btn.text}
              </button>
            ))}
          </div>
        )}
      </>
    );
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.templateName) return renderTemplateContent(msg);
    return renderMediaContent(msg);
  };

  // ─── Loading / Unauthenticated ─────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <p className="text-gray-500">Redirecting to sign in...</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <>
      <Sidebar />

      <div className="flex flex-col md:flex-row h-screen bg-[#f0f2f5] text-gray-900 font-sans overflow-hidden">
        <div className="flex-1 md:ml-64 flex overflow-hidden">

          {/* ═══════ LEFT PANEL: CHAT LIST ═══════ */}
          <div className={`w-full md:w-[380px] bg-white md:border-r border-gray-200 flex flex-col flex-shrink-0 ${
            showChatList ? "flex" : "hidden md:flex"
          }`}>
            {/* Desktop Header */}
            <div className="hidden md:flex h-[60px] bg-[#f0f2f5] items-center justify-between px-4 text-gray-600 z-10 flex-shrink-0 border-b border-gray-200">
              <span className="font-bold text-gray-800 text-lg tracking-tight">Chats</span>
              <div className="flex gap-1">
                <button className="p-2 hover:bg-gray-200 rounded-full transition-colors"><MessageSquare className="w-5 h-5" /></button>
                <button className="p-2 hover:bg-gray-200 rounded-full transition-colors"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            {/* ✅ WABA NUMBER SELECTOR DROPDOWN */}
            <div className="px-3 py-2 bg-white border-b border-gray-100 flex-shrink-0">
              {loadingNumbers ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading numbers...
                </div>
              ) : whatsappNumbers.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>No WhatsApp numbers added yet.</span>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <Radio size={11} className="text-emerald-600 shrink-0" />
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      WhatsApp Number
                    </span>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedWabaId}
                      onChange={(e) => handleWabaChange(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition appearance-none cursor-pointer pr-8 text-gray-800"
                    >
                      {whatsappNumbers.length > 1 && (
                        <option value="all">📋 All Numbers ({whatsappNumbers.length})</option>
                      )}
                      {whatsappNumbers.map((n) => (
                        <option key={n._id} value={n.whatsappPhoneNumberId || n._id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>

                  {/* Show which number is selected */}
                  {selectedWabaId !== "all" && (
                    <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                      Viewing: <span className="font-semibold text-gray-600">
                        {whatsappNumbers.find((n) => n.whatsappPhoneNumberId === selectedWabaId)?.name || "Selected"}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Search Bar */}
            <div className="px-3 py-2 bg-[#f0f2f5] flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search or start new chat"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm transition-all border border-gray-100"
                />
              </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto scrollbar-hide bg-white">
              {loading || loadingNumbers ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                </div>
              ) : whatsappNumbers.length === 0 ? (
                <div className="p-6 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Radio className="w-7 h-7 text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-500">No WhatsApp Numbers</p>
                  <p className="text-xs text-gray-400 mt-1 px-4">Add a WhatsApp Business Account to start.</p>
                </div>
              ) : (
                chats
                  .filter((chat) => {
                    if (!searchQuery) return true;
                    const name = getResolvedName(chat).toLowerCase();
                    const phone = (chat.phone || chat._id).toLowerCase();
                    const query = searchQuery.toLowerCase();
                    return name.includes(query) || phone.includes(query);
                  })
                  .map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => handleChatSelect(chat)}
                      className={`flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-all duration-150 border-b border-gray-50 ${
                        activeChat === chat._id
                          ? "bg-emerald-50 border-l-4 border-l-emerald-500"
                          : "hover:bg-gray-50 border-l-4 border-l-transparent"
                      }`}
                    >
                      <div
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${getAvatarGradient(chat._id)} flex items-center justify-center font-bold text-white text-sm shadow-md flex-shrink-0`}
                      >
                        {getAvatarLabel(chat)}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold text-[14px] sm:text-[15px] text-gray-900 truncate">
                            {getDisplayName(chat)}
                          </h3>
                          <span className={`text-[11px] font-medium ml-2 flex-shrink-0 ${
                            chat.lastDirection === "out" ? "text-gray-400" : "text-emerald-600"
                          }`}>
                            {formatTime(chat.updatedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {chat.lastDirection === "out" && <CheckCheck className="w-4 h-4 text-blue-500 shrink-0" />}
                          <p className="text-sm text-gray-500 truncate leading-tight">
                            {chat.lastMessageType === "template" ? "[Template]" : chat.lastMessage}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* ═══════ RIGHT PANEL: CHAT WINDOW ═══════ */}
          <div className={`flex-1 flex flex-col relative bg-[#efeae2] overflow-hidden ${
            !showChatList ? "flex" : "hidden md:flex"
          }`}>
            <div
              className="absolute inset-0 opacity-5 pointer-events-none z-0"
              style={{
                backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                backgroundRepeat: "repeat",
              }}
            />

            {/* Chat Header */}
            <div className="h-14 md:h-[60px] bg-[#f0f2f5] border-b border-gray-200 flex items-center px-2 md:px-4 z-20 shadow-sm flex-shrink-0">
              {activeChatData ? (
                <>
                  <button
                    onClick={handleBackToChats}
                    className="md:hidden p-2 hover:bg-gray-200 rounded-full transition-colors mr-1 flex-shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>

                  <div
                    onClick={() => setShowProfile(true)}
                    className="flex items-center gap-2 md:gap-3 cursor-pointer hover:bg-gray-200 rounded-lg px-1 md:px-2 py-1 -ml-1 md:-ml-2 transition-colors flex-1 min-w-0"
                  >
                    <div
                      className={`w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(activeChatData._id)} flex items-center justify-center font-bold text-white text-xs shadow flex-shrink-0`}
                    >
                      {getAvatarLabel(activeChatData)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] md:text-[15px] text-gray-900 truncate">
                        {getDisplayName(activeChatData)}
                      </p>
                      <div className="h-4 flex items-center gap-1">
                        {isTyping ? (
                          <div className="flex items-center gap-1 text-emerald-600">
                            <span className="text-xs font-medium">typing</span>
                            <div className="flex gap-0.5">
                              <span className="w-1 h-1 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1 h-1 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1 h-1 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        ) : (
                          <p className="text-[12px] text-gray-500">online</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-0.5 md:gap-1 text-gray-500 flex-shrink-0">
                    <button className="p-2 md:p-2.5 hover:bg-gray-200 rounded-full transition-colors">
                      <Video className="w-5 h-5" />
                    </button>
                    <button className="hidden sm:block p-2 md:p-2.5 hover:bg-gray-200 rounded-full transition-colors">
                      <Search className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setShowProfile(true)}
                      className="p-2 md:p-2.5 hover:bg-gray-200 rounded-full transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 mx-auto font-medium text-sm md:text-base">
                  Select a chat to start messaging
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 relative z-10 overflow-hidden">
              <div
                ref={chatContainerRef}
                onScroll={checkScrollPosition}
                className="h-full overflow-y-auto overflow-x-hidden px-3 sm:px-[6%] py-4"
              >
                {!activeChat ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 px-4">
                    <div className="w-48 h-48 sm:w-[300px] sm:h-[300px] bg-emerald-100 rounded-full flex items-center justify-center mb-6 opacity-10 shadow-inner">
                      <MessageSquare className="w-20 h-20 sm:w-32 sm:h-32 text-emerald-800" />
                    </div>
                    <h2 className="text-2xl sm:text-4xl font-light mb-2 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 text-center">
                      WatiX Web
                    </h2>
                    <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                      <Lock size={12} /> End-to-end encrypted
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm flex-col gap-2">
                    <Lock size={16} /> No messages yet. Send one!
                  </div>
                ) : (
                  <div className="space-y-1 max-w-full overflow-hidden">
                    {groupedMessages().map((group, gIndex) => (
                      <div key={gIndex}>
                        <div className="flex justify-center my-5">
                          <div className="bg-white/90 text-gray-500 px-3 sm:px-4 py-1.5 rounded-xl text-[11px] font-bold shadow-sm flex items-center gap-1.5 backdrop-blur-sm uppercase tracking-wide">
                            <Lock size={9} /> {group.date}
                          </div>
                        </div>
                        {group.messages.map((msg, mIndex) => {
                          const nextMsg = group.messages[mIndex + 1];
                          const showTail = !nextMsg || nextMsg.direction !== msg.direction;
                          const senderName = getSenderName(msg);
                          const prevMsg = group.messages[mIndex - 1];
                          const showSenderName = msg.direction === "out" && senderName && (
                            !prevMsg ||
                            prevMsg.direction !== "out" ||
                            getSenderName(prevMsg) !== senderName
                          );

                          return (
                            <div
                              key={msg._id || mIndex}
                              className={`flex w-full relative group ${
                                msg.direction === "out" ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`relative max-w-[85%] sm:max-w-[65%] px-2.5 py-1.5 shadow-sm mt-0.5 min-w-0 transition-shadow hover:shadow-md ${
                                  msg.direction === "out"
                                    ? `bg-[#D9FDD3] ${showTail ? "rounded-t-2xl rounded-l-2xl rounded-br-sm" : "rounded-2xl"}`
                                    : `bg-white ${showTail ? "rounded-t-2xl rounded-r-2xl rounded-bl-sm" : "rounded-2xl"}`
                                }`}
                              >
                                {showTail && (
                                  <span
                                    className={`absolute bottom-0 w-4 h-4 ${
                                      msg.direction === "out"
                                        ? "right-0 translate-x-1 bg-[#D9FDD3]"
                                        : "left-0 -translate-x-1 bg-white"
                                    }`}
                                    style={{
                                      clipPath:
                                        msg.direction === "out"
                                          ? "polygon(100% 0, 0 100%, 100% 100%)"
                                          : "polygon(0 0, 100% 100%, 0 100%)",
                                    }}
                                  />
                                )}
                                <div className="min-w-0 overflow-hidden">
                                  {/* ✅ SENDER NAME BADGE (e.g. "The Real Leads") */}
                                  {showSenderName && (
                                    <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-emerald-200/60">
                                      <div
                                        className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarGradient(senderName!)} flex items-center justify-center font-bold text-white text-[9px] shadow-sm shrink-0`}
                                      >
                                        {senderName!.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="text-[11px] font-bold text-emerald-700 truncate">
                                        {senderName}
                                      </span>
                                    </div>
                                  )}

                                  {renderMessageContent(msg)}

                                  {/* Timestamp + Status */}
                                  <div className="flex items-center justify-end gap-1 ml-3 float-right mt-1 translate-y-1">
                                    <span className="text-[10px] text-gray-500 font-light whitespace-nowrap">
                                      {formatTime(getMessageDate(msg))}
                                    </span>
                                    {renderStatusIcon(msg)}
                                  </div>
                                  <div className="clear-both" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scroll-to-bottom button */}
              {showScrollBtn && activeChat && (
                <button
                  onClick={() => scrollToBottom("smooth")}
                  className="absolute bottom-6 right-4 sm:right-6 w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full shadow-xl flex items-center justify-center text-gray-500 hover:text-emerald-600 hover:bg-gray-50 transition-all z-20 border border-gray-100 hover:scale-105"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Input Area */}
            {activeChat && (
              <div className="bg-[#f0f2f5] px-2 sm:px-4 pt-2 pb-2.5 z-20 border-t border-gray-200 flex-shrink-0">
                {selectedFile && (
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-200 w-fit mb-2 shadow-sm">
                    <ImageIcon size={14} className="shrink-0" />
                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{selectedFile.name}</span>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="ml-1 hover:bg-emerald-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf"
                  />
                  <button className="p-2 text-gray-500 hover:text-emerald-600 transition-colors">
                    <Smile className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-500 hover:text-emerald-600 transition-colors"
                  >
                    <Paperclip className="w-5 h-5 sm:w-6 sm:h-6 rotate-45" />
                  </button>
                  <div className="flex-1 flex items-center bg-white rounded-2xl px-3 sm:px-5 shadow-sm border border-gray-100 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all min-w-0">
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !sending && sendMessage()}
                      placeholder="Type a message"
                      className="flex-1 py-2.5 bg-transparent border-none focus:outline-none text-[14px] sm:text-[15px] text-gray-800 placeholder:text-gray-400 min-w-0"
                    />
                  </div>
                  <button
                    onClick={sendMessage}
                    disabled={sending || (!text && !selectedFile)}
                    className={`p-2 sm:p-2.5 rounded-full transition-all duration-300 flex-shrink-0 ${
                      text || selectedFile
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg scale-105"
                        : "bg-transparent hover:bg-gray-200 text-gray-500"
                    }`}
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                    ) : text || selectedFile ? (
                      <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                    ) : (
                      <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Contact Info Drawer */}
            <div
              className={`absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#f0f2f5] shadow-2xl z-30 transition-transform duration-300 ease-in-out flex flex-col ${
                showProfile ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="h-14 md:h-[60px] bg-[#00a884] flex items-center px-4 text-white shadow-sm gap-4 md:gap-6 flex-shrink-0">
                <button
                  onClick={() => setShowProfile(false)}
                  className="hover:bg-white/10 rounded-full p-1.5 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <p className="font-medium text-lg">Contact info</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="bg-white p-6 sm:p-8 flex flex-col items-center shadow-sm">
                  <div
                    className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br ${getAvatarGradient(activeChatData?._id || "")} flex items-center justify-center font-bold text-white text-3xl sm:text-5xl shadow-inner mb-4`}
                  >
                    {activeChatData ? getAvatarLabel(activeChatData) : "?"}
                  </div>
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
                    {getDisplayName(activeChatData)}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 font-medium">
                    +{activeChatData?._id}
                  </p>
                </div>
                <div className="bg-white mt-3 p-4 sm:p-5 shadow-sm">
                  <p className="text-sm text-emerald-700 font-medium mb-1">About</p>
                  <p className="text-sm text-gray-600">Hey there! I am using WhatsApp.</p>
                </div>
                <div className="bg-white mt-3 p-4 sm:p-5 shadow-sm flex items-center gap-4">
                  <Lock size={18} className="text-gray-400 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-800 font-medium">Encryption</p>
                    <p className="text-xs text-gray-500">Messages are end-to-end encrypted.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
      </div>
    </>
  );
}
