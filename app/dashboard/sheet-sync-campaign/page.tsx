/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import {
  ArrowLeft, Save, Clock, Loader2, Database, FileSpreadsheet, 
  Tag, Link as LinkIcon, Sparkles, Image as ImageIcon, Film, FileText, Upload, X
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function CreateSheetCampaign() {
  const router = useRouter();
  const { status } = useSession();
  const [configs, setConfigs] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  
  const [name, setName] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [variableMappings, setVariableMappings] = useState<string[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("");
  
  const [scheduleDate, setScheduleDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [mediaInputType, setMediaInputType] = useState<"url" | "upload">("url");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [configRes, tplRes] = await Promise.all([
        fetch("/api/sheet-importer/list"),
        fetch("/api/campaigns/templates")
      ]);
      
      const configData = await configRes.json();
      if (configData.success) setConfigs(configData.configs);

      const tplData = await tplRes.json();
      if (tplData.success) setTemplates(tplData.templates);

    } catch (error) {
      toast.error("Failed to load initial data");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status]);

  useEffect(() => {
    if (selectedConfigId) {
      const c = configs.find(c => c._id === selectedConfigId);
      setSelectedConfig(c);
    } else {
      setSelectedConfig(null);
    }
  }, [selectedConfigId]);

  const handleTemplateSelect = (name: string, lang: string) => {
    const tmpl = templates.find((t: any) => t.name === name && t.language === lang);
    if (!tmpl) return;
    setSelectedTemplate(tmpl);

    const headerComp = tmpl.components?.find((c: any) => c.type === "HEADER");
    const hFormat = headerComp?.format || "TEXT";
    
    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(hFormat)) {
      setMediaType(hFormat.toLowerCase());
    } else {
      setMediaType("");
      setMediaUrl("");
      setMediaFile(null);
    }

    const bodyComp = tmpl.components?.find((c: any) => c.type === "BODY");
    const text = bodyComp?.text || "";
    const varCount = (text.match(/\{\{\d+\}\}/g) || []).length;
    setVariables(Array(varCount).fill(""));
    setVariableMappings(Array(varCount).fill("skip"));
  };

  const getMappedHeaders = () => {
    if (!selectedConfig) return [];
    return [selectedConfig.nameField, selectedConfig.numberField, ...(selectedConfig.additionalFields || [])];
  };

  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds the 5MB limit");
      return;
    }
    setMediaFile(file);
    setMediaUrl("");
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(URL.createObjectURL(file));
  };

  const clearMediaFile = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  };

  const handleSave = async (isSchedule: boolean) => {
    if (!name || !selectedConfigId || !selectedTemplate) {
      toast.error("Fill all required fields");
      return;
    }
    if (isSchedule && !scheduleDate) {
      toast.error("Please select a schedule date");
      return;
    }
    if (mediaType && mediaInputType === "url" && !mediaUrl) {
      toast.error("Please enter a media URL");
      return;
    }
    if (mediaType && mediaInputType === "upload" && !mediaFile) {
      toast.error("Please upload a media file");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("sheetConfigId", selectedConfigId);
      formData.append("templateName", selectedTemplate.name);
      formData.append("languageCode", selectedTemplate.language || "en");
      formData.append("templateCategory", selectedTemplate.category || "MARKETING");
      formData.append("variableMappings", JSON.stringify(variableMappings));
      formData.append("mediaType", mediaType);
      formData.append("mediaUrl", mediaUrl);
      formData.append("status", isSchedule ? "scheduled" : "saved");
      formData.append("scheduledAt", scheduleDate);
      
      if (mediaFile) {
        formData.append("file", mediaFile);
      }

      const res = await fetch("/api/sheet-campaigns/save", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(isSchedule ? "Scheduled Successfully!" : "Draft Saved Successfully!");
        router.push("/dashboard/sheet-sync-campaign/list");
      } else {
        toast.error(data.error || "Failed to save campaign");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loadingData) {
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
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-lg shadow-blue-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#93C5FD]/40 rounded-full blur-3xl"></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
              <div>
                <Link href="/dashboard/sheet-sync-campaign/list" className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 mb-2">
                  <ArrowLeft size={14} /> Back to Campaigns
                </Link>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-900 flex items-center gap-2">
                  <Sparkles className="w-7 h-7 text-blue-600" /> Create Sheet Campaign
                </h1>
                <p className="text-blue-700/80 text-xs sm:text-sm mt-2 font-medium">
                  Send WhatsApp templates directly to your synced Google Sheet contacts.
                </p>
              </div>
            </div>
          </div>

          {/* Selection Cards */}
          <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 space-y-6 hover:shadow-md transition-shadow">
            
            {/* 1. Campaign Name */}
            <div>
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <Tag size={14} className="text-emerald-500" /> Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Diwali Dhamaka Offer"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all font-medium"
              />
            </div>

            {/* 2. Select Sheet Config */}
            <div>
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <Database size={14} className="text-emerald-500" /> Select Sheet Configuration
              </label>
              <select
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-medium"
              >
                <option value="">-- Choose a Saved Sheet --</option>
                {configs.map((c) => (
                  <option key={c._id} value={c._id}>
                    {/* ✅ Show Sheet Name instead of URL */}
                    {c.name} ({c.nameField} / {c.numberField})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Select Template */}
            <div>
              <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
                <FileSpreadsheet size={14} className="text-indigo-500" /> Select WhatsApp Template
              </label>
              <select
                value={selectedTemplate ? `${selectedTemplate.name}|${selectedTemplate.language}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const [name, lang] = val.split("|");
                  handleTemplateSelect(name, lang);
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all font-medium"
              >
                <option value="">-- Choose a Template --</option>
                {templates.map((t: any, i: number) => (
                  <option key={`${t.name}-${t.language}-${i}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language || "N/A"})
                  </option>
                ))}
              </select>
            </div>

            {/* Template Details (Language & Type) */}
            {selectedTemplate && (
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-50 text-slate-600 border-slate-200">
                  🌐 Language: {selectedTemplate.language || "en"}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  selectedTemplate.category === "MARKETING" ? "bg-orange-50 text-orange-700 border-orange-200" :
                  selectedTemplate.category === "UTILITY" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  "bg-purple-50 text-purple-700 border-purple-200"
                }`}>
                  📋 Type: {selectedTemplate.category || "MARKETING"}
                </span>
              </div>
            )}

            {/* 4. Map Variables */}
            {variables.length > 0 && selectedConfig && (
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={12} className="text-purple-500" /> Map Template Variables
                </label>
                {variables.map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">{`{{${i + 1}}}`}</span>
                    <select
                      value={variableMappings[i] || "skip"}
                      onChange={(e) => {
                        const newArr = [...variableMappings];
                        newArr[i] = e.target.value;
                        setVariableMappings(newArr);
                      }}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-purple-100 focus:border-purple-500 transition-all font-medium"
                    >
                      <option value="skip">-- Select Column --</option>
                      {getMappedHeaders().map((h, idx) => (
                        <option key={idx} value={h}>📋 {h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* 5. Media Input */}
            {mediaType && (
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-1">
                  {mediaType === "image" && <ImageIcon size={12} className="text-blue-500" />}
                  {mediaType === "video" && <Film size={12} className="text-blue-500" />}
                  {mediaType === "document" && <FileText size={12} className="text-blue-500" />}
                  Media ({mediaType})
                </label>
                
                <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => { setMediaInputType("url"); clearMediaFile(); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs font-bold transition-all ${
                      mediaInputType === "url" ? "bg-white shadow-sm text-emerald-700" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <LinkIcon size={14} /> URL
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMediaInputType("upload"); setMediaUrl(""); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs font-bold transition-all ${
                      mediaInputType === "upload" ? "bg-white shadow-sm text-emerald-700" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Upload size={14} /> Upload
                  </button>
                </div>

                {mediaInputType === "url" ? (
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="url"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder={`Direct ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} URL`}
                      className="w-full pl-10 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 focus:bg-white transition-all text-sm font-medium"
                    />
                  </div>
                ) : (
                  <div>
                    {!mediaFile ? (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-emerald-50/30 hover:border-emerald-300 transition-all cursor-pointer">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 text-slate-400 mb-2" />
                          <p className="mb-1 text-sm text-slate-500 font-medium">
                            Click to upload {mediaType}
                          </p>
                          <p className="text-xs text-gray-400">
                            {mediaType === "image" && "PNG, JPG, WEBP up to 5MB"}
                            {mediaType === "video" && "MP4, 3GP up to 5MB"}
                            {mediaType === "document" && "PDF up to 5MB"}
                          </p>
                        </div>
                        <input type="file" className="hidden" accept={mediaType === "image" ? "image/*" : mediaType === "video" ? "video/*" : ".pdf"} onChange={handleMediaFileChange} />
                      </label>
                    ) : (
                      <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-4">
                        <button onClick={clearMediaFile} className="absolute top-2 right-2 z-10 p-1 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-red-50 text-slate-600 hover:text-red-600 transition">
                          <X className="w-4 h-4" />
                        </button>
                        {mediaType === "image" && mediaPreview && (
                          <img src={mediaPreview} alt="Preview" className="w-full h-40 object-contain mx-auto rounded-lg" />
                        )}
                        {mediaType === "video" && mediaPreview && (
                          <video src={mediaPreview} controls className="w-full h-40 object-contain mx-auto bg-black rounded-lg" />
                        )}
                        {mediaType === "document" && (
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-100 rounded-lg">
                              <FileText className="w-6 h-6 text-red-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{mediaFile.name}</p>
                              <p className="text-xs text-slate-500">{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Schedule & Save Buttons */}
          <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex flex-col gap-6">
              <div className="w-full">
                <label className="text-[11px] font-extrabold text-slate-800 flex items-center gap-2 uppercase tracking-widest mb-2">
                  <Clock size={14} className="text-indigo-500" /> Schedule Campaign (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date(Date.now() + 15 * 60000).toISOString().slice(0, 16)}
                  className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all text-sm font-medium"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-3.5 bg-slate-100 border border-slate-200 rounded-xl font-bold hover:bg-slate-200 flex items-center justify-center gap-2 text-sm transition-colors text-slate-700 shadow-sm disabled:opacity-40"
                >
                  <Save size={16} /> Save Draft
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || !scheduleDate}
                  className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-purple-600 flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />} Schedule Campaign
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
