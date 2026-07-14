/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   LIVE CHAT PAGE - MULTI-WABA SUPPORT (20 FAST + BACKGROUND DETAILS)
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

type WhatsappNumber = {
  _id: string;
  name: string;
  wabaId?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  isActive?: boolean;
};

// ✅ NEW: Type to hold both Name and Profile Picture URL
type ContactDetails = {
  name?: string;
  profilePicUrl?: string;
};

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
  if (res.status === 401) { window.location.href = "/"; return true; }
  return false;
};

export default function ChatPage() {
  const { data: session, status } = useSession();

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
  
  // ✅ NEW: State holds both name and profile pic
  const [contactDetails, setContactDetails] = useState<Record<string, ContactDetails>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsappNumber[]>([]);
  const [selectedWabaId, setSelectedWabaId] = useState<string>("all");
  const [loadingNumbers, setLoadingNumbers] = useState(true);

  const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({});
  const [fetchedTemplateData, setFetchedTemplateData] = useState<Record<string, any>>({});
  const fetchedTemplates = useRef<Set<string>>(new Set()); 

  const [showChatList, setShowChatList] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCount = useRef(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fetchedContacts = useRef<Set<string>>(new Set());
  const isFetchingChats = useRef(false);
  const isFetchingMessages = useRef(false);
  const isInitialLoad = useRef(false); 

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

      if (numbers.length === 1 && numbers[0].whatsappPhoneNumberId) {
        setSelectedWabaId(numbers[0].whatsappPhoneNumberId);
      }
    } catch (err) {
      console.error("Failed to fetch WhatsApp numbers:", err);
    } finally {
      setLoadingNumbers(false);
    }
  }, []);

  const getSenderName = useCallback((msg: Message): string | null => {
    if (msg.direction !== "out") return null;
    if (msg.whatsappPhoneNumberId) {
      const match = whatsappNumbers.find((n) => n.whatsappPhoneNumberId === msg.whatsappPhoneNumberId);
      if (match?.name) return match.name;
    }
    if (selectedWabaId !== "all") {
      const sel = whatsappNumbers.find((n) => n.whatsappPhoneNumberId === selectedWabaId);
      if (sel?.name) return sel.name;
    }
    if (whatsappNumbers.length === 1 && whatsappNumbers[0]?.name) {
      return whatsappNumbers[0].name;
    }
    return null;
  }, [whatsappNumbers, selectedWabaId]);

  // ✅ NEW: Fetch details (Name + PP) for a single phone in the background
  const fetchContactDetails = useCallback(async (phoneId: string) => {
    if (fetchedContacts.current.has(phoneId)) return;
    fetchedContacts.current.add(phoneId);
    try {
      const cleanPhone = phoneId.replace(/\+/g, "");
      const res = await fetch(`/api/contacts?phone=${encodeURIComponent(cleanPhone)}`);
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      if (data.success && data.contact) {
        const newName = data.contact.name?.trim() && data.contact.name !== "Unknown" ? data.contact.name : undefined;
        const newPic = data.contact.profilePicUrl || undefined;
        
        if (newName || newPic) {
          setContactDetails((prev) => ({ 
            ...prev, 
            [phoneId]: { name: newName, profilePicUrl: newPic } 
          }));
        }
      }
    } catch { /* silent */ }
  }, []);

  const getResolvedName = useCallback((chat: Chat): string => {
    const contactName = contactDetails[chat._id]?.name;
    if (contactName && contactName.trim()) return contactName;
    if (chat.name?.trim() && chat.name !== "Unknown") return chat.name;
    if (chat.phone?.trim() && chat.phone !== "Unknown") return chat.phone;
    return chat._id;
  }, [contactDetails]);

  const getDisplayName = (chat: Chat | null) => {
    if (!chat) return "";
    const name = getResolvedName(chat);
    return name !== "Unknown" ? name : chat._id;
  };

  const getAvatarLabel = (chat: Chat) => getAvatarText(getResolvedName(chat), chat.phone || chat._id);

  // ✅ NEW: Helper to render Avatar (Image or Gradient Fallback)
  const renderAvatar = (chatId: string, sizeClass: string, textClass: string) => {
    const picUrl = contactDetails[chatId]?.profilePicUrl;
    if (picUrl) {
      return (
        <img 
          src={picUrl} 
          alt="avatar" 
          className={`${sizeClass} rounded-full object-cover shadow-md flex-shrink-0`} 
        />
      );
    }
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br ${getAvatarGradient(chatId)} flex items-center justify-center font-bold text-white ${textClass} shadow-md flex-shrink-0`}>
        {getAvatarLabel({ _id: chatId, name: contactDetails[chatId]?.name } as Chat)}
      </div>
    );
  };

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
    if (!c || messages.length === 0) return;
    
    if (isInitialLoad.current) {
      scrollToBottom("instant");
      isInitialLoad.current = false;
    } else {
      if (c.scrollHeight - c.scrollTop - c.clientHeight < 200) {
        scrollToBottom("smooth");
      }
    }
  }, [messages]);

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

        // ✅ Fetch details (Name/PP) in the background ONLY for the 20 loaded chats
        data.chats.forEach((chat: Chat) => {
          if (!contactDetails[chat._id]) {
            fetchContactDetails(chat._id);
          }
        });

        if (activeChat) {
          const current = data.chats.find((c: Chat) => c._id === activeChat);
          if (current) setActiveChatData(current);
        }
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setLoading(false);
      isFetchingChats.current = false;
    }
  }, [activeChat, selectedWabaId, contactDetails, fetchContactDetails]);

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
          const templateName = msg.templateName;
          if (templateName && !msg.templateBodyText && !fetchedTemplates.current.has(templateName)) {
            fetchedTemplates.current.add(templateName);
            fetch(`/api/chat/template-data?name=${encodeURIComponent(templateName)}&language=${msg.templateLanguage || "en"}`)
              .then(res => res.ok ? res.json() : null)
              .then(tplData => {
                if (tplData?.success && tplData.template) {
                  setFetchedTemplateData(prev => ({
                    ...prev,
                    [templateName]: tplData.template
                  }));
                }
              })
              .catch(() => {});
          }
        }

        for (const msg of newMessages) {
          if (msg.contactName?.trim() && msg.contactName !== "Unknown") {
            const key = activeChat!;
            const contactName = msg.contactName.trim();
            setContactDetails((prev) => ({ 
              ...prev, 
              [key]: { ...prev[key], name: contactName } 
            }));
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

  const handleWabaChange = (newId: string) => {
    setSelectedWabaId(newId);
    setActiveChat(null);
    setActiveChatData(null);
    setMessages([]);
    setMediaErrors({});
    fetchedTemplates.current.clear();
    setFetchedTemplateData({});
    prevMessageCount.current = 0;
    setShowChatList(true);
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchWhatsappNumbers();
    } else if (status === "unauthenticated") {
      window.location.href = "/";
    }
  }, [status, fetchWhatsappNumbers]);

  useEffect(() => {
    if (status === "authenticated" && !loadingNumbers) {
      loadChats();
    }
  }, [status, loadingNumbers, selectedWabaId, loadChats]);

  useEffect(() => {
    prevMessageCount.current = 0;
    setMessages([]);
    setShowProfile(false);
    isInitialLoad.current = true; 
    if (activeChat) {
      loadMessages();
      fetchContactDetails(activeChat);
    }
  }, [activeChat, loadMessages, fetchContactDetails]);

  useEffect(() => {
    if (status !== "authenticated" || loadingNumbers) return;
    const interval = setInterval(() => {
      loadChats();
      if (activeChat) loadMessages();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChat, loadChats, loadMessages, status, loadingNumbers]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const sendMessage = async () => {
    if ((!text && !selectedFile) || !activeChat) return;
    setSending(true);
    try {
      const cleanPhone = activeChat.replace(/\+/g, "");
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
        fetchContactDetails(activeChat);
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
    return `/api/chat-media?id=${url}`;
  };

  const renderStatusIcon = (msg: Message) => {
    if (msg.direction !== "out") return null;
    if (msg.status === "read") return <CheckCheck className="w-[18px] h-[18px] text-blue-500 shrink-0" />;
    if (msg.status === "delivered") return <CheckCheck className="w-[18px] h-[18px] text-gray-400 shrink-0" />;
    return <Check className="w-[18px] h-[18px] text-gray-400 shrink-0" />;
  };

  const renderPlaceholder = (type: string | undefined) => {
    const t = (type || "image").toLowerCase();
    return (
      <div className="w-40 h-40 bg-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-500 uppercase font-bold tracking-wide">
        {t === "image" && <ImageIcon size={32} className="mb-2" />}
        {t === "video" && <Video size={32} className="mb-2" />}
        {(t === "document" || t === "pdf") && <FileText size={32} className="mb-2" />}
        <span>{t === "document" ? "PDF" : t}</span>
      </div>
    );
  };

  const renderButtonRow = (msg: Message) => {
    const buttons = parseTemplateButtons(msg.templateButtons);
    if (buttons.length === 0) return null;
    return (
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
            {btn.type === "quick_reply" && <MessageSquare size={14} />}
            {btn.text}
          </button>
        ))}
      </div>
    );
  };

  const renderMediaContent = (msg: Message) => {
    const type = msg.messageType || "text";
    const src = getMediaSrc(msg.mediaUrl);
    const hasError = mediaErrors[msg._id];

    if (hasError) {
      return (
        <div className="mb-1">
          {renderPlaceholder(type)}
          {msg.text && <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words mt-1.5">{msg.text}</p>}
          {renderButtonRow(msg)}
        </div>
      );
    }

    if (type === "image" && src)
      return (
        <div className="mb-1 max-w-[220px] sm:max-w-[300px]">
          <img src={src} alt="Image" className="rounded-xl max-w-full object-cover shadow-sm" onError={() => setMediaErrors((prev) => ({ ...prev, [msg._id]: true }))} />
          {msg.text && <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words mt-1.5">{msg.text}</p>}
          {renderButtonRow(msg)}
        </div>
      );
    if (type === "video" && src)
      return (
        <div className="mb-1 max-w-[220px] sm:max-w-[300px]">
          <video src={src} controls className="rounded-xl max-w-full object-cover shadow-sm" onError={() => setMediaErrors((prev) => ({ ...prev, [msg._id]: true }))} />
          {msg.text && <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words mt-1.5">{msg.text}</p>}
          {renderButtonRow(msg)}
        </div>
      );
    if (type === "audio" && src)
      return (
        <div className="mb-1 w-56 sm:w-72">
          <audio controls className="w-full outline-none" onError={() => setMediaErrors((prev) => ({ ...prev, [msg._id]: true }))}>
            <source src={src} type="audio/ogg" />
          </audio>
          {renderButtonRow(msg)}
        </div>
      );
    if (type === "document" && src)
      return (
        <div className="mb-1">
          <a href={src} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-white/80 rounded-xl p-3 hover:bg-white transition-colors shadow-sm">
            <FileText className="w-8 h-8 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{msg.text || "Document.pdf"}</p>
              <p className="text-[11px] text-indigo-600 font-medium">Click to download</p>
            </div>
          </a>
          {renderButtonRow(msg)}
        </div>
      );
    return (
      <>
        <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{msg.text}</p>
        {renderButtonRow(msg)}
      </>
    );
  };

  const renderTemplateContent = (msg: Message) => {
    const src = getMediaSrc(msg.mediaUrl);
    const tplData = msg.templateName ? fetchedTemplateData[msg.templateName] || {} : {};
    const headerType = msg.templateHeaderType || tplData.templateHeaderType || 
      (msg.messageType === "image" || msg.messageType === "video" || msg.messageType === "document" ? msg.messageType : undefined);
    const hasError = mediaErrors[msg._id];

    const bodyText = msg.templateBodyText || tplData.templateBodyText || "Loading template...";
    const headerText = msg.templateHeaderText || tplData.templateHeaderText;
    const footer = msg.templateFooter || tplData.templateFooter;
    
    const msgButtons = parseTemplateButtons(msg.templateButtons);
    const buttons = msgButtons.length > 0 ? msgButtons : parseTemplateButtons(tplData.templateButtons);

    return (
      <>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Tag size={10} className="text-emerald-600 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 whitespace-nowrap">
            {msg.templateName}
          </span>
        </div>

        {!hasError && (headerType === "image" || msg.messageType === "image") && src && (
          <div className="mb-2 -mx-2.5 -mt-0.5 overflow-hidden rounded-t-xl">
            <img src={src!} alt="" className="w-full max-h-56 sm:max-h-72 object-cover" onError={() => setMediaErrors((prev) => ({ ...prev, [msg._id]: true }))} />
          </div>
        )}
        {!hasError && (headerType === "video" || msg.messageType === "video") && src && (
          <div className="mb-2">
            <video src={src!} controls className="rounded-xl max-w-full max-h-56 sm:max-h-72 object-cover" onError={() => setMediaErrors((prev) => ({ ...prev, [msg._id]: true }))} />
          </div>
        )}
        {!hasError && (headerType === "document" || msg.messageType === "document") && src && (
          <a href={src!} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-center gap-3 bg-white/80 rounded-xl p-3 hover:bg-white transition-colors shadow-sm">
            <FileText className="w-8 h-8 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{headerText || "Document"}</p>
              <p className="text-[11px] text-indigo-600 font-medium">Tap to download</p>
            </div>
          </a>
        )}

        {hasError && (headerType === "image" || headerType === "video" || headerType === "document") && (
          <div className="mb-2">{renderPlaceholder(headerType || msg.messageType)}</div>
        )}

        {headerType === "text" && headerText && (
          <p className="text-[14px] font-bold text-gray-900 whitespace-pre-wrap break-words mb-1">
            {headerText}
          </p>
        )}

        <p className="text-[14px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
          {bodyText}
        </p>

        {footer && (
          <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">{footer}</p>
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

  return (
    <>
      <Sidebar />

      <div className="flex flex-col md:flex-row h-screen bg-[#f0f2f5] text-gray-900 font-sans overflow-hidden">
        <div className="flex-1 md:ml-64 flex overflow-hidden">

          {/* ═══════ LEFT PANEL: CHAT LIST ═══════ */}
          <div className={`w-full md:w-[380px] bg-white md:border-r border-gray-200 flex flex-col flex-shrink-0 ${
            showChatList ? "flex" : "hidden md:flex"
          }`}>
            <div className="hidden md:flex h-[60px] bg-[#f0f2f5] items-center justify-between px-4 text-gray-600 z-10 flex-shrink-0 border-b border-gray-200">
              <span className="font-bold text-gray-800 text-lg tracking-tight">Chats</span>
              <div className="flex gap-1">
                <button className="p-2 hover:bg-gray-200 rounded-full transition-colors"><MessageSquare className="w-5 h-5" /></button>
                <button className="p-2 hover:bg-gray-200 rounded-full transition-colors"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

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
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">WhatsApp Number</span>
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
                      {whatsappNumbers
                        .filter((n) => n.whatsappPhoneNumberId && n.whatsappPhoneNumberId.trim() !== "")
                        .map((n) => (
                          <option key={n._id} value={n.whatsappPhoneNumberId}>
                            {n.name}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>

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
                      {renderAvatar(chat._id, "w-11 h-11 sm:w-12 sm:h-12", "text-sm")}
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
                    {renderAvatar(activeChatData._id, "w-9 h-9 md:w-10 md:h-10", "text-xs")}
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
                      All Chat Web
                    </h2>
                    <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                      <Lock size={12} /> End-to-end encrypted
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm flex-col gap-2 mt-10">
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

              {showScrollBtn && activeChat && (
                <button
                  onClick={() => scrollToBottom("smooth")}
                  className="absolute bottom-6 right-4 sm:right-6 w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full shadow-xl flex items-center justify-center text-gray-500 hover:text-emerald-600 hover:bg-gray-50 transition-all z-20 border border-gray-100 hover:scale-105"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
              )}
            </div>

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
                  {activeChatData && renderAvatar(activeChatData._id, "w-24 h-24 sm:w-32 sm:h-32", "text-3xl sm:text-5xl")}
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mt-4">
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
