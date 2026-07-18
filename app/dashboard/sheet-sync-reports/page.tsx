/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  ArrowLeft, Download, Loader2, Database, MessageSquare, 
  CheckCircle, XCircle, Clock, Send, Radio, ExternalLink, User, Eye, CheckCheck, AlertTriangle, Copy, Ban, Filter, FilterX, Link2, BarChart3, X, PieChart
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function ReportContent() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("id");

  const [campaign, setCampaign] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showOnly, setShowOnly] = useState<string[]>([]);
  const [filterOut, setFilterOut] = useState<string[]>([]);
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await fetch(`/api/sheet-sync-reports?campaignId=${campaignId}`);
      const data = await res.json();
      
      // ✅ FIX: Only update state if successful. If it fails (e.g. Rate Limit), we KEEP the old data.
      if (data.success) {
        setCampaign(data.campaign);
        setMessages(data.messages);
      } else {
        // Optional: Log the error to console without spamming toast notifications every 15 seconds
        console.warn("Live update skipped due to API error. Retrying in 15s...");
      }
    } catch (error) {
      console.error("Failed to fetch report", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchReport();
    // ✅ FIX: Changed from 5000 (5s) to 15000 (15s) to prevent Google API Quota limits
    const interval = setInterval(fetchReport, 15000);
    return () => clearInterval(interval);
  }, [fetchReport]);

  const toggleArrayValue = (arr: string[], value: string, setter: (v: string[]) => void) => {
    if (arr.includes(value)) {
      setter(arr.filter(v => v !== value));
    } else {
      setter([...arr, value]);
    }
  };

  const filteredMessages = messages.filter(msg => {
    const currentStatus = msg.isReplied ? "replied" : msg.status;
    if (showOnly.length > 0 && !showOnly.includes(currentStatus)) return false;
    if (filterOut.length > 0 && filterOut.includes(currentStatus)) return false;
    return true;
  });

  const exportToCSV = () => {
    if (!campaign || filteredMessages.length === 0) {
      toast.error("No data to export based on current filters");
      return;
    }

    const additionalCols = campaign.additionalFields || [];
    const headers = ["Name", "Phone", ...additionalCols, "Status", "Sent At", "Reply 1", "Reply 2", "Reply 3", "Reply 4", "Reply 5"];
    
    const rows = filteredMessages.map((msg) => {
      const replies = [...(msg.replies || [])];
      while (replies.length < 5) replies.push("");
      return [
        msg.name || "Unknown",
        msg.phone,
        ...(msg.additionalData || []),
        msg.isReplied ? "Replied" : msg.status,
        new Date(msg.createdAt).toLocaleString(),
        ...replies
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${campaign.name}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Filtered Report exported!");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const totalMessages = messages.length;
  const repliedCount = messages.filter(m => m.isReplied).length;
  const readCount = messages.filter(m => m.status === 'read' && !m.isReplied).length;
  const deliveredCount = messages.filter(m => m.status === 'delivered' && !m.isReplied).length;
  const sentOnlyCount = messages.filter(m => m.status === 'sent' && !m.isReplied).length;
  const failedCount = messages.filter(m => m.status === 'failed').length;
  const invalidCount = messages.filter(m => m.status === 'invalid').length;
  const duplicateCount = messages.filter(m => m.status === 'duplicate').length;

  const getPercentage = (count: number) => totalMessages > 0 ? ((count / totalMessages) * 100).toFixed(1) : "0.0";
  const sentCount = messages.filter(m => ["sent", "delivered", "read", "replied"].includes(m.status)).length;

  const getStatusConfig = (status: string, replies: string[]) => {
    if (replies.length > 0) return { color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <MessageSquare size={10} className="inline mr-1" />, label: `Replied (${replies.length})` };
    switch (status) {
      case "read": return { color: "bg-blue-50 text-blue-700 border-blue-200", icon: <Eye size={10} className="inline mr-1" />, label: "Read" };
      case "delivered": return { color: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: <CheckCheck size={10} className="inline mr-1" />, label: "Delivered" };
      case "sent": return { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle size={10} className="inline mr-1" />, label: "Sent" };
      case "failed": return { color: "bg-red-50 text-red-700 border-red-200", icon: <XCircle size={10} className="inline mr-1" />, label: "Failed" };
      case "invalid": return { color: "bg-orange-50 text-orange-700 border-orange-200", icon: <AlertTriangle size={10} className="inline mr-1" />, label: "Invalid" };
      case "duplicate": return { color: "bg-slate-100 text-slate-500 border-slate-200", icon: <Copy size={10} className="inline mr-1" />, label: "Duplicate" };
      default: return { color: "bg-gray-50 text-gray-700 border-gray-200", icon: <Ban size={10} className="inline mr-1" />, label: status ? (status.charAt(0).toUpperCase() + status.slice(1)) : "Unknown" };
    }
  };

  const availableStatuses = ["replied", "read", "delivered", "sent", "failed", "invalid", "duplicate"];

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

  const briefStats = [
    { label: "Replied", count: repliedCount, color: "bg-indigo-500", icon: <MessageSquare size={14} className="text-indigo-600" /> },
    { label: "Read", count: readCount, color: "bg-blue-500", icon: <Eye size={14} className="text-blue-600" /> },
    { label: "Delivered", count: deliveredCount, color: "bg-cyan-500", icon: <CheckCheck size={14} className="text-cyan-600" /> },
    { label: "Sent", count: sentOnlyCount, color: "bg-emerald-500", icon: <CheckCircle size={14} className="text-emerald-600" /> },
    { label: "Failed", count: failedCount, color: "bg-red-500", icon: <XCircle size={14} className="text-red-600" /> },
    { label: "Invalid", count: invalidCount, color: "bg-orange-500", icon: <AlertTriangle size={14} className="text-orange-600" /> },
    { label: "Duplicate", count: duplicateCount, color: "bg-slate-400", icon: <Copy size={14} className="text-slate-500" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans">
      <Sidebar />
      
      {/* ✅ BRIEF REPORT MODAL (Compact, No Scroll, Responsive) */}
      {isBriefOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsBriefOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col border border-slate-100 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
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
                  <p className="text-xs sm:text-sm text-indigo-700/80">{campaign?.name}</p>
                </div>
              </div>
            </div>

            {/* Modal Body - No Scroll Layout */}
            <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 overflow-hidden flex-1">
              
              {/* Left Column: Summary & Percentages */}
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

              {/* Right Column: Exact Numbers */}
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

      <div className="md:ml-64 p-4 sm:p-6 lg:p-10 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-lg shadow-blue-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#93C5FD]/40 rounded-full blur-3xl"></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
              <div>
                <Link href="/dashboard/sheet-sync-campaign/list" className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 mb-2">
                  <ArrowLeft size={14} /> Back to Campaigns
                </Link>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
                  <Database className="w-7 h-7 text-blue-600" /> Campaign Report
                </h1>
                <p className="text-blue-700/80 text-xs sm:text-sm mt-2 font-medium">
                  {campaign?.name} • Template: {campaign?.templateName}
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setIsBriefOpen(true)}
                  className="px-5 py-2.5 bg-white border border-indigo-200 text-indigo-700 rounded-xl font-bold hover:bg-indigo-50 flex items-center justify-center gap-2 shadow-sm transition-all text-sm"
                >
                  <BarChart3 size={16} /> View Brief Report
                </button>
                <button
                  onClick={exportToCSV}
                  className="px-5 py-2.5 bg-white border border-blue-200 text-blue-700 rounded-xl font-bold hover:bg-blue-50 flex items-center justify-center gap-2 shadow-sm transition-all text-sm"
                >
                  <Download size={16} /> Export Sheet (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Google Sheet Live Report Link Card */}
          <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-emerald-50 rounded-xl shrink-0">
                <Link2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Live Report Google Sheet Link</p>
                {campaign?.reportSpreadsheetUrl ? (
                  <a 
                    href={campaign.reportSpreadsheetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-sm text-slate-700 hover:text-emerald-600 hover:underline font-medium truncate block"
                  >
                    {campaign.reportSpreadsheetUrl}
                  </a>
                ) : (
                  <span className="text-sm text-slate-400 italic">
                    Report sheet will generate automatically once the campaign starts running...
                  </span>
                )}
              </div>
            </div>
            {campaign?.reportSpreadsheetUrl && (
              <a 
                href={campaign.reportSpreadsheetUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
              >
                <ExternalLink size={14} /> Open Report Sheet
              </a>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-xl"><Send className="w-5 h-5 text-emerald-600" /></div>
              <div><p className="text-xl font-extrabold text-slate-900">{sentCount}</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Sent</p></div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-xl"><MessageSquare className="w-5 h-5 text-indigo-600" /></div>
              <div><p className="text-xl font-extrabold text-slate-900">{repliedCount}</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Replied</p></div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-xl"><XCircle className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-xl font-extrabold text-slate-900">{failedCount}</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Invalid/Dupes</p></div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-xl"><Clock className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-xl font-extrabold text-slate-900">{sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0}%</p><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reply Rate</p></div>
            </div>
          </div>

          {/* Multi-Select Filters Card */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <Filter size={12} className="text-emerald-500" /> Show Only (Include)
              </label>
              {renderFilterPills(showOnly, setShowOnly, <CheckCircle size={12} />, 'bg-emerald-500 text-white border-emerald-500')}
            </div>
            <div className="pt-4 border-t border-slate-100">
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <FilterX size={12} className="text-red-500" /> Filter Out (Exclude)
              </label>
              {renderFilterPills(filterOut, setFilterOut, <XCircle size={12} />, 'bg-red-500 text-white border-red-500')}
            </div>
          </div>

          {/* Live Report Table */}
          <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare size={14} className="text-blue-500" /> Live Message Logs & Replies
              </label>
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-100">
                <Radio size={10} className="animate-pulse" /> Live Polling (15s)
              </span>
            </div>
            
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 font-bold border-b border-slate-200">Name</th>
                    <th className="px-6 py-3 font-bold border-b border-slate-200">Phone</th>
                    {campaign?.additionalFields?.map((field: string, i: number) => (
                      <th key={i} className="px-6 py-3 font-bold border-b border-slate-200">{field}</th>
                    ))}
                    <th className="px-6 py-3 font-bold border-b border-slate-200 min-w-[140px]">Status</th>
                    <th className="px-6 py-3 font-bold border-b border-slate-200">Replies</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMessages.length === 0 ? (
                    <tr>
                      <td colSpan={4 + (campaign?.additionalFields?.length || 0)} className="text-center py-10 text-slate-400">
                        <Database className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                        No messages match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredMessages.map((msg, idx) => {
                      const replies = msg.replies || [];
                      const statusConfig = getStatusConfig(msg.status, replies);
                      
                      return (
                        <tr key={idx} className="bg-white border-b hover:bg-slate-50/50 transition-colors align-top">
                          <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                            <User size={12} className="text-slate-400" /> {msg.name || "Unknown"}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700 whitespace-nowrap">
                            {msg.phone}
                          </td>
                          {campaign?.additionalFields?.map((_: string, i: number) => (
                            <td key={i} className="px-6 py-4 font-medium text-slate-700 whitespace-nowrap">
                              {msg.additionalData?.[i] || "-"}
                            </td>
                          ))}
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusConfig.color}`}>
                              {statusConfig.icon}
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {replies.length > 0 ? (
                              <div className="flex flex-col gap-1.5">
                                {replies.slice(0, 5).map((reply: string, rIdx: number) => (
                                  <span key={rIdx} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-medium border border-indigo-100 flex items-center gap-1.5 w-fit max-w-[280px]">
                                    <MessageSquare size={10} className="flex-shrink-0"/> 
                                    <span className="truncate">{reply}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300">No reply</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen bg-slate-50 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>}>
      <ReportContent />
    </Suspense>
  );
}
