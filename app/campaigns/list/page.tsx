/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import Sidebar from "@/components/Sidebar";
import {
  Play, Clock, CheckCircle, Loader2, XCircle, FileText,
  Trash2, Eye, X, Pencil, Send, BarChart3, Zap, Users,
  CheckCheck, AlertTriangle, Search, Filter, Radio, Wallet,
  AlertCircle, Pause, Square, MessageSquare, TrendingUp,
  TrendingDown, Mail, MessageCircle, Copy, Hourglass, MailX, RefreshCw,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/* =========================================================
   LOADER COMPONENT
========================================================= */

const ScannerLoader = () => {
  return (
    <ScannerWrapper>
      <div className="loader">
        <div className="scanner">
          <span>Loading...</span>
        </div>
      </div>
    </ScannerWrapper>
  );
};

const ScannerWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 40px 0;

  .scanner span {
    color: transparent;
    font-size: 1.4rem;
    position: relative;
    overflow: hidden;
  }

  .scanner span::before {
    content: "Loading...";
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 100%;
    border-right: 4px solid #000000;
    overflow: hidden;
    color: #000000;
    animation: load91371 2s linear infinite;
  }

  @keyframes load91371 {
    0%, 10%, 100% { width: 0; }
    10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 100% { border-right-color: transparent; }
    11%, 21%, 31%, 41%, 51%, 61%, 71%, 81%, 91% { border-right-color: #000000; }
    60%, 80% { width: 100%; }
  }
`;

/* =========================================================
   TYPES
========================================================= */

type LiveStats = {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  invalid: number;
  pending: number;
  duplicate: number;
};

type Campaign = {
  [x: string]: any;
  _id: string;
  name: string;
  templateName: string;
  templateCategory: string;
  variables: string[];
  mappedVariables?: string[][];
  phoneNumbers: string[];
  names?: string[];
  mediaUrl: string;
  mediaType: string;
  languageCode: string;
  status: "saved" | "scheduled" | "running" | "paused" | "stopped" | "completed" | "failed";
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  totalDeducted: number;
  scheduledAt: string;
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
  liveStats?: LiveStats;
  currentPrice?: number;
  pricePerMessage?: number;
};

/* =========================================================
   HELPER FUNCTIONS
========================================================= */

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount || 0);

const formatFullDateTime = (dateStr: string) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getCategoryColor = (category: any) => {
  switch (String(category || "").toUpperCase()) {
    case "MARKETING":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "UTILITY":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "AUTHENTICATION":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
};

/* =========================================================
   COMPUTE STATS
========================================================= */

type ComputedStats = LiveStats & {
  deliveredCombined: number;
  failedCombined: number;
};

const getCampaignStats = (campaign: Campaign): ComputedStats => {
  const ls: Partial<LiveStats> = campaign.liveStats ?? {};

  const sent = Number(ls.sent || 0);
  const delivered = Number(ls.delivered || 0);
  const read = Number(ls.read || 0);
  const replied = Number(ls.replied || 0);
  const failed = Number(ls.failed || 0);
  const invalid = Number(ls.invalid || 0);
  const duplicate = Number(ls.duplicate || 0);
  const total = Number(ls.total || campaign.totalMessages || 0);

  const deliveredCombined = sent + delivered + read + replied;
  const failedCombined = failed + invalid + duplicate;

  const totalProcessed = replied + read + delivered + sent + failed + invalid + duplicate;
  const pendingCount = Math.max(0, total - totalProcessed);

  return {
    total,
    sent,
    delivered,
    read,
    replied,
    failed,
    invalid,
    duplicate,
    pending: pendingCount,
    deliveredCombined,
    failedCombined,
  };
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function CampaignList() {
  const router = useRouter();
  const { status } = useSession();

  /* -------------------- STATE -------------------- */

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [viewCampaign, setViewCampaign] = useState<Campaign | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState<string | null>(null);
  const [quickPhone, setQuickPhone] = useState("");
  const [timers, setTimers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [balance, setBalance] = useState(0);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [enabledCountries, setEnabledCountries] = useState<any[]>([]);
  const [selectedCountryCode, setSelectedCountryCode] = useState("91");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 6;

  /* -------------------- FETCH FUNCTIONS -------------------- */

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success && data.billing) {
        setBalance(data.billing.balance || 0);
        setCanSendMessage(data.billing.canSendMessage !== false);
      }
    } catch (error) {
      console.error("Failed to fetch billing", error);
    }
  };

  const fetchPricing = async () => {
    try {
      const res = await fetch("/api/user/pricing", { cache: "no-store" });
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) {
        setEnabledCountries(data.enabledCountries || []);
        if (data.enabledCountries?.length > 0) {
          setSelectedCountryCode(data.enabledCountries[0].code);
        }
      }
    } catch (error) {
      console.error("Failed to fetch pricing", error);
    }
  };

  const loadCampaigns = async (isRetry = false) => {
    if (!isRetry) {
      setLoadingCampaigns(true);
    }

    try {
      const res = await fetch("/api/campaigns/billing", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      
      if (data.building) {
        await new Promise(r => setTimeout(r, 2000));
        return loadCampaigns(true);
      }

      if (data.success && Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns);
      } else {
        setCampaigns([]);
      }
    } catch (err) {
      console.error("Failed to load campaigns", err);
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const loadSingleCampaignStatus = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await fetch(`/api/campaigns/list?viewId=${id}`, { cache: "no-store" });
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success && data.campaigns.length > 0) {
        const updatedCampaign = data.campaigns[0];
        setCampaigns((prev) =>
          prev.map((c) =>
            c._id === id
              ? {
                  ...c,
                  liveStats: updatedCampaign.liveStats,
                  status: updatedCampaign.status,
                  totalDeducted: updatedCampaign.totalDeducted,
                  sentCount: updatedCampaign.sentCount,
                  failedCount: updatedCampaign.failedCount,
                }
              : c
          )
        );
        toast.success("Status updated");
      }
    } catch (err) {
      console.error("Failed to load status", err);
      toast.error("Failed to load status");
    } finally {
      setRefreshingId(null);
    }
  };

  /* -------------------- EFFECTS -------------------- */

  useEffect(() => {
    if (status === "authenticated") {
      loadCampaigns();
      fetchBilling();
      fetchPricing();
    }
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      const newTimers: Record<string, string> = {};
      campaigns.forEach((c) => {
        if (c.status === "scheduled" && c.scheduledAt) {
          const distance = new Date(c.scheduledAt).getTime() - Date.now();
          if (distance <= 0) {
            newTimers[c._id] = "Starting...";
          } else {
            const h = Math.floor(distance / (1000 * 60 * 60));
            const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((distance % (1000 * 60)) / 1000);
            newTimers[c._id] = `${h}h ${m}m ${s}s`;
          }
        }
      });
      setTimers(newTimers);
    }, 1000);
    return () => clearInterval(timerInterval);
  }, [campaigns]);

  useEffect(() => {
    if (!viewCampaign?._id) return;
    const updated = campaigns.find((c) => c._id === viewCampaign._id);
    if (!updated) return;

    const oldStats = JSON.stringify(viewCampaign.liveStats);
    const newStats = JSON.stringify(updated.liveStats);
    const hasChanges =
      oldStats !== newStats ||
      (viewCampaign.status || "") !== (updated.status || "") ||
      Number(viewCampaign.totalDeducted || 0) !== Number(updated.totalDeducted || 0);

    if (hasChanges) {
      setViewCampaign((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          liveStats: updated.liveStats || prev.liveStats,
          totalDeducted: updated.totalDeducted ?? prev.totalDeducted,
          currentPrice: updated.currentPrice ?? prev.currentPrice,
          pricePerMessage: updated.pricePerMessage ?? prev.pricePerMessage,
          status: updated.status || prev.status,
        };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);

  /* -------------------- CAMPAIGN ACTIONS -------------------- */

  const startCampaign = async (id: string) => {
    if (!canSendMessage) {
      toast.error("Insufficient balance.");
      return;
    }
    if (!confirm("Start this campaign now?")) return;

    setCampaigns((prev) => prev.map((c) => (c._id === id ? { ...c, status: "running" } : c)));
    setStartingId(id);

    try {
      const res = await fetch("/api/campaigns/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });

      if (res.status === 402) {
        const data402 = await res.json();
        toast.error(data402.message || "Insufficient balance.");
        setCanSendMessage(false);
        fetchBilling();
      } else {
        const data = await res.json();
        if (data.success) {
          toast.success("Campaign queued successfully!");
          fetchBilling();
        } else {
          toast.error(data.message || "Failed to start");
        }
      }
      loadCampaigns();
    } catch (err) {
      console.error("Start error:", err);
      toast.error("Failed to start");
      loadCampaigns();
    } finally {
      setStartingId(null);
    }
  };

  const handleCampaignAction = async (id: string, action: "pause" | "resume" | "stop") => {
    const newStatus = action === "pause" ? "paused" : action === "resume" ? "running" : "completed";
    setCampaigns((prev) => prev.map((c) => (c._id === id ? { ...c, status: newStatus } : c)));
    setActionId(id);

    try {
      const res = await fetch(`/api/campaigns/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Campaign ${action}ed!`);
        await loadCampaigns();
        if (action === "resume") {
          await fetch("/api/campaigns/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campaignId: id }),
          });
        }
      } else {
        toast.error(data.message || `Failed to ${action}`);
        loadCampaigns();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error");
      loadCampaigns();
    } finally {
      setActionId(null);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/campaigns/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Deleted");
        setCampaigns((prev) => prev.filter((c) => c._id !== id));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed");
    } finally {
      setDeletingId(null);
    }
  };

  /* -------------------- QUICK TEST SEND -------------------- */

  const quickTestSend = async (c: Campaign) => {
    if (!quickPhone) {
      toast.error("Enter a phone number");
      return;
    }
    if (!canSendMessage) {
      toast.error("Insufficient balance.");
      return;
    }

    try {
      let variablesToSend = c.variables || [];
      if (c.generateOtp && c.templateCategory === "AUTHENTICATION") {
        const len = c.otpLength || 4;
        const min = Math.pow(10, len - 1);
        const max = Math.pow(10, len) - 1;
        variablesToSend = [Math.floor(Math.random() * (max - min + 1) + min).toString()];
      } else if (c.mappedVariables && c.mappedVariables.length > 0) {
        variablesToSend = c.mappedVariables[0];
      }

      const fullPhone = `${selectedCountryCode}${quickPhone.replace(/\D/g, "")}`;
      const payload: any = {
        phone: fullPhone,
        templateName: c.templateName,
        variables: variablesToSend,
        languageCode: c.languageCode || "en",
        category: c.templateCategory || "MARKETING",
      };

      if (c.mediaUrl) {
        payload.mediaUrl = c.mediaUrl;
        payload.headerMediaType = c.mediaType;
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 402) {
        toast.error("Insufficient balance.");
        setCanSendMessage(false);
        fetchBilling();
        return;
      }

      const data = await res.json();

      if (data.success) {
        toast.success("Test sent!");
        fetchBilling();
      } else {
        toast.error(data.message || "Failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error");
    }
  };

  /* -------------------- VIEW CAMPAIGN -------------------- */

  const handleViewClick = async (campaignId: string) => {
    setViewLoadingId(campaignId);
    try {
      const res = await fetch(`/api/campaigns/list?viewId=${campaignId}`);
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.success && data.campaigns.length > 0) {
        const existing = campaigns.find((c) => c._id === campaignId);
        setViewCampaign({
          ...data.campaigns[0],
          liveStats: existing?.liveStats || data.campaigns[0]?.liveStats,
          totalDeducted: existing?.totalDeducted || 0,
          currentPrice: existing?.currentPrice || 0,
          pricePerMessage: existing?.pricePerMessage || 0,
        });
      } else {
        toast.error("Failed to load campaign details");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading details");
    } finally {
      setViewLoadingId(null);
    }
  };

  /* -------------------- FILTERING -------------------- */

  const filteredCampaigns = campaigns
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => {
      if (!searchTerm) return true;
      const lt = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(lt) || c.templateName.toLowerCase().includes(lt);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredCampaigns.slice(indexOfFirstItem, indexOfLastItem);

  /* -------------------- STATUS CONFIG -------------------- */

  const statusConfig: any = {
    saved: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200", icon: <FileText size={12} /> },
    scheduled: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", icon: <Clock size={12} /> },
    running: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: <Loader2 size={12} className="animate-spin" /> },
    paused: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: <Pause size={12} /> },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: <CheckCircle size={12} /> },
    failed: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: <XCircle size={12} /> },
    stopped: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: <Square size={12} /> },
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  /* =========================================================
     UI RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 text-gray-900">
      <Sidebar />

      {viewCampaign && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setViewCampaign(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 sm:p-6 text-white relative shrink-0">
              <button
                onClick={() => setViewCampaign(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl sm:text-2xl font-bold pr-8">{viewCampaign.name}</h2>
              <p className="text-sm text-white/80 mt-1">
                {viewCampaign.templateName} • {viewCampaign.templateCategory}
              </p>
              <div className="mt-2 flex gap-2">
                <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-lg text-xs font-bold">
                  🌐 {viewCampaign.languageCode || "en"}
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${getCategoryColor(viewCampaign.templateCategory)}`}>
                  📋 {viewCampaign.templateCategory || "MARKETING"}
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
              {(() => {
                const stats = getCampaignStats(viewCampaign);
                const currentPrice = Number(viewCampaign.currentPrice || viewCampaign.pricePerMessage || 0);
                const amountSpent = Number(viewCampaign.totalDeducted || 0);

                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                          <Users className="w-3.5 h-3.5 text-slate-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-extrabold text-slate-900 leading-none">{stats.total}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Total</p>
                        </div>
                      </div>
                      <div className="bg-cyan-50 px-3 py-2.5 rounded-lg border border-cyan-100 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-cyan-200 flex items-center justify-center shrink-0">
                          <CheckCheck className="w-3.5 h-3.5 text-cyan-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-extrabold text-cyan-700 leading-none">{stats.deliveredCombined}</p>
                          <p className="text-[9px] text-cyan-500 font-bold uppercase tracking-wider mt-0.5">Delivered</p>
                        </div>
                      </div>
                      <div className="bg-amber-50 px-3 py-2.5 rounded-lg border border-amber-100 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-200 flex items-center justify-center shrink-0">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-extrabold text-amber-700 leading-none">{stats.pending}</p>
                          <p className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-0.5">Pending</p>
                        </div>
                      </div>
                      <div className="bg-red-50 px-3 py-2.5 rounded-lg border border-red-100 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-red-200 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-extrabold text-red-700 leading-none">{stats.failedCombined}</p>
                          <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mt-0.5">Failed</p>
                        </div>
                      </div>
                    </div>

                    {amountSpent > 0 && (
                      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-3 rounded-xl border border-blue-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-blue-500" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">Amount Deducted</p>
                            <p className="text-base font-extrabold text-blue-700">{formatINR(amountSpent)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400">{stats.deliveredCombined} delivered</p>
                          {currentPrice > 0 && <p className="text-[10px] text-slate-400">@ {formatINR(currentPrice)} / msg</p>}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Status Breakdown</p>
                      <div className="mb-2">
                        <p className="text-[10px] font-bold text-cyan-600 uppercase mb-1.5 flex items-center gap-1">
                          <TrendingUp size={10} /> Delivered Breakdown
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <div className="bg-cyan-50 px-2.5 py-2 rounded-lg border border-cyan-100 flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                            <span className="font-bold text-cyan-700 text-sm">{stats.sent}</span>
                            <span className="text-[9px] text-cyan-400 font-bold uppercase">Sent</span>
                          </div>
                          <div className="bg-cyan-50 px-2.5 py-2 rounded-lg border border-cyan-100 flex items-center gap-1.5">
                            <CheckCheck className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                            <span className="font-bold text-cyan-700 text-sm">{stats.delivered}</span>
                            <span className="text-[9px] text-cyan-400 font-bold uppercase">Dlvd</span>
                          </div>
                          <div className="bg-cyan-50 px-2.5 py-2 rounded-lg border border-cyan-100 flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                            <span className="font-bold text-cyan-700 text-sm">{stats.read}</span>
                            <span className="text-[9px] text-cyan-400 font-bold uppercase">Read</span>
                          </div>
                          <div className="bg-cyan-50 px-2.5 py-2 rounded-lg border border-cyan-100 flex items-center gap-1.5">
                            <MessageCircle className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                            <span className="font-bold text-cyan-700 text-sm">{stats.replied}</span>
                            <span className="text-[9px] text-cyan-400 font-bold uppercase">Reply</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-red-600 uppercase mb-1.5 flex items-center gap-1">
                          <TrendingDown size={10} /> Failed Breakdown
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <div className="bg-red-50 px-2.5 py-2 rounded-lg border border-red-100 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="font-bold text-red-700 text-sm">{stats.failed}</span>
                            <span className="text-[9px] text-red-400 font-bold uppercase">Fail</span>
                          </div>
                          <div className="bg-red-50 px-2.5 py-2 rounded-lg border border-red-100 flex items-center gap-1.5">
                            <MailX className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="font-bold text-red-700 text-sm">{stats.invalid}</span>
                            <span className="text-[9px] text-red-400 font-bold uppercase">Invld</span>
                          </div>
                          <div className="bg-red-50 px-2.5 py-2 rounded-lg border border-red-100 flex items-center gap-1.5">
                            <Hourglass className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="font-bold text-red-700 text-sm">{stats.pending}</span>
                            <span className="text-[9px] text-red-400 font-bold uppercase">Pend</span>
                          </div>
                          <div className="bg-red-50 px-2.5 py-2 rounded-lg border border-red-100 flex items-center gap-1.5">
                            <Copy className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="font-bold text-red-700 text-sm">{stats.duplicate}</span>
                            <span className="text-[9px] text-red-400 font-bold uppercase">Dupl</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ✅ FIX: Removed Audience Preview Block Entirely */}

              {viewCampaign.variables?.length > 0 && (
                <div>
                  <span className="text-slate-500 block mb-1">Variables:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {viewCampaign.variables.map((v: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono">
                        {v || `{{${i + 1}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <label className="text-xs font-bold text-slate-700 mb-2 block flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Quick Test Send
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex gap-2 flex-1">
                    {enabledCountries.length > 0 && (
                      <select
                        value={selectedCountryCode}
                        onChange={(e) => setSelectedCountryCode(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold whitespace-nowrap"
                      >
                        {enabledCountries.map((c, i) => (
                          <option key={i} value={c.code}>+{c.code}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="9876543210"
                      className="flex-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={() => quickTestSend(viewCampaign)}
                    disabled={!canSendMessage}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={12} /> Send Test
                  </button>
                </div>
                {!canSendMessage && (
                  <p className="text-[10px] text-red-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={10} /> Insufficient balance to send
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-4 sm:pb-6 gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                Campaigns
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">
                Manage and automate your WhatsApp broadcasts
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className={`flex items-center gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl border shadow-sm ${
                !canSendMessage ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"
              }`}>
                <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${!canSendMessage ? "text-red-500" : "text-emerald-500"}`} />
                <div>
                  <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${!canSendMessage ? "text-red-500" : "text-emerald-600"}`}>
                    Balance
                  </p>
                  <p className={`text-base sm:text-lg font-extrabold ${!canSendMessage ? "text-red-700" : "text-emerald-700"}`}>
                    {formatINR(balance)}
                  </p>
                </div>
              </div>
              <a
                href="/campaigns/create"
                className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 text-sm"
              >
                + New Campaign
              </a>
            </div>
          </div>

          {!canSendMessage && (
            <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Insufficient Balance</p>
                <p className="text-xs text-red-600 mt-0.5">
                  You cannot start campaigns. Please contact your administrator to recharge your account. Go to{" "}
                  <a href="/settings" className="underline font-medium">Settings</a> to check your balance.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search campaigns..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400 hidden sm:block" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="saved">Drafts</option>
                <option value="scheduled">Scheduled</option>
                <option value="running">Running</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {loadingCampaigns ? (
            <div className="flex justify-center items-center py-20 bg-white rounded-2xl border border-slate-200">
              <ScannerLoader />
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-20 sm:py-32 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-500">No campaigns found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentItems.map((c) => {
                const stats = getCampaignStats(c);

                const deliveredCount = stats.deliveredCombined;
                const failedCount = stats.failedCombined;
                const pendingCount = stats.pending;
                const totalCount = stats.total;
                const completedCount = Math.min(totalCount, deliveredCount + failedCount);
                const progressPercent = totalCount > 0
                  ? Math.round((completedCount / totalCount) * 100)
                  : 0;

                const displayStatus =
                  (pendingCount === 0 && totalCount > 0 && (c.status === "running" || c.status === "paused"))
                    ? "completed"
                    : (c.status || "saved");

                const cfg = statusConfig[displayStatus] || statusConfig.saved;
                const isCompleted = displayStatus === "completed" || displayStatus === "failed";

                const currentPrice = Number(c.currentPrice || c.pricePerMessage || 0);
                const amountSpent = Number(c.totalDeducted || 0);

                return (
                  <div
                    key={c._id}
                    className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate max-w-[200px] sm:max-w-none">
                            {c.name}
                          </h3>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.icon}
                            {displayStatus.toUpperCase()}
                            {displayStatus === "running" && <Radio size={10} className="animate-pulse ml-1" />}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            🌐 {c.languageCode || "en"}
                          </span>
                          {c.templateCategory && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCategoryColor(c.templateCategory)}`}>
                              📋 {c.templateCategory}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{c.templateName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Clock size={11} className="text-slate-400" />
                            <strong>Created:</strong> {formatFullDateTime(c.createdAt)}
                          </span>
                        </div>
                        {displayStatus === "scheduled" && timers[c._id] && (
                          <div className="mt-2 inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-100">
                            <Clock size={12} className="animate-pulse" />
                            Starts in: {timers[c._id]}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 sm:ml-4 w-full sm:w-auto justify-end flex-wrap">
                        <button
                          onClick={() => loadSingleCampaignStatus(c._id)}
                          disabled={refreshingId === c._id}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Load Latest Status"
                        >
                          {refreshingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </button>

                        <button
                          onClick={() => handleViewClick(c._id)}
                          disabled={viewLoadingId === c._id}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Details"
                        >
                          {viewLoadingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                        </button>
                        <button
                          onClick={() => router.push(`/campaigns/edit?id=${c._id}`)}
                          className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>

                        {displayStatus === "running" && (
                          <button
                            onClick={() => handleCampaignAction(c._id, "pause")}
                            disabled={actionId === c._id || startingId === c._id}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-blue-500 text-white hover:bg-blue-600 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            {actionId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Pause size={12} />}
                            Pause
                          </button>
                        )}

                        {displayStatus === "paused" && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCampaignAction(c._id, "resume")}
                              disabled={actionId === c._id}
                              className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-sm"
                            >
                              {actionId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              Resume
                            </button>
                            <button
                              onClick={() => handleCampaignAction(c._id, "stop")}
                              disabled={actionId === c._id}
                              className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-red-500 text-white hover:bg-red-600 transition-all shadow-sm"
                            >
                              {actionId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                              Stop
                            </button>
                          </div>
                        )}

                        {displayStatus === "saved" && (
                          <button
                            onClick={() => startCampaign(c._id)}
                            disabled={startingId === c._id || !canSendMessage}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                              !canSendMessage
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-emerald-500 text-white hover:bg-emerald-600 hover:scale-105"
                            }`}
                          >
                            {startingId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                            {startingId === c._id ? "Starting..." : !canSendMessage ? "No Balance" : "Start"}
                          </button>
                        )}

                        {displayStatus !== "running" && (
                          <button
                            onClick={() => deleteCampaign(c._id)}
                            disabled={deletingId === c._id}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            {deletingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                            <Users className="w-3.5 h-3.5 text-slate-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-extrabold text-slate-900 leading-none">{totalCount}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Total</p>
                          </div>
                        </div>
                        <div className="bg-cyan-50 px-3 py-2.5 rounded-lg border border-cyan-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-cyan-200 flex items-center justify-center shrink-0">
                            <CheckCheck className="w-3.5 h-3.5 text-cyan-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-extrabold text-cyan-700 leading-none">{deliveredCount}</p>
                            <p className="text-[9px] text-cyan-500 font-bold uppercase tracking-wider mt-0.5">Delivered</p>
                          </div>
                        </div>
                        <div className="bg-amber-50 px-3 py-2.5 rounded-lg border border-amber-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-amber-200 flex items-center justify-center shrink-0">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-extrabold text-amber-700 leading-none">{pendingCount}</p>
                            <p className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-0.5">Pending</p>
                          </div>
                        </div>
                        <div className="bg-red-50 px-3 py-2.5 rounded-lg border border-red-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-red-200 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-lg font-extrabold text-red-700 leading-none">{failedCount}</p>
                            <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider mt-0.5">Failed</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-100 flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Progress</p>
                          <p className="text-sm font-extrabold text-slate-700">{progressPercent}%</p>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, progressPercent)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {amountSpent > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <Wallet size={12} className="text-blue-500" />
                        <span className="text-slate-500">Amount deducted:</span>
                        <span className="font-bold text-blue-700">{formatINR(amountSpent)}</span>
                        {currentPrice > 0 && (
                          <span className="text-slate-400">(₹{currentPrice}/msg)</span>
                        )}
                      </div>
                    )}

                    {isCompleted && totalCount === 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <CheckCircle size={12} className="text-emerald-500" />
                        <span className="text-slate-500">Completed — 0 messages</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-8">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-bold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
