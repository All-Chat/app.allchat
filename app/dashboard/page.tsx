/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  FileText,
  PlusCircle,
  RefreshCw,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Zap,
  Megaphone,
  ArrowRight,
  Send,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Loader2,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Phone,
  ShieldCheck,
  Gauge,
  Activity,
  Eye,
  X,
  Tag,
  Globe,
  Image as ImageIcon,
  Video,
  File,
  ExternalLink,
  CheckCheck,
  ArrowLeft,
  MoreVertical,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

const formatTier = (tier: string | undefined) => {
  if (!tier || tier === "N/A") return "N/A";
  if (tier === "TIER_UNLIMITED") return "Unlimited";
  if (tier === "TIER_100K") return "100,000 / 24h";
  if (tier === "TIER_10K") return "10,000 / 24h";
  if (tier === "TIER_1K") return "1,000 / 24h";
  if (tier === "TIER_250") return "250 / 24h";
  return tier.replace("TIER_", "") + " / 24h";
};

// ✅ Date Formatter
const formatDateTime = (dateInput: any) => {
  if (!dateInput) return "N/A";
  try {
    let date: Date;
    if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === "number") {
      date = new Date(dateInput < 10000000000 ? dateInput * 1000 : dateInput);
    } else if (typeof dateInput === "string") {
      date = new Date(dateInput);
    } else {
      return "N/A";
    }

    if (isNaN(date.getTime())) return "N/A";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "N/A";
  }
};

// ✅ Date Extractor (Created At)
const getCreatedAt = (tpl: any) => {
  if (tpl.createdAt) return tpl.createdAt;
  if (tpl.created_at) return tpl.created_at;
  if (tpl.date_created) return tpl.date_created;

  if (tpl.history && Array.isArray(tpl.history) && tpl.history.length > 0) {
    if (tpl.history[0].created_at) return tpl.history[0].created_at;
  }

  let objId = tpl._id || tpl.id;
  if (objId && typeof objId === "object" && typeof objId.toString === "function") {
    objId = objId.toString();
  }

  if (objId && typeof objId === "string" && objId.length === 24) {
    try {
      if (/^[0-9a-fA-F]{24}$/.test(objId)) {
        const timestamp = parseInt(objId.substring(0, 8), 16);
        return new Date(timestamp * 1000);
      }
    } catch (e) {}
  }

  return null;
};

// ✅ Date Extractor (Approved At)
const getApprovedAt = (tpl: any) => {
  if (tpl.updatedAt) return tpl.updatedAt;
  if (tpl.updated_at) return tpl.updated_at;
  if (tpl.approvedAt) return tpl.approvedAt;
  if (tpl.approved_at) return tpl.approved_at;
  
  if (tpl.history && Array.isArray(tpl.history) && tpl.history.length > 0) {
    const approvalEvent = tpl.history.find((h: any) => h.event === "APPROVED");
    if (approvalEvent?.created_at) return approvalEvent.created_at;
  }
  
  return null;
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // ✅ Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState<any>(null);

  const [statsData, setStatsData] = useState({
    totalChats: 0,
    totalWorkflows: 0,
    totalCampaigns: 0,
  });
  const [campaignsData, setCampaignsData] = useState<any[]>([]);
  const [phoneDetails, setPhoneDetails] = useState<any>(null);

  const [billingData, setBillingData] = useState({
    balance: 0,
    totalRecharged: 0,
    totalSpent: 0,
    canSendMessage: true,
  });

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/templates/list", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) return;
      if (data.success) setTemplates(data.templates);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) return;
      if (data.success) {
        setStatsData({
          totalChats: data.totalChats,
          totalWorkflows: data.totalWorkflows,
          totalCampaigns: data.totalCampaigns,
        });
        setCampaignsData(data.campaigns);
        setPhoneDetails(data.phoneDetails);

        if (data.billing) {
          setBillingData({
            balance: data.billing.balance || 0,
            totalRecharged: data.billing.totalRecharged || 0,
            totalSpent: data.billing.totalSpent || 0,
            canSendMessage: data.billing.canSendMessage !== false,
          });
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchTemplates();
      fetchDashboardStats();

      const interval = setInterval(() => {
        fetchTemplates();
        fetchDashboardStats();
      }, 30000);
      return () => clearInterval(interval);
    } else if (status === "unauthenticated") {
      window.location.href = "/";
    }
  }, [status]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/templates/sync", { method: "POST" });
      if (res.ok) {
        toast.success("Synced with Meta successfully 🔄");
        fetchTemplates();
      } else {
        toast.error("Sync failed");
      }
    } catch (err) {
      toast.error("Sync error");
    } finally {
      setSyncing(false);
    }
  };

  const handleCopy = (name: string) => {
    navigator.clipboard.writeText(name);
    toast.info("Template name copied!");
  };

  // ✅ Open Modal Function
  const openViewModal = (template: any) => {
    setViewingTemplate(template);
    setIsViewModalOpen(true);
  };

  const getStatusConfig = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'approved' || s === 'completed') return { icon: CheckCircle, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" };
    if (s === 'rejected' || s === 'failed') return { icon: XCircle, text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" };
    if (s === 'running') return { icon: Send, text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" };
    if (s === 'scheduled') return { icon: Clock, text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" };
    return { icon: Clock, text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" };
  };

  const userName = session?.user?.name || "";
  const parentTenantName = (session?.user as any)?.parentTenantName;

  const stats = [
    { title: "Total Chats", value: (statsData.totalChats ?? 0).toLocaleString(), icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50", link: "/chat" },
    { title: "Active Workflows", value: (statsData.totalWorkflows ?? 0).toString(), icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50", link: "/workflows" },
    { title: "Templates", value: templates?.length?.toString() ?? "0", icon: FileText, color: "text-purple-600", bg: "bg-purple-50", link: "/dashboard/templates" },
    { title: "Campaigns", value: (statsData.totalCampaigns ?? 0).toString(), icon: Megaphone, color: "text-amber-600", bg: "bg-amber-50", link: "/campaigns/list" },
  ];

  const displayedTemplates = showAllTemplates ? templates : templates.slice(0, 6);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      <main className="md:ml-64 flex flex-col min-h-screen">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">

          {/* Top Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {userName ? `Hi, ${userName}` : "Dashboard"}
                {parentTenantName && (
                  <span className="text-sm font-medium text-slate-500 ml-2">
                    (Sub-user of {parentTenantName})
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                Welcome back! Here&apos;s your overview.
              </p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-white border border-gray-200 text-gray-700 rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 transition-all text-xs font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync Meta"}
              </button>
            </div>
          </div>

          {/* WhatsApp Number Status & Billing Overview Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            
            {/* WHATSAPP NUMBER STATUS CARD */}
            <div className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-100">
                      <Phone className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 text-sm sm:text-base">WhatsApp Number Status</h2>
                      <p className="text-[11px] sm:text-xs text-gray-500">
                        {phoneDetails ? (
                          <>
                            {phoneDetails.displayPhoneNumber} <span className="text-gray-400 mx-1">•</span> {phoneDetails.verifiedName}
                          </>
                        ) : "Loading number details..."}
                      </p>
                    </div>
                  </div>
                </div>

                {phoneDetails ? (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <Activity size={16} className={
                        phoneDetails.status === "CONNECTED" ? "text-emerald-500" : 
                        phoneDetails.status === "DISCONNECTED" ? "text-gray-400" : "text-red-500"
                      } />
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
                        <p className={`text-xs font-bold ${
                          phoneDetails.status === "CONNECTED" ? "text-emerald-700" : 
                          phoneDetails.status === "DISCONNECTED" ? "text-gray-600" : "text-red-700"
                        }`}>
                          {phoneDetails.status}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <Gauge size={16} className={
                        phoneDetails.qualityRating === "GREEN" || phoneDetails.qualityRating === "HIGH" ? "text-emerald-500" :
                        phoneDetails.qualityRating === "YELLOW" || phoneDetails.qualityRating === "MEDIUM" ? "text-amber-500" :
                        phoneDetails.qualityRating === "RED" || phoneDetails.qualityRating === "LOW" ? "text-red-500" : "text-gray-400"
                      } />
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quality Score</p>
                        <p className={`text-xs font-bold ${
                          phoneDetails.qualityRating === "GREEN" || phoneDetails.qualityRating === "HIGH" ? "text-emerald-700" :
                          phoneDetails.qualityRating === "YELLOW" || phoneDetails.qualityRating === "MEDIUM" ? "text-amber-700" :
                          phoneDetails.qualityRating === "RED" || phoneDetails.qualityRating === "LOW" ? "text-red-700" : "text-gray-700"
                        }`}>
                          {phoneDetails.qualityRating}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <Send size={16} className="text-blue-500" />
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Msg Limit</p>
                        <p className="text-xs font-bold text-blue-700">{formatTier(phoneDetails.messagingLimitTier)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <ShieldCheck size={16} className={phoneDetails.twoFactorEnabled === true ? "text-emerald-500" : "text-gray-400"} />
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Two-Factor Auth</p>
                        <p className={`text-xs font-bold ${phoneDetails.twoFactorEnabled === true ? "text-emerald-700" : "text-gray-700"}`}>
                          {phoneDetails.twoFactorEnabled === true ? "Enabled" : phoneDetails.twoFactorEnabled === false ? "Disabled" : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center py-4 text-gray-400 text-xs">
                    <Loader2 size={14} className="animate-spin mr-2" /> Fetching live data from Meta...
                  </div>
                )}
              </div>
            </div>

            {/* BILLING OVERVIEW CARD */}
            <div className="relative overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm">
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${billingData.canSendMessage ? 'bg-emerald-100' : 'bg-red-100'}`}>
                      <Wallet className={`w-5 h-5 ${billingData.canSendMessage ? 'text-emerald-600' : 'text-red-600'}`} />
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 text-sm sm:text-base">Billing Overview</h2>
                      <p className="text-[11px] sm:text-xs text-gray-500">
                        {parentTenantName ? `Shared wallet managed by ${parentTenantName}` : "Your messaging credits and usage"}
                      </p>
                    </div>
                  </div>
                  <Link href="/settings" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors shrink-0">
                    View Details <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                  {/* Balance Remaining */}
                  <div className={`relative overflow-hidden p-4 sm:p-5 rounded-xl border ${
                    billingData.canSendMessage
                      ? 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200'
                      : 'bg-gradient-to-br from-red-50 to-white border-red-200'
                  }`}>
                    <div className="absolute -top-3 -right-3 w-16 h-16 bg-emerald-100/30 rounded-full blur-xl" />
                    <div className="relative">
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${billingData.canSendMessage ? 'text-emerald-600' : 'text-red-600'}`}>
                        Balance Left
                      </p>
                      {/* ✅ FIX: Reduced font size and changed invalid text-black-700 to text-gray-900 */}
                      <p className={`text-base sm:text-lg md:text-xl font-extrabold break-all leading-tight ${billingData.canSendMessage ? 'text-gray-900' : 'text-red-700'}`}>
                        {formatINR(billingData.balance)}
                      </p>
                      {!billingData.canSendMessage && (
                        <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                          <AlertCircle size={10} /> Insufficient balance
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Total Recharged */}
                  <div className="relative overflow-hidden p-4 sm:p-5 rounded-xl border bg-gradient-to-br from-blue-50 to-white border-blue-200">
                    <div className="absolute -top-3 -right-3 w-16 h-16 bg-blue-100/30 rounded-full blur-xl" />
                    <div className="relative">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-1.5">
                        Total Recharged
                      </p>
                      <p className="text-base sm:text-lg md:text-xl font-extrabold break-all leading-tight text-gray-900">
                        {formatINR(billingData.totalRecharged)}
                      </p>
                    </div>
                  </div>

                  {/* Total Spent */}
                  <div className="relative overflow-hidden p-4 sm:p-5 rounded-xl border bg-gradient-to-br from-orange-50 to-white border-orange-200">
                    <div className="absolute -top-3 -right-3 w-16 h-16 bg-orange-100/30 rounded-full blur-xl" />
                    <div className="relative">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 mb-1.5">
                        Total Spent
                      </p>
                      <p className="text-base sm:text-lg md:text-xl font-extrabold break-all leading-tight text-gray-900">
                        {formatINR(billingData.totalSpent)}
                      </p>
                    </div>
                  </div>
                </div>

                {billingData.balance === 0 && billingData.totalRecharged === 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      No balance yet. Contact your administrator to recharge your account and start sending messages.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {stats.map((stat) => (
             <Link
              key={stat.title}
              href={stat.link}
              className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}
                  >
                    <stat.icon size={18} />
                  </div>

                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-none">
                      {stat.value}
                    </p>
                    <p className="text-[11px] sm:text-xs font-medium text-gray-500 mt-1">
                      {stat.title}
                    </p>
                  </div>
                </div>

                <ArrowRight
                  size={16}
                  className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all"
                />
              </div>
            </Link>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">

            {/* Left Column: Recent Templates */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-gray-900">
                  {showAllTemplates ? "All Templates" : "Recent Templates"}
                </h2>
                <Link href="/dashboard/templates" className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors">
                  Create New <PlusCircle size={14} />
                </Link>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                {loading ? (
                  <div className="p-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 mx-auto animate-spin text-emerald-500 mb-2" />
                    <p className="text-sm font-medium">Loading templates...</p>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center bg-white rounded-2xl">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-50 flex items-center justify-center">
                      <FileText className="w-7 h-7 text-gray-300" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">No templates yet</h3>
                    <p className="text-xs text-gray-500 mt-1 mb-4">Get started by creating your first template.</p>
                    <Link href="/dashboard/templates" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition">
                      <PlusCircle className="w-3.5 h-3.5" /> Create Template
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-gray-100">
                      {displayedTemplates.map((tpl: any) => {
                        const statusConfig = getStatusConfig(tpl.status);

                        return (
                          <div key={tpl.id || tpl._id} className="flex justify-between items-center p-3 sm:p-4 hover:bg-gray-50/80 transition-colors duration-150 group gap-3">
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${statusConfig.bg} border ${statusConfig.border}`}>
                                <FileText className={`w-4 h-4 sm:w-5 sm:h-5 ${statusConfig.text}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-gray-900 text-xs sm:text-sm truncate">{tpl.name}</h3>
                                  <button onClick={() => handleCopy(tpl.name)} className="text-gray-300 hover:text-blue-600 transition opacity-0 group-hover:opacity-100 shrink-0">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="flex items-center flex-wrap gap-2 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                    tpl.type === 'text' ? 'bg-gray-100 text-gray-600' :
                                    tpl.type === 'image' ? 'bg-purple-50 text-purple-700' :
                                    'bg-blue-50 text-blue-700'
                                  }`}>
                                    {tpl.type || 'text'}
                                  </span>
                                  <span className="text-[10px] text-gray-400 truncate">{tpl.language || "en_US"}</span>
                                  <span className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
                                    <Clock size={9} /> {formatDateTime(getCreatedAt(tpl))}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                              <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${statusConfig.bg} ${statusConfig.border}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                                <span className={`text-[10px] font-bold ${statusConfig.text}`}>
                                  {tpl.status ? tpl.status.toUpperCase() : "PENDING"}
                                </span>
                              </div>
                              <span className={`sm:hidden w-2.5 h-2.5 rounded-full ${statusConfig.dot}`}></span>

                              {/* ✅ STABLE VIEW BUTTON THAT OPENS MODAL */}
                              <button
                                onClick={() => openViewModal(tpl)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Template"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {templates.length > 6 && (
                      <div className="p-3 border-t border-gray-100 bg-gray-50/50 text-center">
                        {/* Footer content if needed */}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Column: Quick Actions & Campaigns */}
            <div className="space-y-6">

              {/* Quick Actions Card */}
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/chat" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:shadow-md hover:border-gray-300 transition-all group">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                      <MessageSquare size={18} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700">Live Chat</span>
                  </Link>
                  <Link href="/workflows" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:shadow-md hover:border-gray-300 transition-all group">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                      <Zap size={18} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700">Workflows</span>
                  </Link>
                  <Link href="/dashboard/templates" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:shadow-md hover:border-gray-300 transition-all group">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                      <FileText size={18} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700">Templates</span>
                  </Link>
                  <Link href="/campaigns/create" className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:shadow-md hover:border-gray-300 transition-all group">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                      <Megaphone size={18} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700">Campaign</span>
                  </Link>
                </div>
              </div>

              {/* Real Campaign Status Card */}
              <div>
                <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Active Campaigns</h2>
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                  {campaignsData?.length === 0 ? (
                    <div className="p-8 text-center">
                      <Megaphone className="w-6 h-6 mx-auto text-gray-300 mb-2" />
                      <p className="text-xs text-gray-500">No active campaigns</p>
                    </div>
                  ) : (
                    campaignsData?.slice(0, 2).map((camp: any) => {
                      const statusConfig = getStatusConfig(camp.status);
                      return (
                        <div key={camp._id} className="p-4 group hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{camp.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full border ${statusConfig.bg} ${statusConfig.border} text-[10px] font-bold ${statusConfig.text} shrink-0`}>
                              {camp.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Send size={10} className="text-blue-500" /> {camp.sentCount} Sent</span>
                            <span className="flex items-center gap-1"><BarChart3 size={10} className="text-emerald-500" /> {camp.readPercent}% Read</span>
                            {camp.totalDeducted > 0 && (
                              <span className="flex items-center gap-1"><Wallet size={10} className="text-blue-500" /> {formatINR(camp.totalDeducted)}</span>
                            )}
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${camp.progress}%` }}></div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>

      {/* ✅ BEAUTIFUL WHATSAPP VIEW MODAL */}
      {isViewModalOpen && viewingTemplate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsViewModalOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header (Left/Top side) */}
            <div className="p-6 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 md:w-64 shrink-0 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Eye className="w-5 h-5 text-emerald-600" />
                </div>
                <button onClick={() => setIsViewModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <h2 className="text-sm font-bold text-slate-900 mb-1">Template Details</h2>
              <p className="text-xs text-slate-500 mb-6 break-all">{viewingTemplate.name}</p>
              
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold w-fit ${getStatusConfig(viewingTemplate.status).bg} ${getStatusConfig(viewingTemplate.status).border} ${getStatusConfig(viewingTemplate.status).text}`}>
                    {viewingTemplate.status?.toUpperCase() || "PENDING"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Category</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-semibold w-fit">
                    <Tag size={11} className="text-slate-400" /> {viewingTemplate.category || "MARKETING"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Language</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-semibold w-fit">
                    <Globe size={11} className="text-slate-400" /> {viewingTemplate.language || "en_US"}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Created On</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-xs font-semibold w-fit">
                    <Clock size={11} className="text-slate-400" /> {formatDateTime(getCreatedAt(viewingTemplate))}
                  </span>
                </div>
              </div>
            </div>

            {/* WhatsApp Phone Mockup (Right/Bottom side) */}
            <div className="flex-1 flex items-center justify-center p-6 bg-slate-100 overflow-y-auto">
              <div className="bg-slate-900 rounded-[2rem] p-2 shadow-xl w-full max-w-[340px] border-[6px] border-slate-800">
                <div className="bg-[#efeae2] rounded-[1.5rem] overflow-hidden flex flex-col h-[600px] relative">
                  
                  {/* WhatsApp Chat Header */}
                  <div className="bg-[#008069] text-white px-3 py-2.5 flex items-center gap-3 z-10 shrink-0">
                    <ArrowLeft size={18} className="text-white/90" />
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">U</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">User Name</p>
                      <p className="text-[10px] text-white/80">online</p>
                    </div>
                    <Video size={16} className="text-white/90" />
                    <Phone size={14} className="text-white/90" />
                    <MoreVertical size={18} className="text-white/90" />
                  </div>

                  {/* Chat Area */}
                  <div className="flex-1 overflow-y-auto p-4 relative">
                    <div 
                      className="absolute inset-0 opacity-5 pointer-events-non " 
                      style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundSize: '260px' }}
                    ></div>
                    
                    {/* Chat Bubble */}
                    <div className="relative ml-auto max-w-[85%] bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-sm overflow-hidden border border-[#c8fdc6]">
                      
                      {/* Bubble Tail */}
                      <div className="absolute -top-2 right-0 w-4 h-4 bg-[#d9fdd3] border-l border-t border-[#c8fdc6]" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}></div>

                      <div className="relative z-10 p-2">
                        {/* Render Header */}
                        {(() => {
                          const header = viewingTemplate.components?.find((c: any) => c.type === "HEADER");
                          if (!header) return null;

                          if (header.format === "TEXT") {
                            return <p className="font-bold text-gray-900 text-sm mb-1 px-1">{header.text}</p>;
                          }
                          if (header.format === "IMAGE") {
                            return (
                              <div className="w-100 h-40 -m-2 mb-1 bg-slate-200 flex items-center justify-center overflow-hidden">
                                <ImageIcon className="w-20 h-20 mr-40 text-slate-400" />
                              </div>
                            );
                          }
                          if (header.format === "VIDEO") {
                            return (
                              <div className="w-100 h-40 -m-2 mb-1 bg-slate-800 flex items-center justify-center overflow-hidden">
                                <Video className="w-20 h-20 mr-40 text-slate-400" />
                              </div>
                            );
                          }
                          if (header.format === "DOCUMENT") {
                            return (
                              <div className="m-1 mb-2 p-2.5 bg-white/60 rounded-lg flex items-center gap-3 border border-slate-200">
                                <File className="w-8 h-8 text-red-500" />
                                <div className="text-sm font-medium text-slate-700">document.pdf</div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Render Body */}
                        {(() => {
                          const body = viewingTemplate.components?.find((c: any) => c.type === "BODY");
                          if (!body || !body.text) return null;
                          return <p className="text-gray-800 text-sm mb-1 px-1 whitespace-pre-wrap">{body.text}</p>;
                        })()}

                        {/* Render Footer */}
                        {(() => {
                          const footer = viewingTemplate.components?.find((c: any) => c.type === "FOOTER");
                          if (!footer || !footer.text) return null;
                          return <p className="text-[11px] text-gray-500 px-1 mb-1">{footer.text}</p>;
                        })()}

                        {/* Time and Ticks */}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-gray-500 px-1">
                          12:00 PM
                          <CheckCheck size={12} className="text-blue-500" />
                        </div>
                      </div>

                      {/* Render Buttons */}
                      {(() => {
                        const buttonsComp = viewingTemplate.components?.find((c: any) => c.type === "BUTTONS");
                        if (!buttonsComp || !buttonsComp.buttons || buttonsComp.buttons.length === 0) return null;

                        return (
                          <div className="border-t border-[#c8fdc6] mt-1 bg-[#d9fdd3]">
                            {buttonsComp.buttons.map((btn: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-center gap-1.5 text-[#00a5f4] font-medium text-sm py-2.5 border-b border-[#c8fdc6] last:border-b-0 cursor-pointer hover:bg-black/5 transition-colors">
                                {btn.type === "URL" && <ExternalLink size={14} />}
                                {btn.type === "PHONE_NUMBER" && <Phone size={14} />}
                                {btn.text}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" theme="light" autoClose={2000} />
    </div>
  );
}
