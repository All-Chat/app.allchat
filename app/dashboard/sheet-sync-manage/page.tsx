/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  Play, Pause, RefreshCw, Clock, Database, Loader2, 
  ArrowLeft, CheckCircle, User, Phone, Tag, AlertCircle
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Link from "next/link";

function ManageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configId = searchParams.get("id");

  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [rows, setRows] = useState<string[][]>([]);
  const [tableHeaders, setTableHeaders] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  
  const [intervalValue, setIntervalValue] = useState(5);
  const [intervalUnit, setIntervalUnit] = useState<"seconds" | "minutes" | "hours">("minutes");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [lastRunStatus, setLastRunStatus] = useState<string | null>(null);
  const [togglingSync, setTogglingSync] = useState(false);

  // ✅ Refs to prevent overlapping fetches and state closures
  const lastSyncedRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false); // ✅ LOCK to prevent multiple sheets from breaking the UI

  const fetchSheetData = useCallback(async (currentConfig: any, isAutoFetch = false) => {
    if (!currentConfig || isFetchingRef.current) return;
    
    isFetchingRef.current = true; // Lock
    setIsFetching(true);
    
    try {
      const res = await fetch("/api/sheet-importer/fetch-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: currentConfig.sheetUrl }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to fetch data");

      const mappedHeaders = [
        currentConfig.nameField || "Name", 
        currentConfig.numberField || "Number", 
        ...(currentConfig.additionalFields || [])
      ];
      setTableHeaders(mappedHeaders);

      const originalHeaders = data.headers || [];
      const indices = mappedHeaders.map(h => originalHeaders.indexOf(h));
      
      let mappedRows = (data.rows || []).map((row: string[]) => 
        indices.map(idx => idx !== -1 ? (row[idx] || "-") : "-")
      );
      
      if (mappedRows.length === 0) {
        mappedRows = [mappedHeaders.map(() => "-")];
      }
      
      setRows(mappedRows);
      
      if (!isAutoFetch) {
        toast.success(`Data fetched successfully! (${mappedRows.length} rows)`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      isFetchingRef.current = false; // Unlock
      setIsFetching(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!configId) return;
    try {
      const res = await fetch(`/api/sheet-importer/get?id=${configId}`);
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setIntervalValue(data.config.intervalValue || 5);
        setIntervalUnit(data.config.intervalUnit || "minutes");
        setIsSyncing(data.config.isSyncing || false);
        
        const newLastSynced = data.config.lastSynced ? new Date(data.config.lastSynced).toISOString() : null;
        setLastSynced(data.config.lastSynced ? new Date(data.config.lastSynced).toLocaleTimeString() : null);
        setLastRunStatus(data.config.lastRunStatus || null);

        if (newLastSynced && newLastSynced !== lastSyncedRef.current) {
          if (lastSyncedRef.current !== null) {
            toast.info("Automatic background fetch detected! Loading data...");
          }
          lastSyncedRef.current = newLastSynced;
          fetchSheetData(data.config, true); 
        } else if (!newLastSynced) {
          lastSyncedRef.current = null;
        }
      } else {
        toast.error("Configuration not found");
        router.push("/dashboard/sheet-sync-list");
      }
    } catch {
      toast.error("Error loading configuration");
    } finally {
      setLoading(false);
    }
  }, [configId, router, fetchSheetData]);

  useEffect(() => {
    fetchConfig();
    const pollInterval = setInterval(fetchConfig, 10000);
    return () => clearInterval(pollInterval);
  }, [fetchConfig]);

  const handleToggleSync = async () => {
    setTogglingSync(true);
    try {
      const res = await fetch("/api/sheet-importer/toggle-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId,
          isSyncing: !isSyncing,
          intervalValue,
          intervalUnit
        }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setIsSyncing(data.config.isSyncing);
        if (data.config.isSyncing) {
          toast.success(`Background sync started! It will run every ${intervalValue} ${intervalUnit}.`);
          lastSyncedRef.current = null;
        } else {
          toast.info("Background sync stopped.");
        }
        fetchConfig();
      } else {
        toast.error(data.error || `Failed to toggle sync. Status: ${res.status}`);
      }
    } catch (err: any) {
      toast.error("Network Error: " + err.message);
    } finally {
      setTogglingSync(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans">
      <Sidebar />
      <div className="md:ml-64 p-4 sm:p-6 lg:p-10 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-lg shadow-blue-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#93C5FD]/40 rounded-full blur-3xl"></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
              <div>
                <Link href="/dashboard/sheet-sync-list" className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 mb-2">
                  <ArrowLeft size={14} /> Back to List
                </Link>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
                  <Database className="w-7 h-7 text-blue-600" /> Manage Sync
                </h1>
                <p className="text-blue-700/80 text-xs sm:text-sm mt-2 font-medium break-all">
                  {config?.name || config?.sheetUrl}
                </p>
              </div>
            </div>
          </div>

          {/* Sync Controls Card */}
          <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 space-y-6 hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6">
              
              <div className="flex-1">
                <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-indigo-500" /> Background Sync Interval
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={isSyncing}
                    className="w-24 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value as any)}
                    disabled={isSyncing}
                    className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  Runs in the background on the server. Tab can be closed.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 lg:w-auto w-full">
                <button
                  onClick={() => fetchSheetData(config, false)}
                  disabled={isFetching}
                  className="flex-1 lg:flex-none px-5 py-3 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw size={16} />}
                  Fetch Once
                </button>

                <button
                  onClick={handleToggleSync}
                  disabled={togglingSync}
                  className={`flex-1 lg:flex-none px-6 py-3 text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 ${
                    isSyncing ? "bg-red-500 hover:bg-red-600" : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  }`}
                >
                  {togglingSync ? <Loader2 className="w-4 h-4 animate-spin" /> : isSyncing ? <Pause size={16} /> : <Play size={16} />}
                  {togglingSync ? "Saving..." : isSyncing ? "Stop Background Sync" : "Start Background Sync"}
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-slate-100 gap-2">
              <div className="flex items-center gap-2">
                {isSyncing ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Background Sync Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg text-xs font-bold border border-slate-200">
                    <span className="w-2 h-2 bg-slate-400 rounded-full"></span> Background Sync Paused
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                {lastSynced && (
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <CheckCircle size={12} className="text-emerald-500" /> Last Synced: {lastSynced}
                  </p>
                )}
                {lastRunStatus && (
                  <p className={`text-[10px] font-medium flex items-center gap-1 ${lastRunStatus.startsWith("Error") ? "text-red-500" : "text-slate-400"}`}>
                    {lastRunStatus.startsWith("Error") && <AlertCircle size={10} />}
                    {lastRunStatus}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Mapped Data Table */}
          <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4">
              <Database size={14} className="text-blue-500" /> Live Data Preview ({rows.length} Rows)
            </label>
            
            {rows.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                <Database className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="font-medium text-slate-500">No data fetched yet</p>
                <p className="text-xs mt-1 text-slate-400">Click &quot;Fetch Once&quot; or start background sync to load data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left text-slate-600">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                    <tr>
                      {tableHeaders.map((h, i) => (
                        <th key={i} className="px-6 py-3 font-bold border-b border-slate-200 whitespace-nowrap">
                          {i === 0 && <User size={10} className="inline mr-1 text-emerald-500" />}
                          {i === 1 && <Phone size={10} className="inline mr-1 text-blue-500" />}
                          {i > 1 && <Tag size={10} className="inline mr-1 text-slate-400" />}
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx} className="bg-white border-b hover:bg-slate-50/50 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className={`px-6 py-3 font-medium ${cIdx === 1 ? 'text-blue-600' : 'text-slate-600'}`}>
                            {cell || <span className="text-slate-300">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen bg-slate-50 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>}>
      <ManageContent />
    </Suspense>
  );
}
