/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useEffect, useState, useRef } from "react";
import styled from "styled-components";
import Sidebar from "@/components/Sidebar";
import {
  BarChart3, Download, Loader2, Search, CheckCircle, XCircle, Clock,
  MessageSquare, Eye, CheckCheck, AlertTriangle, Copy, Ban, Radio,
  ArrowLeft, X, Tag as TagIcon, Users, PieChart, Database, Filter,
  FilterX, ChevronLeft, ChevronRight, ChevronDown, ExternalLink, FileSpreadsheet,
  Link2, Check, RefreshCw,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import * as XLSX from "xlsx";
import { useSession } from "next-auth/react";

/* ========================================================= *
   LOADER COMPONENT
 * ========================================================= */

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
  padding: 20px 0;

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
    10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 100% {
      border-right-color: transparent;
    }
    11%, 21%, 31%, 41%, 51%, 61%, 71%, 81%, 91% {
      border-right-color: #000000;
    }
    60%, 80% { width: 100%; }
  }
`;

/* ========================================================= *
   TYPES
 * ========================================================= */

type ReportItem = {
  name: string;
  phone: string;
  status: string;
  error?: string;
  replies?: string[];
  reply?: string | null;
  repliedAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  replyTimes?: string[];
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
  updatedAt?: string;
  additionalFields?: string[];
  liveStats?: LiveStats;
  standaloneSheetUrl?: string | null;
  sheetUrl?: string | null;
  [x: string]: any;
};

/* ========================================================= *
   HELPER FUNCTIONS
 * ========================================================= */

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

const formatExcelDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

/* ========================================================= *
   MAIN COMPONENT
 * ========================================================= */

export default function ReportsPage() {
  const { data: session, status } = useSession();

  /* -------------------- STATE -------------------- */

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reportData, setReportData] = useState<ReportItem[]>([]);
  const [fullReportData, setFullReportData] = useState<ReportItem[]>([]); // ✅ Stores ALL data for client-side filtering
  const [totalFilteredItems, setTotalFilteredItems] = useState(0); // ✅ Accurate total count
  const [loadingReport, setLoadingReport] = useState(false);

  const [campaignStats, setCampaignStats] = useState<any>({});
  const [campaignStatsCampaignId, setCampaignStatsCampaignId] = useState<string | null>(null);
  const [campaignStatsCache, setCampaignStatsCache] = useState<Record<string, any>>({});

  const [syncingSheet, setSyncingSheet] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [syncingStandaloneSheet, setSyncingStandaloneSheet] = useState(false);

  // ✅ NEW: Download Modal State
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const [showOnly, setShowOnly] = useState<string[]>([]);
  const [filterOut, setFilterOut] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // ✅ Template button filter state
  const [templateButtons, setTemplateButtons] = useState<string[]>([]);
  const [loadingTemplateButtons, setLoadingTemplateButtons] = useState(false);
  const [templateButtonsFetched, setTemplateButtonsFetched] = useState(false);
  const [showButtonDropdown, setShowButtonDropdown] = useState(false);
  const [buttonFilter, setButtonFilter] = useState<string>("all");

  const [repliesMap, setRepliesMap] = useState<Record<string, string[]>>({});
  const [whatsappNumbers, setWhatsappNumbers] = useState<any[]>([]);
  const [showCampaignList, setShowCampaignList] = useState(true);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [tags, setTags] = useState<any[]>([]);
  const [tagFilter, setTagFilter] = useState("all");

  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [reportTotalPages, setReportTotalPages] = useState(1);

  const [hiddenActions, setHiddenActions] = useState<string[]>([]);

  const buttonDropdownRef = useRef<HTMLDivElement | null>(null);

  /* -------------------- HELPER FUNCTIONS -------------------- */

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
    if (d.reply && d.reply.trim().length > 0) return [d.reply];
    return [];
  };

  const getCampaignStats = (c: Campaign): LiveStats => {
    const buildStats = (cs: any): LiveStats => {
      const processed =
        Number(cs.replied || 0) +
        Number(cs.read || 0) +
        Number(cs.delivered || 0) +
        Number(cs.sent || 0) +
        Number(cs.failed || 0) +
        Number(cs.invalid || 0) +
        Number(cs.duplicate || 0);
      return {
        total: Number(cs.total || 0),
        replied: Number(cs.replied || 0),
        read: Number(cs.read || 0),
        delivered: Number(cs.delivered || 0),
        sent: Number(cs.sent || 0),
        failed: Number(cs.failed || 0),
        invalid: Number(cs.invalid || 0),
        duplicate: Number(cs.duplicate || 0),
        pending: Math.max(0, Number(cs.total || 0) - processed),
      };
    };

    if (c._id === selectedId && campaignStats && (campaignStats.total || 0) > 0) return buildStats(campaignStats);
    const cached = campaignStatsCache[c._id];
    if (cached && (cached.total || 0) > 0) return buildStats(cached);
    if (c.liveStats) return buildStats(c.liveStats);
    return { total: c.totalMessages||0, replied:0, read:0, delivered:0, sent: c.sentCount||0, failed: c.failedCount||0, invalid:0, duplicate:0, pending: c.totalMessages - ((c.sentCount||0) + (c.failedCount||0)) };
  };

  const getStatusConfig = (status: string, replies: string[], error?: string) => {
    switch (status) {
      case "replied": return { color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <MessageSquare size={10} className="inline mr-1" />, label: "Replied", isWaiting: false, tooltip: "" };
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

  /* -------------------- EFFECTS -------------------- */

  useEffect(() => {
    if (status === "authenticated") {
      fetchCampaigns(); fetchTags(); fetchWhatsappNumbers(); fetchUserSettings();
    } else if (status === "unauthenticated") {
      window.location.href = "/";
    }
  }, [status]);

  // ✅ Fetch all data when campaign or main filters change
  useEffect(() => {
    if (selectedId) fetchAllReportData(selectedId);
  }, [selectedId, showOnly, filterOut, search]);

  // ✅ Reset page to 1 when button filter changes
  useEffect(() => {
    setReportCurrentPage(1);
  }, [buttonFilter]);

  // ✅ Reset template states when campaign changes
  useEffect(() => {
    setTemplateButtons([]);
    setTemplateButtonsFetched(false);
    setLoadingTemplateButtons(false);
    setButtonFilter("all");
    setShowButtonDropdown(false);
  }, [selectedId]);

  // ✅ Client-side filtering and pagination logic
  useEffect(() => {
    if (loadingReport) return;

    let list = [...fullReportData];

    // Apply button filter across ALL data
    if (buttonFilter && buttonFilter !== "all") {
      list = list.filter((d) => {
        const replies = getRepliesList(d);
        if (buttonFilter === "other") {
          return replies.length > 0 && !replies.some((r) => templateButtons.includes(r));
        }
        return replies.includes(buttonFilter);
      });
    }

    setTotalFilteredItems(list.length);
    setReportTotalPages(Math.max(1, Math.ceil(list.length / 10)));

    // Adjust current page if it exceeds new total pages
    const currentPage = Math.min(reportCurrentPage, Math.max(1, Math.ceil(list.length / 10)));
    if (currentPage !== reportCurrentPage) setReportCurrentPage(currentPage);

    const start = (currentPage - 1) * 10;
    const paginated = list.slice(start, start + 10);
    setReportData(paginated);
  }, [fullReportData, buttonFilter, reportCurrentPage, templateButtons, loadingReport, repliesMap]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (buttonDropdownRef.current && !buttonDropdownRef.current.contains(e.target as Node)) {
        setShowButtonDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedCamp = campaigns.find((c) => c._id === selectedId);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns/counts");
      if (res.status === 401) { window.location.href = "/"; return; }
      const data = await res.json();
      if (data.success) {
        const allCampaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
        const validCampaigns = allCampaigns.filter((c: Campaign) => c.status !== "saved" && c.status !== "scheduled");
        setCampaigns(validCampaigns);
        if (!selectedId && validCampaigns.length > 0) setSelectedId(validCampaigns[0]._id || null);
      }
    } catch (error) { console.error("Failed to fetch campaigns", error); }
    finally { setLoading(false); }
  };

  const fetchTemplateButtons = async (rawTemplateName?: string) => {
    if (!rawTemplateName) {
      setTemplateButtons([]);
      setTemplateButtonsFetched(true);
      return;
    }

    const cleanName = rawTemplateName.replace(/^["']|["']$/g, "").trim();

    setLoadingTemplateButtons(true);
    try {
      const res = await fetch(`/api/templates/buttons?name=${encodeURIComponent(cleanName)}`);
      if (!res.ok) {
        setTemplateButtons([]);
        setTemplateButtonsFetched(true);
        return;
      }
      const data = await res.json();
      setTemplateButtons(Array.isArray(data.buttons) ? data.buttons : []);
      setTemplateButtonsFetched(true);
    } catch (err) {
      console.error("Failed to fetch template buttons", err);
      setTemplateButtons([]);
      setTemplateButtonsFetched(true);
    } finally {
      setLoadingTemplateButtons(false);
    }
  };

  const handleButtonDropdownToggle = () => {
    const willOpen = !showButtonDropdown;
    setShowButtonDropdown(willOpen);
    if (willOpen && !templateButtonsFetched && selectedCamp?.templateName) {
      fetchTemplateButtons(selectedCamp.templateName);
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
      if (numbers.length > 0) setWhatsappNumbers(numbers);
    } catch (err) { console.error("Failed to fetch WhatsApp numbers", err); }
  };

  const fetchUserSettings = async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (res.ok) {
        const data = await res.json();
        const u = data.user || data;
        if (u?.hiddenReportActions) setHiddenActions(u.hiddenReportActions);
      }
    } catch (err) { console.error("Failed to fetch user settings", err); }
  };

  const getCampaignSenderName = (c: Campaign | undefined) => {
    if (!c) return "Unknown";
    if (c.whatsappNumberId) {
      const match = whatsappNumbers.find((n) => n.whatsappPhoneNumberId === c.whatsappNumberId);
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
    } catch (err) { console.error("Failed to fetch tags", err); }
  };

  // ✅ Fetches ALL report data at once to enable perfect client-side filtering
  const fetchAllReportData = async (id: string, forceRefresh = false) => {
    setLoadingReport(true);
    setReportCurrentPage(1);
    setReportData([]);
    setFullReportData([]);

    try {
      const params = new URLSearchParams();
      params.set("id", id);
      params.set("download", "true"); // Ensures we get all rows, not just 1 page
      if (showOnly.length > 0) params.set("showOnly", showOnly.join(","));
      if (filterOut.length > 0) params.set("filterOut", filterOut.join(","));
      if (search) params.set("search", search);
      if (forceRefresh) params.set("refresh", "true");

      const res = await fetch(`/api/campaigns/list?${params.toString()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.campaigns) && data.campaigns[0]) {
        setFullReportData(data.campaigns[0].reportData || []);

        if (data.campaignStats) {
          setCampaignStats(data.campaignStats || {});
          setCampaignStatsCampaignId(id);
          setCampaignStatsCache((prev) => ({ ...prev, [id]: data.campaignStats || {} }));
        }

        const newRepliesMap: Record<string, string[]> = {};
        (data.campaigns[0].reportData || []).forEach((d: ReportItem) => {
          if (d.phone && d.replies && d.replies.length > 0) newRepliesMap[d.phone] = d.replies;
        });
        setRepliesMap(newRepliesMap);
      } else {
        setFullReportData([]);
      }
    } catch (error: any) {
      console.error("Failed to fetch report data", error);
      setFullReportData([]);
    } finally {
      setLoadingReport(false);
    }
  };

  const toggleArrayValue = (arr: string[], value: string, setter: (v: string[]) => void) => {
    if (arr.includes(value)) setter(arr.filter((v) => v !== value));
    else setter([...arr, value]);
  };

  const additionalFieldsCount = selectedCamp?.additionalFields?.length || 0;
  const handleSelectCampaign = (id: string) => { setSelectedId(id); setShowCampaignList(false); };

  const selectedCampData = campaigns.find((c) => c._id === selectedId);
  const useCampaignStats = (selectedId && campaignStatsCache[selectedId] && (campaignStatsCache[selectedId].total || 0) > 0) ? campaignStatsCache[selectedId] : selectedCampData?.liveStats || {};

  const totalMessages = useCampaignStats.total || 0;
  const repliedCount = useCampaignStats.replied || 0;
  const readCount = useCampaignStats.read || 0;
  const deliveredCount = useCampaignStats.delivered || 0;
  const sentOnlyCount = useCampaignStats.sent || 0;
  const failedCount = useCampaignStats.failed || 0;
  const invalidCount = useCampaignStats.invalid || 0;
  const duplicateCount = useCampaignStats.duplicate || 0;

  const totalProcessed = repliedCount + readCount + deliveredCount + sentOnlyCount + failedCount + invalidCount + duplicateCount;
  const pendingCount = Math.max(0, totalMessages - totalProcessed);
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
      {availableStatuses.map((status) => (
        <button
          key={status}
          onClick={() => toggleArrayValue(arr, status, setter)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 capitalize ${
            arr.includes(status) ? `${colorClass}` : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {icon} {status}
        </button>
      ))}
    </div>
  );

  // ✅ UPDATED: Accepts sortOrder parameter and applies sorting before download
  const downloadExcel = async (sortOrder = 'original') => {
    if (!selectedId) { toast.error("No campaign selected"); return; }
    setDownloadingExcel(true);
    try {
      
      // ✅ NEW: Fetch the additional field names (like Region, Dealer Name) from the new route
      const metaRes = await fetch(`/api/campaigns/meta?campaignId=${selectedId}`);
      const metaData = await metaRes.json();
      const additionalCols = metaData.success ? metaData.additionalFields : [];

      let fullData = [...fullReportData];

      // Apply button filter for Excel export
      if (buttonFilter && buttonFilter !== "all") {
        fullData = fullData.filter((d) => {
          const replies = getRepliesList(d);
          if (buttonFilter === "other") {
            return replies.length > 0 && !replies.some((r) => templateButtons.includes(r));
          }
          return replies.includes(buttonFilter);
        });
      }

      if (fullData.length === 0) { toast.error("No data to download"); return; }

      // ✅ Apply Sorting
      if (sortOrder === 'latest') {
        fullData.sort((a, b) => {
          const timeA = new Date(a.repliedAt || a.readAt || a.deliveredAt || a.createdAt || 0).getTime();
          const timeB = new Date(b.repliedAt || b.readAt || b.deliveredAt || b.createdAt || 0).getTime();
          return timeB - timeA; // Descending (Newest first)
        });
      }
      // 'original' keeps the array order as returned from the DB (which matches upload sequence)

      const fallbackTime = selectedCamp?.createdAt || selectedCamp?.updatedAt;

      // ✅ Build the Excel rows using the fetched additionalCols
      const wsData = fullData.map((d: any) => {
        const replies = getRepliesList(d).slice(0, 5);
        let currentStatus = d.status;
        if (replies.length > 0) currentStatus = "replied";
        const statusConfig = getStatusConfig(currentStatus, replies, d.error);

        const row: any = { "Name": d.name || "N/A", "Phone Number": d.phone };
        
        // ✅ Dynamically add the additional fields
        additionalCols.forEach((field: string | number, idx: string | number) => { 
          row[field] = d.additionalData?.[idx] || ""; 
        });
        
        row["Status"] = statusConfig.label;
        row["Delivered Time"] = formatExcelDate(d.deliveredAt || (["delivered", "read", "replied"].includes(currentStatus) ? fallbackTime : null));
        row["Read Time"] = formatExcelDate(d.readAt || (["read", "replied"].includes(currentStatus) ? fallbackTime : null));
        row["Replied Time"] = formatExcelDate(d.repliedAt || (currentStatus === "replied" ? fallbackTime : null));
        row["Error Reason"] = d.error || "";
        row["Tags"] = d.tags?.join(", ") || "None";

        for (let i = 0; i < 5; i++) {
          const replyText = replies[i] || "";
          row[`Reply ${i + 1}`] = replyText;
          if (replyText) row[`Reply ${i + 1} Time`] = formatExcelDate(d.replyTimes?.[i] || d.repliedAt || fallbackTime);
          else row[`Reply ${i + 1} Time`] = "";
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      const campName = campaigns.find((c) => c._id === selectedId)?.name || "Campaign";
      const fileName = sortOrder === 'latest' ? `${campName}_Latest_Report.xlsx` : `${campName}_Original_Report.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      setIsDownloadModalOpen(false); // Close modal on success
    } catch (error) { console.error("Failed to download Excel", error); toast.error("Error downloading Excel"); }
    finally { setDownloadingExcel(false); }
  };

  const handleSyncSheet = async (id: string, manualClick: boolean = true) => {
    if (syncingSheet) return;
    if (manualClick) setSyncingSheet(true);
    try {
      const res = await fetch("/api/campaigns/sync-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: id }) });
      const data = await res.json();
      if (data.success && data.url) {
        setCampaigns((prev) => prev.map((c) => (c._id === id ? { ...c, sheetUrl: data.url } : c)));
        if (manualClick) toast.success("Sheet synced! Link is available below.");
      } else if (manualClick) { toast.error(data.message || "Failed to sync Google Sheet"); }
    } catch (err) { if (manualClick) toast.error("Error syncing sheet"); }
    finally { if (manualClick) setSyncingSheet(false); }
  };

  const handleCreateStandaloneSheet = async (id: string, manualClick: boolean = true) => {
    if (syncingStandaloneSheet) return;
    if (manualClick) setSyncingStandaloneSheet(true);
    try {
      const res = await fetch("/api/campaigns/create-sheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: id, forceUpdate: true }) });
      const data = await res.json();
      if (data.success && data.url) {
        setCampaigns((prev) => prev.map((c) => (c._id === id ? { ...c, standaloneSheetUrl: data.url } : c)));
        if (manualClick) { if (data.created) toast.success("Report generated! Link is available below."); else toast.success("Report data force-updated!"); }
      } else if (manualClick) { toast.error(data.error || "Failed to generate report sheet"); }
    } catch (err) { if (manualClick) toast.error("Error generating report sheet"); }
    finally { if (manualClick) setSyncingStandaloneSheet(false); }
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // ✅ Shows the TOTAL filtered count from all pages, not just the current one
  const getButtonFilterLabel = () => {
    let label = "All Contacts";
    if (buttonFilter === "other") label = "Other";
    else if (buttonFilter !== "all") label = buttonFilter;
    return `${label} (${totalFilteredItems})`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />

      {/* ✅ NEW: Download Excel Popup */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setIsDownloadModalOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col border border-slate-100" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-5 text-slate-800 relative border-b border-emerald-100">
              <button onClick={() => setIsDownloadModalOpen(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1.5 hover:bg-white/60 rounded-lg transition-colors"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-emerald-100"><Download className="w-5 h-5 text-emerald-600" /></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Download Report</h2>
                  <p className="text-xs text-emerald-700/80 mt-0.5">Select the order for your Excel export</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 text-center">Both options will include all additional fields selected during campaign creation.</p>
              <button 
                onClick={() => downloadExcel('original')} 
                disabled={downloadingExcel}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {downloadingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} className="text-blue-500" />}
                Original Upload Order
              </button>
              <button 
                onClick={() => downloadExcel('latest')} 
                disabled={downloadingExcel}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {downloadingExcel ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} className="text-amber-500" />}
                Latest First (Newest to Oldest)
              </button>
            </div>
          </div>
        </div>
      )}

      {isBriefOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setIsBriefOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-5 text-slate-800 relative shrink-0 border-b border-indigo-100">
              <button onClick={() => setIsBriefOpen(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1.5 hover:bg-white/60 rounded-lg transition-colors"><X size={18} /></button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100"><PieChart className="w-5 h-5 text-indigo-600" /></div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">Brief Campaign Report</h2>
                  <p className="text-xs sm:text-sm text-indigo-700/80">{selectedCamp?.name}</p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 overflow-y-auto flex-1">
              <div className="flex flex-col gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Out of <span className="font-bold text-slate-900">{totalMessages}</span> contacts,{" "}
                    <span className="font-bold text-indigo-600"> {getPercentage(repliedCount)}%</span> ({repliedCount}) replied.{" "}
                    <span className="font-bold text-blue-600"> {getPercentage(readCount + repliedCount)}%</span> read,{" "}
                    and <span className="font-bold text-red-500"> {getPercentage(failedCount + invalidCount)}%</span> failed/invalid.
                  </p>
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 shrink-0">Breakdown (%)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                    {briefStats.map((stat) => (
                      <div key={stat.label} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-center">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">{stat.icon} {stat.label}</span>
                          <span className="text-[11px] font-bold text-slate-500">{getPercentage(stat.count)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className={`${stat.color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${getPercentage(stat.count)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-6 pt-4 lg:pt-0">
                <h3 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2 shrink-0">Exact Numbers</h3>
                <div className="grid grid-cols-2 gap-2 flex-1">
                  {briefStats.map((stat) => (
                    <div key={stat.label} className="flex flex-col justify-center p-2.5 bg-slate-50 rounded-lg border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1 mb-0.5">{stat.icon} {stat.label}</span>
                      <span className="text-lg font-extrabold text-slate-900">{stat.count}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900 rounded-xl shadow-md mt-1 shrink-0">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5"><Database size={14} /> Total Processed</span>
                  <span className="text-base font-extrabold text-white">{totalMessages}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="md:ml-64 flex h-screen overflow-hidden">
        <div className={`w-full md:w-80 bg-white md:border-r border-slate-200 flex flex-col shadow-sm flex-shrink-0 ${showCampaignList ? "flex" : "hidden md:flex"}`}>
          <div className="md:hidden h-14 bg-[#f0f2f5] flex items-center px-4 border-b border-slate-200 flex-shrink-0">
            <span className="font-bold text-gray-800 text-lg tracking-tight flex-1">Reports</span>
          </div>
          <div className="hidden md:block p-4 border-b border-slate-101 bg-slate-50">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={16} /> Campaign Reports</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {campaigns.length === 0 ? (
              <p className="p-4 text-sm text-slate-400 text-center">No completed campaigns yet</p>
            ) : (
              campaigns.map((c) => {
                const stats = getCampaignStats(c);
                return (
                  <button key={c._id} onClick={() => handleSelectCampaign(c._id)} className={`w-full text-left p-4 border-b border-slate-50 transition-colors ${selectedId === c._id ? "bg-emerald-50 border-l-4 border-l-emerald-500" : "hover:bg-slate-50 border-l-4 border-l-transparent"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm truncate flex-1">{c.name}</p>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${c.status === "running" ? "bg-emerald-100 text-emerald-700" : c.status === "paused" ? "bg-blue-100 text-blue-700" : c.status === "failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{c.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                      {stats.replied > 0 && (<span className="flex items-center gap-1 text-indigo-600 font-medium"><MessageSquare size={10} /> {stats.replied} Replied</span>)}
                      {stats.read > 0 && (<span className="flex items-center gap-1 text-blue-600 font-medium"><Eye size={10} /> {stats.read} Read</span>)}
                      {stats.delivered > 0 && (<span className="flex items-center gap-1 text-cyan-600 font-medium"><CheckCheck size={10} /> {stats.delivered} Delivered</span>)}
                      {stats.sent > 0 && (<span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle size={10} /> {stats.sent} Sent</span>)}
                      {stats.pending > 0 && (<span className="flex items-center gap-1 text-amber-600 font-medium"><Clock size={10} /> {stats.pending} Pending</span>)}
                      {stats.failed > 0 && (<span className="flex items-center gap-1 text-red-600 font-medium"><XCircle size={10} /> {stats.failed} Failed</span>)}
                      {stats.invalid > 0 && (<span className="flex items-center gap-1 text-orange-600 font-medium"><AlertTriangle size={10} /> {stats.invalid} Invalid</span>)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`flex-1 flex flex-col bg-slate-50 overflow-hidden ${!showCampaignList ? "flex" : "hidden md:flex"}`}>
          {!selectedCamp ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 p-4">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Select a campaign to view report</p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white border-b border-slate-200 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 sm:px-6 pt-4">
                  <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
                    <button onClick={() => setShowCampaignList(true)} className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold truncate">{selectedCamp.name}</h2>
                        {selectedCamp.status === "running" && (<span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 shrink-0"><Radio size={10} className="animate-pulse" /> LIVE</span>)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-none">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name/phone..." className="w-full sm:w-48 pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                    </div>

                    <button onClick={() => selectedId && fetchAllReportData(selectedId, true)} disabled={loadingReport} className="px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="Refresh data">
                      {loadingReport ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
                    </button>

                    <button onClick={() => setIsBriefOpen(true)} disabled={hiddenActions.includes("brief")} className={`px-3 py-2 border rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 ${hiddenActions.includes("brief") ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" : "bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50"}`}>
                      <BarChart3 size={12} /> Brief
                    </button>

                    <button onClick={() => handleSyncSheet(selectedCamp._id)} disabled={syncingSheet || hiddenActions.includes("loadSheet")} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${hiddenActions.includes("loadSheet") ? "bg-slate-200 text-slate-500" : "bg-indigo-500 text-white hover:bg-indigo-600"}`}>
                      {syncingSheet ? <Loader2 size={12} className="animate-spin" /> : selectedCamp.sheetUrl ? <RefreshCw size={12} /> : <ExternalLink size={12} />} 
                      {selectedCamp.sheetUrl ? "Update Sheet" : "Sync Sheets"}
                    </button>

                    <button onClick={() => handleCreateStandaloneSheet(selectedCamp._id)} disabled={syncingStandaloneSheet || hiddenActions.includes("generateReport")} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${hiddenActions.includes("generateReport") ? "bg-slate-200 text-slate-500" : "bg-purple-500 text-white hover:bg-purple-600"}`}>
                      {syncingStandaloneSheet ? <Loader2 size={12} className="animate-spin" /> : selectedCamp.standaloneSheetUrl ? <RefreshCw size={12} /> : <FileSpreadsheet size={12} />} 
                      {selectedCamp.standaloneSheetUrl ? "Update Report" : "Export Report"}
                    </button>

                    {/* ✅ NEW: Opens the Download Modal */}
                    <button onClick={() => setIsDownloadModalOpen(true)} disabled={downloadingExcel || hiddenActions.includes("downloadExcel")} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${hiddenActions.includes("downloadExcel") ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                      {downloadingExcel ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Excel
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-4 sm:px-6 pb-3 pt-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>Template: <span className="font-medium text-slate-700">{selectedCamp.templateName}</span></span>
                    <span className="text-slate-300">•</span>
                    <span>Auto-updates</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-emerald-600 font-medium">Sent by: {getCampaignSenderName(selectedCamp)}</span>
                  </div>
                  {(selectedCamp.sheetUrl || selectedCamp.standaloneSheetUrl) && (
                    <div className="flex flex-wrap gap-2">
                      {selectedCamp.sheetUrl && (<a href={selectedCamp.sheetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline truncate"><Link2 size={12} className="shrink-0" /> All Reports Sheet</a>)}
                      {selectedCamp.standaloneSheetUrl && (<a href={selectedCamp.standaloneSheetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-800 hover:underline truncate"><Link2 size={12} className="shrink-0" /> Reports Sheet</a>)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 space-y-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="pb-3 border-b border-slate-100">
                    <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2">
                      <MessageSquare size={12} className="text-indigo-500" /> Filter by Button Reply
                    </label>
                    <div className="relative inline-block w-full sm:w-72" ref={buttonDropdownRef}>
                      <button
                        onClick={handleButtonDropdownToggle}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <span className="truncate flex items-center gap-1.5">
                          {buttonFilter !== "all" && <CheckCircle size={12} className="text-emerald-500 shrink-0" />}
                          {getButtonFilterLabel()}
                        </span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform shrink-0 ${showButtonDropdown ? "rotate-180" : ""}`} />
                      </button>

                      {showButtonDropdown && (
                        <div className="absolute z-30 top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                          <button
                            onClick={() => { setButtonFilter("all"); setShowButtonDropdown(false); }}
                            className={`w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 flex items-center justify-between transition-colors ${buttonFilter === "all" ? "bg-emerald-50 text-emerald-700" : "text-slate-700"}`}
                          >
                            All Contacts
                            {buttonFilter === "all" && <Check size={12} />}
                          </button>

                          {loadingTemplateButtons ? (
                            <div className="px-3 py-3 text-xs font-bold text-slate-500 flex items-center gap-2 bg-slate-50">
                              <Loader2 size={12} className="animate-spin text-indigo-500" />
                              Loading buttons...
                            </div>
                          ) : templateButtons.length > 0 ? (
                            templateButtons.map((btn) => (
                              <button
                                key={btn}
                                onClick={() => { setButtonFilter(btn); setShowButtonDropdown(false); }}
                                className={`w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 flex items-center justify-between transition-colors border-t border-slate-100 ${buttonFilter === btn ? "bg-indigo-50 text-indigo-700" : "text-slate-700"}`}
                              >
                                <span className="truncate flex items-center gap-1.5">
                                  <MessageSquare size={11} className="text-indigo-400 shrink-0" />
                                  {btn}
                                </span>
                                {buttonFilter === btn && <Check size={12} />}
                              </button>
                            ))
                          ) : (
                            templateButtonsFetched && (
                              <div className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                                No buttons found for this template.
                              </div>
                            )
                          )}

                          <button
                            onClick={() => { setButtonFilter("other"); setShowButtonDropdown(false); }}
                            className={`w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 flex items-center justify-between transition-colors border-t border-slate-200 ${buttonFilter === "other" ? "bg-amber-50 text-amber-700" : "text-slate-700"}`}
                          >
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                              Other
                            </span>
                            {buttonFilter === "other" && <Check size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Filters contacts by which template button they replied with. &quot;Other&quot; shows replies that don&apos;t match any template button.
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2"><Filter size={12} className="text-emerald-500" /> Show Only (Include)</label>
                    {renderFilterPills(showOnly, setShowOnly, <CheckCircle size={12} />, "bg-emerald-500 text-white border-emerald-500")}
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-2"><FilterX size={12} className="text-red-500" /> Filter Out (Exclude)</label>
                    {renderFilterPills(filterOut, setFilterOut, <XCircle size={12} />, "bg-red-500 text-white border-red-500")}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-w-[640px]">
                  {loadingReport ? (
                    <div className="flex justify-center items-center h-64"><ScannerLoader /></div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase w-10">#</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Name</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Phone</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase min-w-[140px]">Status</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase">Replies</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.map((d, i) => {
                          const replies = getRepliesList(d);
                          let currentStatus = d.status;
                          if (replies.length > 0) currentStatus = "replied";
                          const statusConfig = getStatusConfig(currentStatus, replies, d.error);
                          return (
                            <tr key={`${d.phone}-${i}`} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 text-xs text-slate-400">{((reportCurrentPage - 1) * 10) + i + 1}</td>
                              <td className="px-4 py-3 font-medium text-slate-900 text-xs sm:text-sm">{d.name || "—"}</td>
                              <td className="px-4 py-3 font-mono text-xs">{d.phone}</td>
                              <td className="px-4 py-3">
                                <span title={statusConfig.tooltip} className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 cursor-default ${statusConfig.color}`}>
                                  {statusConfig.icon} {statusConfig.label}
                                  {statusConfig.isWaiting && (
                                    <span className="relative flex h-2 w-2 ml-1">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {replies.length > 0 ? (
                                  <div className="flex flex-col gap-1.5">
                                    {replies.slice(0, 5).map((reply, idx) => (
                                      <span key={idx} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium border border-indigo-100 flex items-center gap-1.5 w-fit max-w-[220px]">
                                        <MessageSquare size={10} className="flex-shrink-0" />
                                        <span className="truncate">{reply}</span>
                                      </span>
                                    ))}
                                    {replies.length > 5 && (<span className="text-[10px] text-indigo-500 font-medium">+{replies.length - 5} more</span>)}
                                  </div>
                                ) : (<span className="text-slate-300">No reply</span>)}
                              </td>
                            </tr>
                          );
                        })}
                        {reportData.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-16 text-slate-400">
                              <div className="flex flex-col items-center gap-2">
                                <Search size={32} className="text-slate-200" />
                                <p className="text-sm font-semibold text-slate-500">No results found</p>
                                <p className="text-xs text-slate-400">Try changing your filters or search query</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {reportTotalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-8">
                    <button onClick={() => setReportCurrentPage(reportCurrentPage - 1)} disabled={reportCurrentPage === 1 || loadingReport} className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <span className="text-sm font-bold text-slate-700">Page {reportCurrentPage} of {reportTotalPages}</span>
                    <button onClick={() => setReportCurrentPage(reportCurrentPage + 1)} disabled={reportCurrentPage === reportTotalPages || loadingReport} className="flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
