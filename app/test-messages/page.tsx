/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Send, Phone, FileText, Loader2, CheckCircle, XCircle,
  CheckCheck, Eye, X, Search, Filter, RefreshCw, Wallet,
  Clock, ChevronLeft, ChevronRight, Inbox, MessageSquare,
  TrendingUp, TrendingDown,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

type TestMessage = {
  _id: string;
  phone: string;
  text?: string;
  direction?: string;
  messageType?: string;
  mediaUrl?: string;
  whatsappMessageId?: string;
  status: string;
  templateName?: string;
  templateLanguage?: string;
  templateBodyText?: string;
  templateFooter?: string;
  templateHeaderType?: string;
  templateHeaderText?: string;
  whatsappPhoneNumberId?: string;
  createdAt: string;
};

type Stats = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  total: number;
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const formatINR = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2,
  }).format(amount || 0);

const getStatusConfig = (status: string) => {
  switch (status?.toLowerCase()) {
    case "sent":
      return {
        bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200",
        dot: "bg-blue-500", icon: <CheckCircle size={12} />, label: "Sent",
      };
    case "delivered":
      return {
        bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200",
        dot: "bg-cyan-500", icon: <CheckCheck size={12} />, label: "Delivered",
      };
    case "read":
      return {
        bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200",
        dot: "bg-purple-500", icon: <Eye size={12} />, label: "Read",
      };
    case "failed":
      return {
        bg: "bg-red-50", text: "text-red-700", border: "border-red-200",
        dot: "bg-red-500", icon: <XCircle size={12} />, label: "Failed",
      };
    default:
      return {
        bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200",
        dot: "bg-gray-400", icon: <Clock size={12} />, label: status || "Unknown",
      };
  }
};

export default function TestMessagesPage() {
  const { status: sessionStatus } = useSession();

  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [stats, setStats] = useState<Stats>({
    sent: 0, delivered: 0, read: 0, failed: 0, total: 0,
  });

  const [balance, setBalance] = useState(0);
  const [viewMessage, setViewMessage] = useState<TestMessage | null>(null);

  const itemsPerPage = 10;

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success && data.billing) {
        setBalance(data.billing.balance || 0);
      }
    } catch (error) {
      console.error("Failed to fetch billing", error);
    }
  };

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(itemsPerPage),
        search: searchTerm,
        status: statusFilter,
      });

      const res = await fetch(`/api/whatsapp/test-messages?${params}`, {
        cache: "no-store",
      });

      if (res.status === 401) return;

      const data = await res.json();

      // ✅ Debug log — check console to see what API returns
      console.log("📊 API Response:", {
        success: data.success,
        messagesCount: data.messages?.length,
        stats: data.stats,
        pagination: data.pagination,
      });

      if (data.success) {
        setMessages(data.messages || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);

        // ✅ Make sure stats are set properly
        const apiStats = data.stats || { sent: 0, delivered: 0, read: 0, failed: 0, total: 0 };
        setStats({
          sent: Number(apiStats.sent) || 0,
          delivered: Number(apiStats.delivered) || 0,
          read: Number(apiStats.read) || 0,
          failed: Number(apiStats.failed) || 0,
          total: Number(apiStats.total) || 0,
        });
      }
    } catch (err) {
      console.error("Failed to fetch test messages:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, searchTerm, statusFilter]);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchMessages();
      fetchBilling();
    } else if (sessionStatus === "unauthenticated") {
      window.location.href = "/";
    }
  }, [sessionStatus, fetchMessages]);

  // ✅ Auto-refresh every 15 seconds
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const interval = setInterval(() => {
      fetchMessages();
    }, 15000);
    return () => clearInterval(interval);
  }, [sessionStatus, fetchMessages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMessages();
    fetchBilling();
  };

  const deliveryRate = stats.total > 0
    ? Math.round(((stats.delivered + stats.read) / stats.total) * 100)
    : 0;
  const failureRate = stats.total > 0
    ? Math.round((stats.failed / stats.total) * 100)
    : 0;
  const successRate = stats.total > 0
    ? Math.round(((stats.total - stats.failed) / stats.total) * 100)
    : 0;

  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 text-gray-900">
      <Sidebar />

      {/* ===================== VIEW MODAL ===================== */}
      {viewMessage && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setViewMessage(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 sm:p-6 text-white relative shrink-0">
              <button
                onClick={() => setViewMessage(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={18} />
                <h2 className="text-lg sm:text-xl font-bold">Message Details</h2>
              </div>
              <p className="text-sm text-white/80">
                {viewMessage.templateName || "Direct Message"} •{" "}
                {viewMessage.templateLanguage || "N/A"}
              </p>
            </div>

            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase">Status</span>
                {(() => {
                  const cfg = getStatusConfig(viewMessage.status);
                  return (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  );
                })()}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Recipient Number</p>
                <p className="text-sm font-mono font-bold text-slate-900">+{viewMessage.phone}</p>
              </div>

              {viewMessage.templateName && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Template</p>
                    <p className="text-sm font-bold text-slate-900">{viewMessage.templateName}</p>
                    <p className="text-xs text-slate-500">Language: {viewMessage.templateLanguage || "en"}</p>
                  </div>
                  {viewMessage.templateBodyText && (
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Body Content</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{viewMessage.templateBodyText}</p>
                    </div>
                  )}
                  {viewMessage.templateFooter && (
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Footer</p>
                      <p className="text-xs text-slate-500">{viewMessage.templateFooter}</p>
                    </div>
                  )}
                </div>
              )}

              {!viewMessage.templateName && viewMessage.text && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Message</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{viewMessage.text}</p>
                </div>
              )}

              {viewMessage.whatsappMessageId && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">WhatsApp Message ID</p>
                  <p className="text-xs font-mono text-slate-600 break-all">{viewMessage.whatsappMessageId}</p>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                  <Clock size={10} /> Sent At
                </p>
                <p className="text-sm text-slate-700">{formatDateTime(viewMessage.createdAt)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MAIN CONTENT ===================== */}
      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-4 sm:pb-6 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <a href="/send-message" className="text-slate-400 hover:text-emerald-600 transition-colors">
                  <ChevronLeft size={20} />
                </a>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Test Messages Report
                </h1>
              </div>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">
                Track delivery status of all your test messages
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-all shadow-sm disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              </button>

              <div className="flex items-center gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl border shadow-sm bg-emerald-50 border-emerald-200">
                <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                <div>
                  <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-600">Balance</p>
                  <p className="text-base sm:text-lg font-extrabold text-emerald-700">{formatINR(balance)}</p>
                </div>
              </div>

              <a
                href="/send-message"
                className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 text-sm whitespace-nowrap"
              >
                <Send size={14} /> New Message
              </a>
            </div>
          </div>

          {/* ===================== STATS CARDS ===================== */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
            {/* Total */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Inbox size={14} className="text-slate-500" />
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</p>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-slate-900">{stats.total}</p>
            </div>

            {/* Sent */}
            <div className="bg-blue-50 p-3 sm:p-4 rounded-2xl border border-blue-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CheckCircle size={14} className="text-blue-500" />
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-blue-600">Sent</p>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-blue-700">{stats.sent}</p>
            </div>

            {/* Delivered */}
            <div className="bg-cyan-50 p-3 sm:p-4 rounded-2xl border border-cyan-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-cyan-100 flex items-center justify-center">
                  <CheckCheck size={14} className="text-cyan-500" />
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-cyan-600">Delivered</p>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-cyan-700">{stats.delivered}</p>
            </div>

            {/* Read */}
            <div className="bg-purple-50 p-3 sm:p-4 rounded-2xl border border-purple-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Eye size={14} className="text-purple-500" />
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-purple-600">Read</p>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-purple-700">{stats.read}</p>
            </div>

            {/* Failed */}
            <div className="bg-red-50 p-3 sm:p-4 rounded-2xl border border-red-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle size={14} className="text-red-500" />
                </div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-red-600">Failed</p>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-red-700">{stats.failed}</p>
            </div>
          </div>

          {/* ===================== DELIVERY OVERVIEW ===================== */}
          {stats.total > 0 && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivery Overview</p>
                <div className="flex gap-3 sm:gap-4 text-xs">
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <TrendingUp size={12} /> {successRate}% Success
                  </span>
                  <span className="font-bold text-cyan-600">{deliveryRate}% Delivered</span>
                  <span className="font-bold text-red-600 flex items-center gap-1">
                    <TrendingDown size={12} /> {failureRate}% Failed
                  </span>
                </div>
              </div>

              {/* Multi-color progress bar */}
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                {stats.sent > 0 && (
                  <div
                    className="bg-blue-400 h-full transition-all duration-700 flex items-center justify-center"
                    style={{ width: `${(stats.sent / stats.total) * 100}%` }}
                    title={`Sent: ${stats.sent}`}
                  >
                    {stats.sent > 5 && <span className="text-[8px] font-bold text-white">{stats.sent}</span>}
                  </div>
                )}
                {stats.delivered > 0 && (
                  <div
                    className="bg-cyan-500 h-full transition-all duration-700 flex items-center justify-center"
                    style={{ width: `${(stats.delivered / stats.total) * 100}%` }}
                    title={`Delivered: ${stats.delivered}`}
                  >
                    {stats.delivered > 5 && <span className="text-[8px] font-bold text-white">{stats.delivered}</span>}
                  </div>
                )}
                {stats.read > 0 && (
                  <div
                    className="bg-purple-500 h-full transition-all duration-700 flex items-center justify-center"
                    style={{ width: `${(stats.read / stats.total) * 100}%` }}
                    title={`Read: ${stats.read}`}
                  >
                    {stats.read > 5 && <span className="text-[8px] font-bold text-white">{stats.read}</span>}
                  </div>
                )}
                {stats.failed > 0 && (
                  <div
                    className="bg-red-500 h-full transition-all duration-700 flex items-center justify-center"
                    style={{ width: `${(stats.failed / stats.total) * 100}%` }}
                    title={`Failed: ${stats.failed}`}
                  >
                    {stats.failed > 5 && <span className="text-[8px] font-bold text-white">{stats.failed}</span>}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-blue-400 rounded-full" /> Sent ({stats.sent})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-cyan-500 rounded-full" /> Delivered ({stats.delivered})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-purple-500 rounded-full" /> Read ({stats.read})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full" /> Failed ({stats.failed})
                </span>
              </div>
            </div>
          )}

          {/* ===================== SEARCH & FILTER ===================== */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by phone number or template name..."
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
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="read">Read</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* ===================== MESSAGES LIST ===================== */}
          {loading ? (
            <div className="flex flex-col justify-center items-center py-20 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="mt-3 text-slate-500 text-sm">Loading test messages...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20 sm:py-32 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-500">No test messages found</p>
              <p className="text-xs text-slate-400 mt-1">
                Send a test message from the{" "}
                <a href="/send-message" className="text-emerald-600 underline font-medium">Send Message</a>{" "}
                page
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <Phone size={12} className="inline mr-1" /> Phone Number
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <FileText size={12} className="inline mr-1" /> Template
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <Clock size={12} className="inline mr-1" /> Date &amp; Time
                      </th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {messages.map((msg) => {
                      const cfg = getStatusConfig(msg.status);
                      return (
                        <tr key={msg._id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                                <Phone size={14} className="text-emerald-600" />
                              </div>
                              <span className="text-sm font-mono font-bold text-slate-900">+{msg.phone}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {msg.templateName ? (
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{msg.templateName}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                    🌐 {msg.templateLanguage || "en"}
                                  </span>
                                  {msg.messageType && msg.messageType !== "template" && (
                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">
                                      {msg.messageType}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-slate-500 italic">{msg.messageType || "Direct"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border w-fit ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-500">{formatDateTime(msg.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setViewMessage(msg)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {messages.map((msg) => {
                  const cfg = getStatusConfig(msg.status);
                  return (
                    <div key={msg._id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                            <Phone size={14} className="text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-mono font-bold text-slate-900">+{msg.phone}</p>
                            <p className="text-[10px] text-slate-400">{formatDateTime(msg.createdAt)}</p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>

                      {msg.templateName && (
                        <div className="flex items-center gap-2 mb-2">
                          <FileText size={12} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700">{msg.templateName}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{msg.templateLanguage || "en"}</span>
                        </div>
                      )}

                      {(msg.templateBodyText || msg.text) && (
                        <p className="text-xs text-slate-500 line-clamp-2 mb-3 bg-slate-50 p-2 rounded-lg overflow-hidden">
                          {msg.templateBodyText || msg.text}
                        </p>
                      )}

                      <button
                        onClick={() => setViewMessage(msg)}
                        className="w-full py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-100 transition-colors"
                      >
                        <Eye size={14} /> View Details
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-6">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <span className="text-sm font-bold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              )}

              <p className="text-center text-xs text-slate-400">
                Showing {messages.length} of {total} messages
              </p>
            </>
          )}
        </div>
      </div>

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
