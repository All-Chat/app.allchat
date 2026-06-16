/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Play, Clock, CheckCircle, Loader2, XCircle, FileText, Trash2, Eye, X,
  Pencil, RotateCcw, Send, BarChart3, Zap, Users, CheckCheck, AlertTriangle,
  Search, Filter, Radio, Wallet, AlertCircle,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type ReportItem = { status: string; replies?: string[]; reply?: string | null };
type Campaign = {
  [x: string]: any;
  _id: string;
  name: string;
  templateName: string;
  templateCategory: string;
  variables: string[];
  phoneNumbers: string[];
  names?: string[];
  mediaUrl: string;
  mediaType: string;
  languageCode: string;
  status: "saved" | "scheduled" | "running" | "completed" | "failed";
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  totalDeducted: number;
  scheduledAt: string;
  createdAt: string;
  reportData?: ReportItem[];
};

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);

const getCampaignLiveStats = (reportData: ReportItem[] = []) => {
  let deliveredRead = 0, sent = 0, failedInvalid = 0, pending = 0;
  reportData.forEach(d => {
    const hasReply = (d.replies && d.replies.length > 0) || d.reply;
    if (hasReply || d.status === 'read' || d.status === 'delivered') deliveredRead++;
    else if (d.status === 'sent') sent++;
    else if (d.status === 'failed' || d.status === 'invalid') failedInvalid++;
    else pending++;
  });
  const total = reportData.length;
  const progress = total > 0 ? ((deliveredRead + sent) / total) * 100 : 0;
  return { deliveredRead, sent, failedInvalid, pending, total, progress };
};

export default function CampaignList() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewCampaign, setViewCampaign] = useState<Campaign | null>(null);
  const [quickPhone, setQuickPhone] = useState("");
  const [timers, setTimers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [balance, setBalance] = useState(0);
  const [canSendMessage, setCanSendMessage] = useState(true);

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) {
        setBalance(data.billing.balance || 0);
        setCanSendMessage(data.billing.canSendMessage !== false);
      }
    } catch (error) {
      console.error("Failed to fetch billing", error);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      loadCampaigns();
      fetchBilling();
      const interval = setInterval(loadCampaigns, 3000);
      return () => clearInterval(interval);
    } else if (status === "unauthenticated") { router.push("/signin"); }
  }, [status, router]);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      const newTimers: Record<string, string> = {};
      campaigns.forEach(c => {
        if (c.status === "scheduled" && c.scheduledAt) {
          const distance = new Date(c.scheduledAt).getTime() - Date.now();
          if (distance <= 0) newTimers[c._id] = "Starting...";
          else {
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

  const loadCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns/list");
      if (res.status === 401) { router.push("/signin"); return; }
      const data = await res.json();
      if (data.success) setCampaigns(data.campaigns);
    } catch (err) { console.error("Failed to load campaigns", err); }
  };

  const startCampaign = async (id: string) => {
    if (!canSendMessage) {
      toast.error("Insufficient balance. Please recharge your account.");
      return;
    }
    if (!confirm("Start this campaign now? Balance will be deducted for each successful delivery.")) return;
    setStartingId(id);
    try {
      const res = await fetch("/api/campaigns/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });

      if (res.status === 402) {
        const data402 = await res.json();
        toast.error(data402.message || "Insufficient balance. Please recharge your account.");
        setCanSendMessage(false);
        fetchBilling();
        setStartingId(null);
        return;
      }

      const data = await res.json();

      if (data.success) {
        const deductionNote = data.totalDeducted > 0 ? ` • Spent: ${formatINR(data.totalDeducted)}` : "";
        toast.success(`Campaign started! Sent: ${data.sent}${deductionNote}`);
        fetchBilling();
        loadCampaigns();
      } else {
        toast.error(data.message || "Failed to start campaign");
      }
    } catch (err) {
      console.error("Start campaign error:", err);
      toast.error("Failed to start campaign");
    } finally {
      setStartingId(null);
    }
  };

  const rerunCampaign = async (id: string) => {
    if (!canSendMessage) {
      toast.error("Insufficient balance. Please recharge your account.");
      return;
    }
    if (!confirm("Rerun this campaign? Balance will be deducted for each successful delivery.")) return;
    setStartingId(id);
    try {
      const campaign = campaigns.find(c => c._id === id);
      if (!campaign) return;

      const updateRes = await fetch("/api/campaigns/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...campaign,
          id: campaign._id,
          status: "saved",
          sentCount: 0,
          failedCount: 0,
          totalDeducted: 0,
        }),
      });

      if (!updateRes.ok) {
        toast.error("Failed to reset campaign for rerun");
        setStartingId(null);
        return;
      }

      const startRes = await fetch("/api/campaigns/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });

      if (startRes.status === 402) {
        const data402 = await startRes.json();
        toast.error(data402.message || "Insufficient balance. Please recharge your account.");
        setCanSendMessage(false);
        fetchBilling();
        loadCampaigns();
        return;
      }

      const data = await startRes.json();
      if (data.success) {
        const deductionNote = data.totalDeducted > 0 ? ` • Spent: ${formatINR(data.totalDeducted)}` : "";
        toast.success(`Rerun started! Sent: ${data.sent}${deductionNote}`);
        fetchBilling();
        loadCampaigns();
      } else {
        toast.error(data.message || "Failed to rerun campaign");
        loadCampaigns();
      }
    } catch (err) {
      console.error("Rerun error:", err);
      toast.error("Failed to rerun campaign");
      loadCampaigns();
    } finally {
      setStartingId(null);
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
      if ((await res.json()).success) {
        toast.success("Deleted");
        setCampaigns(prev => prev.filter(c => c._id !== id));
      }
    } catch (err) { toast.error("Failed"); } finally { setDeletingId(null); }
  };

  const quickTestSend = async (c: Campaign) => {
    if (!quickPhone) { toast.error("Enter a phone number"); return; }
    if (!canSendMessage) {
      toast.error("Insufficient balance. Please recharge your account.");
      return;
    }
    try {
      const payload: any = {
        phone: quickPhone.replace(/\D/g, ""),
        templateName: c.templateName,
        variables: c.variables || [],
        languageCode: c.languageCode || "en",
      };
      if (c.mediaUrl) { payload.mediaUrl = c.mediaUrl; payload.headerMediaType = c.mediaType; }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 402) {
        const data402 = await res.json();
        toast.error(data402.message || "Insufficient balance. Please recharge.");
        setCanSendMessage(false);
        fetchBilling();
        return;
      }

      const data = await res.json();
      if (data.success) {
        toast.success("Test sent!");
        fetchBilling();
      }
      else toast.error(data.message || data.error?.message || "Failed");
    } catch (err) { toast.error("Error"); }
  };

  const filteredCampaigns = campaigns
    .filter(c => statusFilter === "all" || c.status === statusFilter)
    .filter(c => {
      if (!searchTerm) return true;
      const lt = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(lt) || c.templateName.toLowerCase().includes(lt);
    });

  const statusConfig: any = {
    saved: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200", icon: <FileText size={12} /> },
    scheduled: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", icon: <Clock size={12} /> },
    running: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: <Loader2 size={12} className="animate-spin" /> },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: <CheckCircle size={12} /> },
    failed: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: <XCircle size={12} /> },
  };

  if (status === "loading") return (
    <div className="flex min-h-screen bg-slate-50 items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      {/* Sidebar Component - Renders Mobile Subnavbar & Desktop Sidebar */}
      <Sidebar />

      {/* View Campaign Modal */}
      {viewCampaign && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setViewCampaign(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 sm:p-6 text-white relative shrink-0">
              <button onClick={() => setViewCampaign(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={20} /></button>
              <h2 className="text-xl sm:text-2xl font-bold pr-8">{viewCampaign.name}</h2>
              <p className="text-sm text-white/80 mt-1">{viewCampaign.templateName} • {viewCampaign.templateCategory}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-lg text-xs font-bold">🌐 {viewCampaign.languageCode || "en"}</div>
            </div>
            
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-slate-50 p-2 sm:p-3 rounded-xl text-center border border-slate-100">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-blue-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold">{viewCampaign.totalMessages}</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 font-medium">Total</p>
                </div>
                <div className="bg-emerald-50 p-2 sm:p-3 rounded-xl text-center border border-emerald-100">
                  <CheckCheck className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-emerald-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-emerald-600">{getCampaignLiveStats(viewCampaign.reportData).deliveredRead}</p>
                  <p className="text-[9px] sm:text-[10px] text-emerald-600 font-medium">Delivered</p>
                </div>
                <div className="bg-red-50 p-2 sm:p-3 rounded-xl text-center border border-red-100">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 mx-auto text-red-500 mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-red-600">{getCampaignLiveStats(viewCampaign.reportData).failedInvalid}</p>
                  <p className="text-[9px] sm:text-[10px] text-red-600 font-medium">Failed</p>
                </div>
              </div>

              <div className="space-y-3 text-sm border-t border-slate-100 pt-4">
                {viewCampaign.scheduledAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scheduled:</span>
                    <span className="font-medium text-right">{new Date(viewCampaign.scheduledAt).toLocaleString()}</span>
                  </div>
                )}
                {viewCampaign.variables?.length > 0 && (
                  <div>
                    <span className="text-slate-500 block mb-1">Variables:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {viewCampaign.variables.map((v: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono">{v || `{{${i + 1}}}`}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block mb-1">Audience Preview:</span>
                  <div className="bg-slate-50 p-2 rounded-lg text-xs font-mono max-h-20 overflow-y-auto border border-slate-100">
                    {viewCampaign.phoneNumbers.slice(0, 15).map((p: string, i: number) => (
                      <span key={i} className="inline-block mr-2 mb-1 bg-white px-1.5 py-0.5 rounded border border-slate-200">{p}</span>
                    ))}
                    {viewCampaign.phoneNumbers.length > 15 && <span className="text-slate-400">+{viewCampaign.phoneNumbers.length - 15} more</span>}
                  </div>
                </div>
              </div>
              
              <div className="border-t border-slate-100 pt-4">
                <label className="text-xs font-bold text-slate-700 mb-2 block flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" /> Quick Test Send
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    placeholder="919876543210"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
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

      {/* Main Content Area */}
      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-4 sm:pb-6 gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Campaigns</h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">Manage and automate your WhatsApp broadcasts</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className={`flex items-center gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl border shadow-sm ${
                !canSendMessage ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"
              }`}>
                <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${!canSendMessage ? "text-red-500" : "text-emerald-500"}`} />
                <div>
                  <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${!canSendMessage ? "text-red-500" : "text-emerald-600"}`}>Balance</p>
                  <p className={`text-base sm:text-lg font-extrabold ${!canSendMessage ? "text-red-700" : "text-emerald-700"}`}>{formatINR(balance)}</p>
                </div>
              </div>
              <a href="/campaigns/create" className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 text-sm">
                + New Campaign
              </a>
            </div>
          </div>

          {/* Insufficient Balance Warning */}
          {!canSendMessage && (
            <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Insufficient Balance</p>
                <p className="text-xs text-red-600 mt-0.5">
                  You cannot start or rerun campaigns. Please contact your administrator to recharge your account.
                  Go to <a href="/settings" className="underline font-medium">Settings</a> to check your balance.
                </p>
              </div>
            </div>
          )}

          {/* Search & Filter */}
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
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Campaign List */}
          {filteredCampaigns.length === 0 ? (
            <div className="text-center py-20 sm:py-32 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-500">No campaigns found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCampaigns.map((c) => {
                const cfg = statusConfig[c.status] || statusConfig.saved;
                const liveStats = getCampaignLiveStats(c.reportData);
                const isCompleted = c.status === "completed" || c.status === "failed";
                const amountSpent = c.totalDeducted || 0;

                return (
                  <div key={c._id} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                    {/* Top Row */}
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate max-w-[200px] sm:max-w-none">{c.name}</h3>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.icon} {c.status.toUpperCase()}
                            {c.status === "running" && <Radio size={10} className="animate-pulse ml-1" />}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            🌐 {c.languageCode || "en"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {c.templateName} • Created {new Date(c.createdAt).toLocaleDateString()}
                        </p>
                        {c.status === "scheduled" && timers[c._id] && (
                          <div className="mt-2 inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-100">
                            <Clock size={12} className="animate-pulse" /> Starts in: {timers[c._id]}
                          </div>
                        )}
                      </div>
                      
                      {/* Action Buttons - Visible on mobile, hover-reveal on desktop */}
                      <div className="flex items-center gap-1.5 sm:ml-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity w-full sm:w-auto justify-end">
                        <button onClick={() => setViewCampaign(c)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Details">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => router.push(`/campaigns/edit?id=${c._id}`)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Edit">
                          <Pencil size={16} />
                        </button>
                        {isCompleted && (
                          <button
                            onClick={() => rerunCampaign(c._id)}
                            disabled={startingId === c._id || !canSendMessage}
                            className={`p-2 rounded-lg transition-colors ${
                              !canSendMessage ? "text-slate-300 cursor-not-allowed" : "text-slate-400 hover:text-purple-600 hover:bg-purple-50"
                            }`}
                            title={!canSendMessage ? "Insufficient balance" : "Rerun"}
                          >
                            {startingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                          </button>
                        )}
                        {c.status === "saved" && (
                          <button
                            onClick={() => startCampaign(c._id)}
                            disabled={startingId === c._id || !canSendMessage}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all ${
                              !canSendMessage ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-emerald-500 text-white hover:bg-emerald-600 hover:scale-105"
                            }`}
                          >
                            {startingId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                            {!canSendMessage ? "No Balance" : "Start"}
                          </button>
                        )}
                        {c.status !== "running" && (
                          <button onClick={() => deleteCampaign(c._id)} disabled={deletingId === c._id} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            {deletingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className={`grid gap-2 sm:gap-3 text-center grid-cols-2 sm:grid-cols-3 md:grid-cols-5 ${
                      isCompleted && amountSpent > 0 ? 'lg:grid-cols-6' : ''
                    }`}>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total</p>
                        <p className="font-bold text-slate-900 text-sm mt-0.5">{liveStats.total || c.totalMessages}</p>
                      </div>
                      <div className="bg-cyan-50 p-2 rounded-xl border border-cyan-100">
                        <p className="text-[9px] text-cyan-600 font-bold uppercase tracking-wider">Delivered</p>
                        <p className="font-bold text-cyan-700 text-sm mt-0.5">{liveStats.deliveredRead}</p>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                        <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Sent</p>
                        <p className="font-bold text-emerald-700 text-sm mt-0.5">{liveStats.sent}</p>
                      </div>
                      <div className="bg-orange-50 p-2 rounded-xl border border-orange-100">
                        <p className="text-[9px] text-orange-600 font-bold uppercase tracking-wider">Invalid</p>
                        <p className="font-bold text-orange-700 text-sm mt-0.5">{liveStats.failedInvalid}</p>
                      </div>

                      {isCompleted && amountSpent > 0 && (
                        <div className="bg-blue-50 p-2 rounded-xl border border-blue-100 col-span-2 sm:col-span-1">
                          <p className="text-[9px] text-blue-600 font-bold uppercase tracking-wider flex items-center justify-center gap-0.5">
                            <Wallet size={8} /> Spent
                          </p>
                          <p className="font-bold text-blue-700 text-sm mt-0.5">{formatINR(amountSpent)}</p>
                        </div>
                      )}

                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center col-span-2 sm:col-span-1">
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Progress</p>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${liveStats.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {c.status === "running" && (
                      <div className="mt-3 w-full bg-slate-100 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-amber-500 h-2 rounded-full animate-pulse"
                          style={{ width: `${liveStats.progress || 10}%` }}
                        ></div>
                      </div>
                    )}

                    {isCompleted && amountSpent > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <Wallet size={12} className="text-blue-500" />
                        <span className="text-slate-500">Amount spent:</span>
                        <span className="font-bold text-blue-700">{formatINR(amountSpent)}</span>
                        <span className="text-slate-400">({c.sentCount} delivered)</span>
                      </div>
                    )}

                    {c.status === "completed" && amountSpent === 0 && c.sentCount > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <CheckCircle size={12} className="text-emerald-500" />
                        <span className="text-slate-500">Completed — {c.sentCount} messages delivered</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}