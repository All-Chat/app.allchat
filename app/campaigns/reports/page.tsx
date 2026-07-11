/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import { 
  BarChart3, Download, Loader2, Search, CheckCircle, XCircle, Clock, 
  MessageSquare, Eye, CheckCheck, AlertTriangle, Copy, Ban, Radio, ArrowLeft, X, 
  Tag as TagIcon, Users, PieChart, Database, Filter, FilterX, ChevronLeft, ChevronRight, ExternalLink
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import { useSession } from "next-auth/react";

type ReportItem = { 
  name: string; 
  phone: string; 
  status: string; 
  error?: string;
  replies?: string[];
  reply?: string | null; 
  repliedAt?: string | null;
  tags?: string[];
  additionalData?: string[];
};

type LiveStats = {
  total: number;
  replied: number;
  read: number;
  delivered: number;
  sent: number;
  failed: number;
  invalid: number;
  duplicate: number;
  pending: number;
};

type Campaign = {
  _id: string;
  name: string;
  reportData?: ReportItem[];
  status: string;
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  templateName?: string;
  createdAt?: string;
  additionalFields?: string[];
  liveStats?: LiveStats;
  [x: string]: any;
};

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

export default function ReportsPage() {
  const { data: session, status } = useSession();
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [campaignStats, setCampaignStats] = useState<any>({});
  const [syncingSheet, setSyncingSheet] = useState(false);
  
  const [showOnly, setShowOnly] = useState<string[]>([]);
  const [filterOut, setFilterOut] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [repliesMap, setRepliesMap] = useState<Record<string, string[]>>({});
  const [whatsappNumbers, setWhatsappNumbers] = useState<any[]>([]);
  const [showCampaignList, setShowCampaignList] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [tags, setTags] = useState<any[]>([]);
  const [tagFilter, setTagFilter] = useState("all");

  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [reportTotalPages, setReportTotalPages] = useState(1);

  const fetchReportController = useRef<AbortController | null>(null);

  const getRepliesList = (d: ReportItem): string[] => {
    if (d.phone) {
      if (repliesMap[d.phone]?.length > 0) return repliesMap[d.phone];
      const p10 = normalizePhone(d.phone).slice(-10);
      if (p10.length >= 7) {
        for (const key in repliesMap) {
          if (normalizePhone(key).slice(-10) === p10 && repliesMap[key].length > 0) {
            return repliesMap[key];
          }
        }
      }
    }
    if (d.replies && d.replies.length > 0) return d.replies;
    if (d.reply) return [d.reply];
    return [];
  };

  const getCampaignStats = (c: Campaign): LiveStats => {
    if (c.liveStats) return c.liveStats;
    return {
      total: c.totalMessages || 0,
      replied: 0, read: 0, delivered: 0, 
      sent: c.sentCount || 0, 
      failed: c.failedCount || 0, 
      invalid: 0, duplicate: 0,
      pending: c.totalMessages - ((c.sentCount || 0) + (c.failedCount || 0))
    };
  };

  const getStatusConfig = (status: string, replies: string[], error?: string) => {
    if (replies.length > 0) {
      return { color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <MessageSquare size={10} className="inline mr-1" />, label: `Replied (${replies.length})`, isWaiting: false, tooltip: "" };
    }
    switch (status) {
      case "read": return { color: "bg-blue-50 text-blue-700 border-blue-200", icon: <Eye size={10} className="inline mr-1" />, label: "Read", isWaiting: false, tooltip: "" };
      case "delivered": return { color: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: <CheckCheck size={10} className="inline mr-1" />, label: "Delivered", isWaiting: false, tooltip: "" };
      case "sent": return { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle size={10} className="inline mr-1" />, label: "Sent", isWaiting: true, tooltip: "Message sent to Meta servers, waiting for delivery confirmation." };
      case "failed": return { color: "bg-red-50 text-red-700 border-red-200", icon: <XCircle size={10} className="inline mr-1" />, label: "Failed", isWaiting: false, tooltip: error || "Unknown error" };
      case "invalid": return { color: "bg-orange-50 text-orange-700 border-orange-200", icon: <AlertTriangle size={10} className="inline mr-1" />, label: "Invalid Number", isWaiting: false, tooltip: "This phone number is not registered on WhatsApp." };
      case "duplicate": return { color: "bg-slate-100 text-slate-500 border-slate-200", icon: <Copy size={10} className="inline mr-1" />, label: "Duplicate", isWaiting: false, tooltip: "" };
      case "pending": case "queued": case "": return { color: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock size={10} className="inline mr-1" />, label: "Pending", isWaiting: true, tooltip: "Message is in queue to be sent." };
      default: return { color: "bg-gray-50 text-gray-700 border-gray-200", icon: <Ban size={10} className="inline mr-1" />, label: status ? (status.charAt(0).toUpperCase() + status.slice(1)) : "Unknown", isWaiting: false, tooltip: "" };
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchCampaigns();
      fetchTags();
      fetchWhatsappNumbers();
    } else if (status === "unauthenticated") {
      window.location.href = "/";
    }
  }, [status]);

  useEffect(() => {
    if (!selectedId) return;
    fetchReportData(selectedId, 1);
    fetchReplies(selectedId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { 
    if (selectedId) {
      fetchReportData(selectedId, 1);
    }
  }, [selectedId, showOnly, filterOut, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns/counts");
      if (res.status === 401) { window.location.href = "/"; return; }
      const data = await res.json();
      if (data.success) {
        // ✅ CRITICAL FIX: Ensure campaigns is an array before filtering
        const allCampaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
        const validCampaigns = allCampaigns.filter((c: Campaign) => c.status !== "saved" && c.status !== "scheduled");
        setCampaigns(validCampaigns);
        if (!selectedId && validCampaigns.length > 0) setSelectedId(validCampaigns[validCampaigns.length - 1]._id || null);
      }
    } catch (error) { 
      console.error("Failed to fetch campaigns", error); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchReplies = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/report-replies?campaignId=${id}`);
      const data = await res.json();
      if (data.success) setRepliesMap(data.replies || {});
    } catch (err) { 
      console.error("Failed to fetch replies", err); 
    }
  };

  const fetchWhatsappNumbers = async () => {
    try {
      const res = await fetch("/api/user/whatsapp-numbers");
      if (!res.ok) return;
      const data = await res.json();
      let numbers = [];
      if (data.success && Array.isArray(data.numbers)) numbers = data.numbers;
      else if (Array.isArray(data)) numbers = data;
      else if (data.user?.whatsappNumbers) numbers = data.user.whatsappNumbers;
      else if (Array.isArray(data.whatsappNumbers)) numbers = data.whatsappNumbers;
      if (numbers.length > 0) setWhatsappNumbers(numbers);
    } catch (err) { 
      console.error("Failed to fetch WhatsApp numbers", err); 
    }
  };

  const getCampaignSenderName = (c: Campaign | undefined) => {
    if (!c) return "Unknown";
    if (c.whatsappNumberId) { 
      const match = whatsappNumbers.find(n => n.whatsappPhoneNumberId === c.whatsappNumberId); 
      if (match?.name) return match.name; 
    }
    if (c.senderPhone) { 
      const match = whatsappNumbers.find(n => (n.phoneNumber && n.phoneNumber.includes(c.senderPhone)) || (n.displayPhoneNumber && n.displayPhoneNumber.includes(c.senderPhone))); 
      if (match?.name) return match.name; 
    }
    if (whatsappNumbers.length > 0 && whatsappNumbers[0]?.name) return whatsappNumbers[0].name;
    return "Unknown Sender";
  };

  const fetchTags = async () => {
    try { 
      const res = await fetch("/api/tags"); 
      const data = await res.json(); 
      if (data.tags) setTags(data.tags); 
    } catch (err) { 
      console.error("Failed to fetch tags", err); 
    }
  };

  const fetchReportData = async (id: string, page: number = 1) => {
    if (fetchReportController.current) {
      fetchReportController.current.abort();
    }
    const controller = new AbortController();
    fetchReportController.current = controller;
    
    setLoadingReport(true);
    setReportCurrentPage(page);
    setReportData([]);
    
    try {
      const params = new URLSearchParams();
      params.set('id', id);
      params.set('page', page.toString());
      if (showOnly.length > 0) params.set('showOnly', showOnly.join(','));
      if (filterOut.length > 0) params.set('filterOut', filterOut.join(','));
      if (search) params.set('search', search);
      
      const res = await fetch(`/api/campaigns/list?${params.toString()}`, { signal: controller.signal });
      const data = await res.json();
      
      // ✅ CRITICAL FIX: Safely check if campaigns array exists and has items
      if (data.success && Array.isArray(data.campaigns) && data.campaigns[0]) {
        setReportData(data.campaigns[0].reportData || []);
        setReportTotalPages(data.totalPages || 1);
        setCampaignStats(data.campaignStats || {});
      } else {
        // Fallback to empty if API fails or returns unexpected shape
        setReportData([]);
        setReportTotalPages(1);
      }
    } catch (error: any) { 
      if (error.name === 'AbortError') return;
      console.error("Failed to fetch report data", error); 
      setReportData([]); // Prevent crash on fetch failure
    } finally { 
      setLoadingReport(false); 
    }
  };

  const toggleArrayValue = (arr: string[], value: string, setter: (v: string[]) => void) => {
    if (arr.includes(value)) setter(arr.filter(v => v !== value));
    else setter([...arr, value]);
  };

  const modalFilteredData = reportData.filter(d => {
    if (tagFilter === "all") return true;
    if (tagFilter === "untagged") return !d.tags || d.tags.length === 0;
    return d.tags?.includes(tagFilter);
  });

  const downloadExcel = () => {
    if (reportData.length === 0) { toast.error("No data to download"); return; }
    const additionalCols = selectedCamp?.additionalFields || [];
    const wsData = reportData.map(d => {
      const replies = getRepliesList(d).slice(0, 5);
      const statusConfig = getStatusConfig(d.status, replies, d.error);
      const row: any = { "Name": d.name || "N/A", "Phone Number": d.phone };
      additionalCols.forEach((field, idx) => { row[field] = d.additionalData?.[idx] || ""; });
      row["Status"] = statusConfig.label; 
      row["Error Reason"] = d.error || ""; 
      row["Tags"] = d.tags?.join(", ") || "None";
      row["Reply 1"] = replies[0] || ""; 
      row["Reply 2"] = replies[1] || ""; 
      row["Reply 3"] = replies[2] || ""; 
      row["Reply 4"] = replies[3] || ""; 
      row["Reply 5"] = replies[4] || "";
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const campName = campaigns.find(c => c._id === selectedId)?.name || "Campaign";
    XLSX.writeFile(wb, `${campName}_Report.xlsx`);
  };

  const handleSyncSheet = async (id: string) => {
    setSyncingSheet(true);
    try {
      const res = await fetch("/api/campaigns/sync-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id })
      });
      const data = await res.json();
      if (data.success && data.url) {
        toast.success("Google Sheet generated successfully!");
        window.open(data.url, "_blank");
      } else {
        toast.error(data.message || "Failed to sync Google Sheet");
      }
    } catch (err) {
      toast.error("Error syncing sheet");
    } finally {
      setSyncingSheet(false);
    }
  };

  const selectedCamp = campaigns.find(c => c._id === selectedId);
  const additionalFieldsCount = selectedCamp?.additionalFields?.length || 0;

  const handleSelectCampaign = (id: string) => { 
    setSelectedId(id); 
    setShowCampaignList(false); 
  };

  const totalMessages = campaignStats.total || 0;
  const repliedCount = campaignStats.replied || 0;
  const readCount = campaignStats.read || 0;
  const deliveredCount = campaignStats.delivered || 0;
  const sentOnlyCount = campaignStats.sent || 0;
  const pendingCount = campaignStats.pending || 0;
  const failedCount = campaignStats.failed || 0;
  const invalidCount = campaignStats.invalid || 0;
  const duplicateCount = campaignStats.duplicate || 0;
  
  const getPercentage = (count: number) => totalMessages > 0 ? ((count / totalMessages) * 100).toFixed(1) : "0.0";

  const briefStats = [
    { label: "Replied", count: repliedCount, color: "bg-indigo-500", icon: <MessageSquare size={14} className="text-indigo-600" /> },
    { label: "Read", count: readCount, color: "bg-blue-500", icon: <Eye size={14} className="text-blue-600" /> },
    { label: "Delivered", count: deliveredCount, color: "bg-cyan-500", icon: <CheckCheck size={14} className="text-cyan-600" /> },
    { label: "Sent", count: sentOnlyCount, color: "bg-emerald-500", icon: <CheckCircle size={14} className="text-emerald-600" /> },
    { label: "Pending", count: pendingCount, color: "bg-amber-500", icon: <Clock size={14} className="text-amber-600" /> },
    { label: "Failed", count: failedCount, color: "bg-red-500", icon: <XCircle size={14} className="text-red-600" /> },
    { label: "Invalid", count: invalidCount, color: "bg-orange-500", icon: <AlertTriangle size={14} className="text-orange-600" /> },
    { label: "Duplicate", count: duplicateCount, color: "bg-slate-400", icon: <Copy size={14} className="text-slate-500" /> },
  ];

  const availableStatuses = ["replied", "read", "delivered", "sent", "pending", "failed", "invalid", "duplicate"];

  const renderFilterPills = (arr: string[], setter: (v: string[]) => void, icon: React.ReactNode, colorClass: string) => (
    <div className="flex flex-wrap gap-2">
      {availableStatuses.map(status => (
        <button 
          key={status} 
          onClick={() => toggleArrayValue(arr, status, setter)} 
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 capitalize ${
            arr.includes(status) ? `${colorClass}` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {icon} {status}
        </button>
      ))}
    </div>
  );

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />

      {isBriefOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setIsBriefOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-5 text-slate-800 relative shrink-0 border-b border-indigo-100">
              <button onClick={() => setIsBriefOpen(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1.5 hover:bg-white/60 rounded-lg transition-colors">
                <X size={18} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100">
                  <PieChart className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Brief Campaign Report</h2>
                  <p className="text-xs sm:text-sm text-indigo-700/80">{selectedCamp?.name}</p>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 overflow-hidden flex-1">
              <div className="flex flex-col gap-4 overflow-hidden">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Out of <span className="font-bold text-slate-900">{totalMessages}</span> contacts, 
                    <span className="font-bold text-indigo-600"> {getPercentage(repliedCount)}%</span> ({repliedCount}) replied. 
                    <span className="font-bold text-blue-600"> {getPercentage(readCount + repliedCount)}%</span> read, 
                    and <span className="font-bold text-red-500"> {getPercentage(failedCount + invalidCount)}%</span> failed/invalid.
                  </p>
                </div>
                <div className="flex-1 overflow-hidden flex flex-col">
                  <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 shrink-0">Breakdown (%)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 overflow-hidden">
                    {briefStats.map((stat) => (
                      <div key={stat.label} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">{stat.icon} {stat.label}</span>
                          <span className="text-[11px] font-bold text-slate-500">{getPercentage(stat.count)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className={`${stat.color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${getPercentage(stat.count)}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 overflow-hidden border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-6 pt-4 lg:pt-0">
                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 shrink-0">Exact Numbers</h3>
                <div className="grid grid-cols-2 gap-2 flex-1 overflow-hidden">
                  {briefStats.map((stat) => (
                    <div key={stat.label} className="flex flex-col justify-center p-2.5 bg-slate-50 rounded-lg border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 mb-0.5">
                        {stat.icon} {stat.label}
                      </span>
                      <span className="text-lg font-extrabold text-slate-900">{stat.count}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900 rounded-xl shadow-md mt-1 shrink-0">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Database size={14} /> Total Processed
                  </span>
                  <span className="text-base font-extrabold text-white">{totalMessages}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="md:ml-64 flex h-screen overflow-hidden">
        
        <div className={`w-full md:w-80 bg-white md:border-r border-slate-200 flex flex-col shadow-sm flex-shrink-0 ${
          showCampaignList ? "flex" : "hidden md:flex"
        }`}>
          <div className="md:hidden h-14 bg-[#f0f2f5] flex items-center px-4 border-b border-slate-200 flex-shrink-0">
            <span className="font-bold text-gray-800 text-lg tracking-tight flex-1">Reports</span>
          </div>
          <div className="hidden md:block p-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 size={16} /> Campaign Reports
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {campaigns.length === 0 ? (
              <p className="p-4 text-sm text-slate-400 text-center">No completed campaigns yet</p>
            ) : (
              campaigns.map(c => {
                const stats = getCampaignStats(c);
                return (
                  <button 
                    key={c._id} 
                    onClick={() => handleSelectCampaign(c._id)} 
                    className={`w-full text-left p-4 border-b border-slate-50 transition-colors ${
                      selectedId === c._id ? "bg-emerald-50 border-l-4 border-l-emerald-500" : "hover:bg-slate-50 border-l-4 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm truncate flex-1">{c.name}</p>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
                        c.status === 'running' ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'paused' ? 'bg-blue-100 text-blue-700' :
                        c.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                      {stats.replied > 0 && <span className="flex items-center gap-1 text-indigo-600 font-medium"><MessageSquare size={10}/> {stats.replied} Total</span>}
                      {stats.read > 0 && <span className="flex items-center gap-1 text-blue-600 font-medium"><Eye size={10}/> {stats.read} Read</span>}
                      {stats.delivered > 0 && <span className="flex items-center gap-1 text-cyan-600 font-medium"><CheckCheck size={10}/> {stats.delivered} Delivered</span>}
                      {stats.sent > 0 && <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle size={10}/> {stats.sent} Sent</span>}
                      {stats.pending > 0 && <span className="flex items-center gap-1 text-amber-600 font-medium"><Clock size={10}/> {stats.pending} Pending</span>}
                      {stats.failed > 0 && <span className="flex items-center gap-1 text-red-600 font-medium"><XCircle size={10}/> {stats.failed} Failed</span>}
                      {stats.invalid > 0 && <span className="flex items-center gap-1 text-orange-600 font-medium"><AlertTriangle size={10}/> {stats.invalid} Invalid</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-slate-50 overflow-hidden ${
          !showCampaignList ? "flex" : "hidden md:flex"
        }`}>
          
          {!selectedCamp ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 p-4">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Select a campaign to view report</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white p-3 sm:p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-end shadow-sm gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => setShowCampaignList(true)} 
                    className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors mr-1 flex-shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold truncate">{selectedCamp.name}</h2>
                      {selectedCamp.status === "running" && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0">
                          <Radio size={10} className="animate-pulse" /> LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      Template: {selectedCamp.templateName} • Auto-updates
                    </p>
                    <p className="text-[11px] text-emerald-600 font-medium truncate mt-0.5">
                      Sent by: {getCampaignSenderName(selectedCamp)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                    <input 
                      value={search} 
                      onChange={(e) => setSearch(e.target.value)} 
                      placeholder="Search name/phone..." 
                      className="w-full sm:w-56 pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none" 
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsBriefOpen(true)} 
                      className="px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-50 flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
                    >
                      <BarChart3 size={12}/> Brief
                    </button>
                    <button 
                      onClick={() => handleSyncSheet(selectedCamp._id)} 
                      disabled={syncingSheet}
                      className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 disabled:opacity-50"
                    >
                      {syncingSheet ? <Loader2 size={12} className="animate-spin"/> : <ExternalLink size={12}/>} Create Sheet
                    </button>
                    <button 
                      onClick={downloadExcel} 
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0"
                    >
                      <Download size={12}/> Excel
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 space-y-4">
                
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2">
                      <Filter size={12} className="text-emerald-500" /> Show Only (Include)
                    </label>
                    {renderFilterPills(showOnly, setShowOnly, <CheckCircle size={12} />, 'bg-emerald-500 text-white border-emerald-500')}
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2">
                      <FilterX size={12} className="text-red-500" /> Filter Out (Exclude)
                    </label>
                    {renderFilterPills(filterOut, setFilterOut, <XCircle size={12} />, 'bg-red-500 text-white border-red-500')}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-w-[640px]">
                  {loadingReport ? (
                    <div className="flex justify-center items-center h-64">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase w-10">#</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Phone</th>
                          {selectedCamp?.additionalFields?.map((field, idx) => (
                            <th key={idx} className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{field}</th>
                          ))}
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase min-w-[140px]">Status</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Replies</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.map((d, i) => {
                          const replies = getRepliesList(d);
                          const statusConfig = getStatusConfig(d.status, replies, d.error);
                          return (
                            <tr key={`${d.phone}-${i}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-xs text-slate-400">{((reportCurrentPage - 1) * 50) + i + 1}</td>
                              <td className="px-4 py-3 font-medium text-slate-900 text-xs sm:text-sm">{d.name || "—"}</td>
                              <td className="px-4 py-3 font-mono text-xs">{d.phone}</td>
                              {selectedCamp?.additionalFields?.map((field, idx) => (
                                <td key={idx} className="px-4 py-3 text-xs text-slate-700">{d.additionalData?.[idx] || "—"}</td>
                              ))}
                              <td className="px-4 py-3">
                                <span 
                                  title={statusConfig.tooltip} 
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 cursor-default ${statusConfig.color}`}
                                >
                                  {statusConfig.icon}
                                  {statusConfig.label}
                                  {statusConfig.isWaiting && (
                                    <span className="relative flex h-2 w-2 ml-1">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {replies.length > 0 ? (
                                  <div className="flex flex-col gap-1.5">
                                    {replies.slice(0, 5).map((reply, idx) => (
                                      <span key={idx} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium border border-indigo-100 flex items-center gap-1.5 w-fit max-w-[220px]">
                                        <MessageSquare size={10} className="flex-shrink-0"/> 
                                        <span className="truncate">{reply}</span>
                                      </span>
                                    ))}
                                    {replies.length > 5 && (
                                      <span className="text-[10px] text-indigo-500 font-medium">+{replies.length - 5} more</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300">No reply</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {reportData.length === 0 && (
                          <tr>
                            <td colSpan={5 + additionalFieldsCount} className="text-center py-8 text-slate-400 text-xs">
                              No data found for this filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {reportTotalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-8">
                    <button 
                      onClick={() => selectedId && fetchReportData(selectedId, reportCurrentPage - 1)} 
                      disabled={reportCurrentPage === 1 || loadingReport} 
                      className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <span className="text-sm font-bold text-slate-700">
                      Page {reportCurrentPage} of {reportTotalPages}
                    </span>
                    <button 
                      onClick={() => selectedId && fetchReportData(selectedId, reportCurrentPage + 1)} 
                      disabled={reportCurrentPage === reportTotalPages || loadingReport} 
                      className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Audience Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedCamp?.name}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-50 border-b border-slate-200">
              <div className="relative flex-1">
                <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select 
                  value={tagFilter} 
                  onChange={(e) => setTagFilter(e.target.value)} 
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm"
                >
                  <option value="all">All Contacts</option>
                  <option value="untagged">Untagged</option>
                  {tags.map(t => (
                    <option key={t._id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs font-bold text-slate-600 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                {modalFilteredData.length} Contacts
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Phone</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Name</th>
                    {selectedCamp?.additionalFields?.map((field, idx) => (
                      <th key={idx} className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{field}</th>
                    ))}
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modalFilteredData.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs">{d.phone}</td>
                      <td className="px-5 py-3 font-medium text-slate-900 text-xs">{d.name || "—"}</td>
                      {selectedCamp?.additionalFields?.map((field, idx) => (
                        <td key={idx} className="px-5 py-3 text-xs text-slate-700">{d.additionalData?.[idx] || "—"}</td>
                      ))}
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {d.tags && d.tags.length > 0 ? (
                            d.tags.map((tag, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[10px] font-semibold flex items-center gap-1">
                                <TagIcon size={8} /> {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No tags</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {modalFilteredData.length === 0 && (
                    <tr>
                      <td colSpan={3 + additionalFieldsCount} className="text-center py-8 text-slate-400 text-xs">
                        No contacts found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
