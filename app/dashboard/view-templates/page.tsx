/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  FileText, PlusCircle, RefreshCw, CheckCircle, XCircle, Clock,
  Eye, X, Search, Loader2, Tag, Globe, LayoutGrid, List, 
  Image as ImageIcon, Video, File, Phone, ExternalLink, CheckCheck,
  ArrowLeft, MoreVertical
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

export default function AllTemplatesPage() {
  const { status } = useSession();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // View Mode State
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // View Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState<any>(null);

  // Load view preference from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem("templateViewMode");
    if (savedView === "grid" || savedView === "list") {
      setViewMode(savedView);
    }
  }, []);

  // Save view preference to localStorage
  useEffect(() => {
    localStorage.setItem("templateViewMode", viewMode);
  }, [viewMode]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/templates/list", { cache: "no-store" });
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) setTemplates(data.templates);
    } catch (error) {
      console.error("Failed to fetch templates", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchTemplates();
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
        toast.error("Sync failed. Make sure your WhatsApp number is connected.");
      }
    } catch (err) {
      toast.error("Sync error");
    } finally {
      setSyncing(false);
    }
  };

  const openViewModal = (template: any) => {
    setViewingTemplate(template);
    setIsViewModalOpen(true);
  };

  const getStatusConfig = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'approved' || s === 'completed') return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", icon: CheckCircle };
    if (s === 'rejected' || s === 'failed') return { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", icon: XCircle };
    return { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500", icon: Clock };
  };

  const filteredTemplates = templates
    .filter(t => statusFilter === "all" || t.status?.toLowerCase() === statusFilter)
    .filter(t => {
      if (!searchTerm) return true;
      return t.name?.toLowerCase().includes(searchTerm.toLowerCase());
    });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredTemplates.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTemplates = filteredTemplates.slice(indexOfFirstItem, indexOfLastItem);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans">
      <Sidebar />

      <main className="md:ml-64 flex flex-col min-h-screen">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Message Templates</h1>
              <p className="text-sm text-slate-500 mt-1">Create and manage your WhatsApp templates.</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:shadow-md hover:bg-slate-50 transition-all text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-600 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing..." : "Sync Meta"}
              </button>
              <Link href="/dashboard/templates/create" className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-600 transition-all text-sm font-bold">
                <PlusCircle className="w-4 h-4" /> New Template
              </Link>
            </div>
          </div>

          {/* Toolbar */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by template name..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
              />
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-3">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:bg-slate-200"}`}
                  title="List View"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-emerald-600" : "text-slate-500 hover:bg-slate-200"}`}
                  title="Grid View"
                >
                  <LayoutGrid size={16} />
                </button>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none appearance-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Content Area */}
          {loading ? (
            <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-emerald-500 mb-3" />
              <p className="text-sm font-medium">Loading templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-50 flex items-center justify-center">
                <FileText className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No templates found</h3>
              <p className="text-sm text-slate-500 mt-1 mb-5">Try adjusting your search or create a new template.</p>
            </div>
          ) : (
            <>
              {/* GRID VIEW */}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {currentTemplates.map((tpl: any) => {
                    const status = getStatusConfig(tpl.status);
                    const StatusIcon = status.icon;
                    const bodyText = tpl.body || tpl.components?.find((c: any) => c.type === "BODY")?.text || "No body text available.";

                    return (
                      <div key={tpl.id || tpl._id} className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300 flex flex-col group">
                        <div className="p-5 flex-1">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${status.bg} border ${status.border} transition-transform group-hover:scale-110`}>
                                <FileText className={`w-5 h-5 ${status.text}`} />
                              </div>
                              <h3 className="font-bold text-slate-900 text-base truncate" title={tpl.name}>{tpl.name}</h3>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${status.bg} ${status.border} shrink-0`}>
                              <StatusIcon className={`w-3 h-3 ${status.text}`} />
                              <span className={`text-[10px] font-bold ${status.text}`}>{tpl.status?.toUpperCase() || "PENDING"}</span>
                            </div>
                          </div>

                          <p className="text-sm text-slate-500 line-clamp-3 mb-5 min-h-[60px] leading-relaxed">
                            {bodyText}
                          </p>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100">
                              <Tag size={11} className="text-slate-400" /> {tpl.category || "MARKETING"}
                            </span>
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-100">
                              <Globe size={11} className="text-slate-400" /> {tpl.language || "en_US"}
                            </span>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 p-3 flex items-center justify-end gap-2 bg-slate-50/50 rounded-b-2xl">
                          <button
                            onClick={() => openViewModal(tpl)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Eye size={13} /> View Template
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW */
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {currentTemplates.map((tpl: any) => {
                      const status = getStatusConfig(tpl.status);
                      const StatusIcon = status.icon;
                      const bodyText = tpl.body || tpl.components?.find((c: any) => c.type === "BODY")?.text || "No body text available.";

                      return (
                        <div key={tpl.id || tpl._id} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 hover:bg-slate-50/80 transition-colors duration-150 group">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${status.bg} border ${status.border}`}>
                              <FileText className={`w-5 h-5 ${status.text}`} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-900 text-sm truncate">{tpl.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  <Tag size={9} /> {tpl.category || "MARKETING"}
                                </span>
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  <Globe size={9} /> {tpl.language || "en_US"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="hidden lg:block flex-1 min-w-0 px-4">
                            <p className="text-xs text-slate-500 line-clamp-1">{bodyText}</p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-3">
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${status.bg} ${status.border} shrink-0`}>
                              <StatusIcon className={`w-3 h-3 ${status.text}`} />
                              <span className={`text-[10px] font-bold ${status.text}`}>{tpl.status?.toUpperCase() || "PENDING"}</span>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openViewModal(tpl)}
                                className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="View Template"
                              >
                                <Eye size={15} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pagination Controls */}
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
            </>
          )}
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

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
