/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  Eye, X, Search, Filter, Loader2, Trash2, FileSpreadsheet, 
  PlusCircle, Link2, User, Phone, Tag, Calendar, Database, Settings
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type SheetConfig = {
  _id: string;
  name?: string; // ✅ Added name
  sheetUrl: string;
  nameField: string;
  numberField: string;
  additionalFields: string[];
  createdAt: string;
};

export default function SheetSyncList() {
  const router = useRouter();
  const { status } = useSession();
  const [configs, setConfigs] = useState<SheetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewConfig, setViewConfig] = useState<SheetConfig | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const fetchConfigs = async () => {
    try {
      const res = await fetch("/api/sheet-importer/list", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.success) setConfigs(data.configs);
    } catch (error) {
      console.error("Failed to fetch configs", error);
      toast.error("Failed to load configurations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchConfigs();
    } else if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this sheet configuration?")) return;
    
    setDeletingId(id);
    try {
      const res = await fetch("/api/sheet-importer/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: id }),
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success("Configuration deleted successfully");
        setConfigs(prev => prev.filter(c => c._id !== id));
      } else {
        toast.error(data.error || "Failed to delete");
      }
    } catch (err) {
      toast.error("Error deleting configuration");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredConfigs = configs.filter(c => {
    if (!searchTerm) return true;
    const lt = searchTerm.toLowerCase();
    return (
      c.sheetUrl.toLowerCase().includes(lt) || 
      c.nameField.toLowerCase().includes(lt) || 
      c.numberField.toLowerCase().includes(lt) ||
      (c.name || "").toLowerCase().includes(lt) // ✅ Search by name too
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredConfigs.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredConfigs.slice(indexOfFirstItem, indexOfLastItem);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />

      {viewConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setViewConfig(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 sm:p-6 text-white relative shrink-0">
              <button onClick={() => setViewConfig(null)} className="absolute top-4 right-4 text-white/80 hover:text-white">
                <X size={20} />
              </button>
              <h2 className="text-xl sm:text-2xl font-bold pr-8 flex items-center gap-2">
                <Database size={20} /> {viewConfig.name || "Configuration Details"}
              </h2>
              <p className="text-sm text-white/80 mt-1">Created on {new Date(viewConfig.createdAt).toLocaleString()}</p>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1 mb-1">
                  <Link2 size={12} /> Google Sheet URL
                </label>
                <a href={viewConfig.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all font-medium">
                  {viewConfig.sheetUrl}
                </a>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <User className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Name Field</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{viewConfig.nameField}</p>
                  </div>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Phone className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Number Field</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{viewConfig.numberField}</p>
                  </div>
                </div>
              </div>

              {viewConfig.additionalFields && viewConfig.additionalFields.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-100">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1 mb-2">
                    <Tag size={12} /> Additional Fields
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {viewConfig.additionalFields.map((field, i) => (
                      <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200">
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          
          {/* Beautiful Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-lg shadow-blue-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#93C5FD]/40 rounded-full blur-3xl"></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-7 h-7 text-blue-600" /> Sheet Configurations
                </h1>
                <p className="text-blue-700/80 text-xs sm:text-sm mt-2 font-medium">
                  View and manage your saved Google Sheet mappings.
                </p>
              </div>
              <a 
                href="/dashboard/google-sheet-manager" 
                className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 text-sm"
              >
                <PlusCircle size={16} /> New Sync
              </a>
            </div>
          </div>

          {/* Toolbar */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, URL or field..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-slate-400 hidden sm:block" />
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200">
                {filteredConfigs.length} Configs
              </span>
            </div>
          </div>

          {/* Content Area */}
          {currentItems.length === 0 ? (
            <div className="text-center py-20 sm:py-32 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <Database className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-200" />
              <p className="font-medium text-slate-500">No configurations found</p>
              <p className="text-xs mt-1">Create a new sync to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentItems.map((c) => (
                <div key={c._id} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag className="w-4 h-4 text-emerald-500 shrink-0" />
                        <h3 className="text-sm font-bold text-slate-900 truncate max-w-[280px] sm:max-w-md">
                          {c.name || "Unnamed Sheet"}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mb-1 mt-1">
                        <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <a href={c.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-slate-500 hover:text-blue-600 hover:underline truncate max-w-[280px] sm:max-w-md">
                          {c.sheetUrl}
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                          <User size={10} /> {c.nameField}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-100">
                          <Phone size={10} /> {c.numberField}
                        </span>
                        {c.additionalFields && c.additionalFields.map((field, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
                            <Tag size={10} /> {field}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" /> Created {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1.5 sm:ml-4 w-full sm:w-auto justify-end">
                      <Link 
                        href={`/dashboard/sheet-sync-manage?id=${c._id}`} 
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" 
                        title="Manage Sync"
                      >
                        <Settings size={16} />
                      </Link>
                      <button 
                        onClick={() => setViewConfig(c)} 
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(c._id)} 
                        disabled={deletingId === c._id} 
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" 
                        title="Delete"
                      >
                        {deletingId === c._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

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
            </div>
          )}
        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
