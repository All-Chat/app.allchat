/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  FileSpreadsheet, Link as LinkIcon, RefreshCw, PlusCircle, Save,
  CheckCircle, X, Tag, Database, Loader2, Eye, ArrowLeft
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

export default function SheetSyncManager() {
  const router = useRouter();
  const { status } = useSession();
  
  const [sheetName, setSheetName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  const [nameField, setNameField] = useState("skip");
  const [numberField, setNumberField] = useState("skip");
  const [additionalFields, setAdditionalFields] = useState<string[]>([]);

  const handleFetchData = async () => {
    if (!sheetUrl) {
      toast.error("Please enter a Google Sheet URL.");
      return;
    }

    setFetching(true);
    setHeaders([]);
    setRows([]);
    setNameField("skip");
    setNumberField("skip");
    setAdditionalFields([]);

    try {
      const res = await fetch("/api/sheet-importer/fetch-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to fetch data");
      
      setHeaders(data.headers);
      setRows(data.rows);
      toast.success("Sheet data fetched successfully!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFetching(false);
    }
  };

  const addAdditionalField = () => {
    setAdditionalFields([...additionalFields, "skip"]);
  };

  const removeAdditionalField = (index: number) => {
    setAdditionalFields(additionalFields.filter((_, i) => i !== index));
  };

  const updateAdditionalField = (index: number, value: string) => {
    const newArr = [...additionalFields];
    newArr[index] = value;
    setAdditionalFields(newArr);
  };

  const handleSaveConfig = async () => {
    if (!sheetName) {
      toast.error("Please enter a Sheet Name.");
      return;
    }
    if (nameField === "skip" || numberField === "skip") {
      toast.error("Please select both Name and Number fields.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/sheet-importer/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl, nameField, numberField, additionalFields, name: sheetName }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to save configuration");

      toast.success("Configuration saved successfully!");
      
      // Reset form
      setHeaders([]);
      setRows([]);
      setSheetUrl("");
      setSheetName("");
      setNameField("skip");
      setNumberField("skip");
      setAdditionalFields([]);

      // Redirect to list page after 1 second
      setTimeout(() => {
        router.push("/dashboard/sheet-sync-list");
      }, 1000);

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

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
      <div className="md:ml-64 p-4 sm:p-6 lg:p-10 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-lg shadow-blue-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#93C5FD]/40 rounded-full blur-3xl"></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
                  <Database className="w-7 h-7 text-blue-600" /> Google Sheet Sync
                </h1>
                <p className="text-blue-700/80 text-xs sm:text-sm mt-2 font-medium">
                  Fetch data from your Google Sheet, map the fields, and save the configuration securely.
                </p>
              </div>
            </div>
          </div>

          {/* Fetch URL & Name Card */}
          <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 space-y-5 hover:shadow-md transition-shadow">
            
            <div>
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <Tag size={14} className="text-emerald-500" /> Sheet Name
              </label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="e.g. Diwali Leads Sheet"
                className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
              />
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <LinkIcon size={14} className="text-emerald-500" /> Enter Google Sheet URL
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                />
                <button
                  onClick={handleFetchData}
                  disabled={fetching}
                  className="px-6 py-3.5 bg-gradient-to-r from-blue-500 to-sky-600 text-white rounded-xl font-bold hover:from-blue-600 hover:to-sky-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw size={16} />}
                  {fetching ? "Fetching..." : "Fetch Data"}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Eye size={12} /> Make sure your sheet sharing is set to &quot;Anyone with the link - Viewer&quot;.
              </p>
            </div>
          </div>

          {/* Table Preview & Mapping (Shows only if data is fetched) */}
          {headers.length > 0 && (
            <>
              {/* Mapping Card */}
              <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 space-y-5 hover:shadow-md transition-shadow">
                <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Tag size={14} className="text-indigo-500" /> Map Your Fields
                </label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select
                    value={nameField}
                    onChange={(e) => setNameField(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-medium"
                  >
                    <option value="skip">-- Select Name Column --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>👤 {h}</option>
                    ))}
                  </select>

                  <select
                    value={numberField}
                    onChange={(e) => setNumberField(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-medium"
                  >
                    <option value="skip">-- Select Number Column --</option>
                    {headers.map((h, i) => (
                      <option key={i} value={h}>📱 {h}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 mt-2 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <PlusCircle size={12} className="text-emerald-500" /> Additional Fields
                    </p>
                    <button
                      type="button"
                      onClick={addAdditionalField}
                      className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5 font-bold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <PlusCircle size={12} /> Add Field
                    </button>
                  </div>
                  
                  {additionalFields.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic pl-1">
                      Click &quot;Add Field&quot; to fetch more columns from your sheet (e.g. Email, City, etc.).
                    </p>
                  )}

                  {additionalFields.map((field, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={field}
                        onChange={(e) => updateAdditionalField(i, e.target.value)}
                        className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-medium"
                      >
                        <option value="skip">-- Select Additional Column {i + 1} --</option>
                        {headers.map((h, idx) => (
                          <option key={idx} value={h}>📋 {h}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeAdditionalField(i)}
                        className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-colors"
                        title="Remove field"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <FileSpreadsheet size={14} className="text-blue-500" /> Data Preview (First {rows.length} Rows)
                </label>
                
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm text-left text-slate-600">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} className="px-6 py-3 font-bold border-b border-slate-200 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rIdx) => (
                        <tr key={rIdx} className="bg-white border-b hover:bg-slate-50/50 transition-colors">
                          {headers.map((_, cIdx) => (
                            <td key={cIdx} className="px-6 py-3 font-medium text-slate-500">
                              {row[cIdx] || <span className="text-slate-300">-</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pb-10">
                <button
                  onClick={handleSaveConfig}
                  disabled={saving || nameField === "skip" || numberField === "skip" || !sheetName}
                  className="px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                  {saving ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
