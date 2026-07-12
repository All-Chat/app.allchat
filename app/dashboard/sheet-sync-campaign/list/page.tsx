/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  Play, Square, Clock, CheckCircle, Loader2, XCircle, FileText, Trash2, Eye, X,
  BarChart3, Wallet, AlertCircle, Search, Filter, Radio, PlusCircle
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amount);

const getCategoryColor = (category: string) => {
  switch (category?.toUpperCase()) {
    case "MARKETING": return "bg-orange-50 text-orange-700 border-orange-200";
    case "UTILITY": return "bg-blue-50 text-blue-700 border-blue-200";
    case "AUTHENTICATION": return "bg-purple-50 text-purple-700 border-purple-200";
    default: return "bg-gray-50 text-gray-700 border-gray-200";
  }
};

export default function SheetCampaignList() {
  const router = useRouter();
  const { status } = useSession();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewCampaign, setViewCampaign] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [balance, setBalance] = useState(0);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) {
        setBalance(data.billing.balance || 0);
        setCanSendMessage(data.billing.canSendMessage !== false);
      }
    } catch (error) { console.error("Failed to fetch billing", error); }
  };

  const loadCampaigns = async () => {
    try {
      const res = await fetch("/api/sheet-campaigns/list");
      if (res.status === 401) { router.push("/"); return; }
      const data = await res.json();
      if (data.success) setCampaigns(data.campaigns);
    } catch (err) { console.error("Failed to load campaigns", err); }
  };

  useEffect(() => {
    if (status === "authenticated") {
      loadCampaigns();
      fetchBilling();
      const interval = setInterval(loadCampaigns, 5000); 
      return () => clearInterval(interval);
    } else if (status === "unauthenticated") { router.push("/"); }
  }, [status, router]);

  const handleCampaignAction = async (id: string, action: "start" | "stop") => {
    setActionId(id);
    try {
      const res = await fetch("/api/sheet-campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        loadCampaigns();
      } else {
        toast.error(data.error || "Failed");
      }
    } catch (err) {
      toast.error("Error");
    } finally {
      setActionId(null);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/sheet-campaigns/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, action: "delete" }),
      });
      if ((await res.json()).success) {
        toast.success("Deleted");
        setCampaigns(prev => prev.filter(c => c._id !== id));
      }
    } catch (err) { toast.error("Failed"); } finally { setDeletingId(null); }
  };

  const filteredCampaigns = campaigns
    .filter(c => statusFilter === "all" || c.status === statusFilter)
    .filter(c => {
      if (!searchTerm) return true;
      const lt = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(lt) || c.templateName.toLowerCase().includes(lt);
    });

  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredCampaigns.slice(indexOfFirstItem, indexOfLastItem);

  const statusConfig: any = {
    saved: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200", icon: <FileText size={12} /> },
    scheduled: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", icon: <Clock size={12} /> },
    running: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: <Loader2 size={12} className="animate-spin" /> },
    stopped: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: <Square size={12} /> },
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
      <Sidebar />

      {viewCampaign && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setViewCampaign(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 sm:p-6 text-white relative shrink-0">
              <button onClick={() => setViewCampaign(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={20} /></button>
              <h2 className="text-xl sm:text-2xl font-bold pr-8">{viewCampaign.name}</h2>
              <p className="text-sm text-white/80 mt-1">{viewCampaign.templateName} • {viewCampaign.templateCategory}</p>
              <div className="mt-2 flex gap-2">
                <div className="inline-flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-lg text-xs font-bold">🌐 {viewCampaign.languageCode || "en"}</div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${getCategoryColor(viewCampaign.templateCategory)}`}>📋 {viewCampaign.templateCategory || "MARKETING"}</div>
              </div>
            </div>
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-slate-50 p-2 sm:p-3 rounded-xl text-center border border-slate-100">
                  <p className="text-lg sm:text-xl font-bold">{viewCampaign.totalMessages}</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 font-medium">Total</p>
                </div>
                <div className="bg-emerald-50 p-2 sm:p-3 rounded-xl text-center border border-emerald-100">
                  <p className="text-lg sm:text-xl font-bold text-emerald-600">{viewCampaign.sentCount}</p>
                  <p className="text-[9px] sm:text-[10px] text-emerald-600 font-medium">Sent</p>
                </div>
                <div className="bg-red-50 p-2 sm:p-3 rounded-xl text-center border border-red-100">
                  <p className="text-lg sm:text-xl font-bold text-red-600">{viewCampaign.failedCount}</p>
                  <p className="text-[9px] sm:text-[10px] text-red-600 font-medium">Failed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-4 sm:pb-6 gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Sheet Campaigns</h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">Manage campaigns created from Google Sheets</p>
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
              <a href="/dashboard/sheet-sync-campaign" className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 text-sm">
                <PlusCircle size={16} /> New Campaign
              </a>
            </div>
          </div>

          {!canSendMessage && (
            <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Insufficient Balance</p>
                <p className="text-xs text-red-600 mt-0.5">
                  You cannot start campaigns. Please contact your administrator to recharge your account.
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
                <option value="stopped">Stopped</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="text-center py-20 sm:py-32 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-500">No campaigns found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentItems.map((c) => {
                const cfg = statusConfig[c.status] || statusConfig.saved;
                const amountSpent = c.totalDeducted || 0;
                const progress = c.totalMessages > 0 ? ((c.sentCount + c.failedCount) / c.totalMessages) * 100 : 0;

                return (
                  <div key={c._id} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate max-w-[200px] sm:max-w-none">{c.name}</h3>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.icon} {c.status.toUpperCase()}
                            {c.status === "running" && <Radio size={10} className="animate-pulse ml-1" />}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">🌐 {c.languageCode || "en"}</span>
                          {c.templateCategory && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCategoryColor(c.templateCategory)}`}>📋 {c.templateCategory}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{c.templateName} • Created {new Date(c.createdAt).toLocaleDateString()}</p>
                      </div>
                      
                      <div className="flex items-center gap-1.5 sm:ml-4 w-full sm:w-auto justify-end flex-wrap">
                        <button onClick={() => setViewCampaign(c)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Details"><Eye size={16} /></button>

                        {/* ✅ VIEW REPORT BUTTON ADDED HERE */}
                        <Link 
                          href={`/dashboard/sheet-sync-reports?id=${c._id}`} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" 
                          title="View Report"
                        >
                          <BarChart3 size={16} />
                        </Link>

                        {/* START / STOP BUTTONS */}
                        {c.status === "running" ? (
                          <button 
                            onClick={() => handleCampaignAction(c._id, "stop")} 
                            disabled={actionId === c._id} 
                            className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-red-500 text-white hover:bg-red-600 transition-all shadow-sm"
                          >
                            {actionId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />} Stop
                          </button>
                        ) : (
                          c.status !== "completed" && (
                            <button 
                              onClick={() => handleCampaignAction(c._id, "start")} 
                              disabled={actionId === c._id || !canSendMessage} 
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all ${!canSendMessage ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-emerald-500 text-white hover:bg-emerald-600 hover:scale-105"}`}
                            >
                              {actionId === c._id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              {!canSendMessage ? "No Balance" : "Start"}
                            </button>
                          )
                        )}
                        
                        {c.status !== "running" && (
                          <button onClick={() => deleteCampaign(c._id)} disabled={deletingId === c._id} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            {deletingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className={`grid gap-2 sm:gap-3 text-center grid-cols-2 sm:grid-cols-3 md:grid-cols-5 ${amountSpent > 0 ? 'lg:grid-cols-6' : ''}`}>
                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total</p>
                        <p className="font-bold text-slate-900 text-sm mt-0.5">{c.totalMessages}</p>
                      </div>
                      <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                        <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Sent</p>
                        <p className="font-bold text-emerald-700 text-sm mt-0.5">{c.sentCount}</p>
                      </div>
                      <div className="bg-orange-50 p-2 rounded-xl border border-orange-100">
                        <p className="text-[9px] text-orange-600 font-bold uppercase tracking-wider">Invalid</p>
                        <p className="font-bold text-orange-700 text-sm mt-0.5">{c.failedCount}</p>
                      </div>

                      {amountSpent > 0 && (
                        <div className="bg-blue-50 p-2 rounded-xl border border-blue-100 col-span-2 sm:col-span-1">
                          <p className="text-[9px] text-blue-600 font-bold uppercase tracking-wider flex items-center justify-center gap-0.5"><Wallet size={8} /> Spent</p>
                          <p className="font-bold text-blue-700 text-sm mt-0.5">{formatINR(amountSpent)}</p>
                        </div>
                      )}

                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center col-span-2 sm:col-span-1">
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Progress</p>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-8">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-bold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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
