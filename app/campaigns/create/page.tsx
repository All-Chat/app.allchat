/* eslint-disable react-hooks/purity */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import {
  Upload, FileSpreadsheet, Clock, Globe, CheckCircle2,
  Users, Sparkles, Send, RotateCcw, AlertCircle,
  FileText, Film, Image as ImageIcon, Loader2, X, Link, Tag as TagIcon,
  Ban,
  Gauge, Infinity as InfinityIcon, // ✅ LIMIT ADDED
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function CreateCampaign() {
  const { data: session, status } = useSession();
  const [templates, setTemplates] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTag, setSelectedTag] = useState("");

  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [rawNumbers, setRawNumbers] = useState<string[]>([]);
  const [rawNames, setRawNames] = useState<string[]>([]);
  const [rawText, setRawText] = useState("");
  const [countryCode, setCountryCode] = useState("91");
  const [campaignName, setCampaignName] = useState("");
  const [variables, setVariables] = useState<string[]>([]);
  const [bodyText, setBodyText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [languageCode, setLanguageCode] = useState("en");

  const [headerFormat, setHeaderFormat] = useState("TEXT");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<any[]>([]);

  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<string[][]>([]);
  const [selectedPhoneCol, setSelectedPhoneCol] = useState<string>("");
  const [selectedNameCol, setSelectedNameCol] = useState<string>("");
  const [uploadStep, setUploadStep] = useState(1);
  const [fileName, setFileName] = useState("");

  const [stats, setStats] = useState({ valid: 0, invalid: 0, duplicates: 0, optedOut: 0 });
  const [optedOutNumbers, setOptedOutNumbers] = useState<string[]>([]);

  const [mediaInputType, setMediaInputType] = useState<"url" | "upload">("url");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  // ✅ LIMIT ADDED: Limit State
  const [campaignLimit, setCampaignLimit] = useState<any>(null);
  const isLimitActive =
    campaignLimit &&
    campaignLimit.limit.period !== "unlimited" &&
    campaignLimit.limit.max !== -1;
  const usagePercent = isLimitActive
    ? Math.min(100, Math.round(((campaignLimit?.usage?.count || 0) / campaignLimit.limit.max) * 100))
    : 0;
  const isAtLimit = isLimitActive && !campaignLimit.allowed;

  useEffect(() => {
    if (status === "authenticated") {
      fetchTemplates();
      fetchTags();
      fetchOptNumbers();
      fetchLimits(); // ✅ LIMIT ADDED
    } else if (status === "unauthenticated") {
      window.location.href = "/signin";
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  // ✅ LIMIT ADDED: Fetch limits
  const fetchLimits = async () => {
    try {
      const res = await fetch("/api/user/limits?resource=campaigns");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCampaignLimit({
            limit: { max: data.limit, period: data.period },
            usage: { count: data.currentUsage || 0, resetAt: null },
            remaining: data.remaining,
            allowed: data.allowed,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch limits", error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/campaigns/templates");
      const data = await res.json();
      if (res.status === 401) {
        window.location.href = "/signin";
        return;
      }
      if (data.success) setTemplates(data.templates);
    } catch (err) {
      console.error("Failed to fetch templates", err);
    }
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

  const fetchOptNumbers = async () => {
    try {
      const res = await fetch("/api/opt-numbers");
      const data = await res.json();
      if (data.numbers) {
        const cleaned = data.numbers.map((n: any) => String(n.phoneNumber).replace(/\D/g, ""));
        setOptedOutNumbers(cleaned);
      }
    } catch (err) {
      console.error("Failed to fetch opt-out numbers", err);
    }
  };

  const handleTagSelect = async (tagName: string) => {
    setSelectedTag(tagName);
    if (!tagName) return;
    try {
      const res = await fetch(`/api/contacts?tag=${encodeURIComponent(tagName)}`);
      const data = await res.json();
      if (data.success && data.contacts.length > 0) {
        const numbers = data.contacts.map((c: any) => c.phone);
        const names = data.contacts.map((c: any) => c.name || "");
        const { finalNumbers, finalNames } = cleanAndValidateNumbers(numbers, names);
        setRawNumbers(finalNumbers);
        setRawNames(finalNames);
        toast.success(`Loaded ${finalNumbers.length} valid numbers from tag: ${tagName}`);
      } else {
        toast.error("No contacts found for this tag");
        setRawNumbers([]);
        setStats({ valid: 0, invalid: 0, duplicates: 0, optedOut: 0 });
      }
    } catch (err) {
      toast.error("Error fetching contacts by tag");
    }
  };

  const handleTemplateSelect = (name: string, langOrPreserved?: string | string[]) => {
    let language: string | undefined;
    let preservedVars: string[] | undefined;

    if (Array.isArray(langOrPreserved)) preservedVars = langOrPreserved;
    else if (typeof langOrPreserved === "string" && langOrPreserved) language = langOrPreserved;

    let tmpl: any;
    if (language) tmpl = templates.find((t: any) => t.name === name && t.language === language);
    else tmpl = templates.find((t: any) => t.name === name);

    if (!tmpl) return;
    setSelectedTemplate(tmpl);

    const headerComp = tmpl.components?.find((c: any) => c.type === "HEADER");
    const hFormat = headerComp?.format || "TEXT";
    setHeaderFormat(hFormat);
    setHeaderText(headerComp?.text || "");

    if (tmpl.language) setLanguageCode(tmpl.language);
    else setLanguageCode("en");

    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(hFormat)) setMediaType(hFormat.toLowerCase());
    else {
      setMediaType("");
      setMediaUrl("");
      clearMediaFile();
    }

    const bodyComp = tmpl.components?.find((c: any) => c.type === "BODY");
    const text = bodyComp?.text || "";
    setBodyText(text);
    const matches = text.match(/\{\{\d+\}\}/g) || [];
    setVariables(matches.map(() => ""));

    const footerComp = tmpl.components?.find((c: any) => c.type === "FOOTER");
    setFooterText(footerComp?.text || "");

    const buttonComps = tmpl.components?.filter((c: any) => c.type === "BUTTON") || [];
    setButtons(buttonComps);
  };

  const replaceVars = (text: string) => {
    let preview = text;
    variables.forEach((v, i) => {
      preview = preview.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`);
    });
    return preview;
  };

  const isObviouslyFakePhone = (phone: string): boolean => {
    const clean = phone.replace(/\+/g, "");
    if (clean.length < 7) return true;
    if (/^(\d)\1+$/.test(clean)) return true;
    if (/^123456/.test(clean)) return true;
    return false;
  };

  const cleanAndValidateNumbers = (nums: string[], names: string[]) => {
    const MAX_LIMIT = 50000;
    const seen = new Set();
    let valid = 0,
      invalid = 0,
      duplicates = 0,
      optedOut = 0;
    const finalNumbers: string[] = [];
    const finalNames: string[] = [];

    for (let index = 0; index < nums.length; index++) {
      const num = nums[index];
      if (!num) continue;
      let clean = String(num).replace(/[^\d+]/g, "");
      if (clean.startsWith("+")) clean = clean.substring(1);
      if (clean.startsWith("0")) clean = clean.substring(1);
      if (!clean.startsWith(countryCode)) clean = countryCode + clean;

      if (optedOutNumbers.includes(clean)) {
        optedOut++;
        continue;
      }

      if (clean.length >= 7 && !isObviouslyFakePhone(clean)) {
        if (seen.has(clean)) {
          duplicates++;
        } else {
          seen.add(clean);
          finalNumbers.push(clean);
          finalNames.push(names[index] || "");
          valid++;

          if (finalNumbers.length >= MAX_LIMIT) {
            toast.error(`Limit of 50,000 numbers reached. Only the first 50,000 will be processed.`);
            break;
          }
        }
      } else {
        invalid++;
      }
    }
    setStats({ valid, invalid, duplicates, optedOut });
    return { finalNumbers, finalNames };
  };

  const handleTextNumbers = () => {
    const lines = rawText
      .split(/[\n,;]+/)
      .map((n) => n.trim())
      .filter((n) => n);
    const { finalNumbers, finalNames } = cleanAndValidateNumbers(lines, lines.map(() => ""));
    setRawNumbers(finalNumbers);
    setRawNames(finalNames);
    if (finalNumbers.length > 0) toast.success(`Parsed ${finalNumbers.length} valid numbers`);
    else toast.error("No valid numbers found");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      let rows: string[][] = [];
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        rows = jsonData
          .map((row: any) => row.map((cell: any) => String(cell || "").trim()))
          .filter((row: string[]) => row.length > 0 && row.some((cell) => cell !== ""));
      } else {
        const text = await file.text();
        rows = text
          .split(/\r?\n/)
          .map((line) => line.split(/[,;\t]/).map((cell) => cell.trim()))
          .filter((row) => row.length > 0 && row[0] !== "");
      }

      if (rows.length === 0) {
        toast.error("File is empty");
        return;
      }

      const MAX_LIMIT = 50000;
      const dataRows = rows.slice(1);

      if (dataRows.length > MAX_LIMIT) {
        toast.error(
          `❌ The file contains ${dataRows.length.toLocaleString()} numbers. The maximum limit is 50,000. Please split your file and try again.`
        );
        setFileName("");
        setFileHeaders([]);
        setFileRows([]);
        setUploadStep(1);
        return;
      }

      setFileHeaders(rows[0]);
      setFileRows(dataRows);
      const phoneCol =
        rows[0].find((h) => /phone|mobile|number|cell|whatsapp/i.test(h)) || rows[0][0];
      const nameCol = rows[0].find((h) => /name|nama|nombre|first/i.test(h)) || "";
      setSelectedPhoneCol(phoneCol);
      setSelectedNameCol(nameCol || "skip");
      setUploadStep(2);
    } catch (err) {
      toast.error("Failed to parse file.");
      setFileName("");
    }
  };

  const processFileColumns = () => {
    if (!selectedPhoneCol || selectedPhoneCol === "skip") {
      toast.error("Select Phone column");
      return;
    }
    const phoneIdx = fileHeaders.indexOf(selectedPhoneCol);
    const nameIdx =
      selectedNameCol && selectedNameCol !== "skip" ? fileHeaders.indexOf(selectedNameCol) : -1;
    const numbers: string[] = [];
    const names: string[] = [];
    fileRows.forEach((row) => {
      numbers.push(row[phoneIdx] || "");
      names.push(nameIdx !== -1 ? row[nameIdx] || "" : "");
    });
    const { finalNumbers, finalNames } = cleanAndValidateNumbers(numbers, names);
    setRawNumbers(finalNumbers);
    setRawNames(finalNames);
    toast.success(`Extracted ${finalNumbers.length} valid numbers`);
  };

  const resetFileUpload = () => {
    setUploadStep(1);
    setFileHeaders([]);
    setFileRows([]);
    setSelectedPhoneCol("");
    setSelectedNameCol("");
    setFileName("");
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
    if (mediaType === "image" || mediaType === "video") setMediaPreview(URL.createObjectURL(file));
    else setMediaPreview(null);
  };

  const clearMediaFile = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  };

  const renderMediaInput = () => {
    if (!mediaType) return null;
    return (
      <div className="space-y-3">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMediaInputType("url");
              clearMediaFile();
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs font-bold transition-all ${
              mediaInputType === "url"
                ? "bg-white shadow-sm text-emerald-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Link size={14} /> URL
          </button>
          <button
            type="button"
            onClick={() => {
              setMediaInputType("upload");
              setMediaUrl("");
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs font-bold transition-all ${
              mediaInputType === "upload"
                ? "bg-white shadow-sm text-emerald-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Upload size={14} /> Upload
          </button>
        </div>
        {mediaInputType === "url" ? (
          <div className="relative">
            {mediaType === "image" && (
              <ImageIcon className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
            )}
            {mediaType === "video" && (
              <Film className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
            )}
            {mediaType === "document" && (
              <FileText className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
            )}
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder={`Direct ${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} URL`}
              disabled={isAtLimit}
              className="w-full pl-10 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        ) : (
          <div>
            {!mediaFile ? (
              <label
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-emerald-50/30 hover:border-emerald-300 transition-all ${
                  isAtLimit ? "opacity-50 pointer-events-none" : "cursor-pointer"
                }`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="mb-1 text-sm text-slate-500 font-medium">
                    Click to upload {mediaType.toLowerCase()}
                  </p>
                  <p className="text-xs text-gray-400">
                    {mediaType === "image" && "PNG, JPG, WEBP up to 5MB"}
                    {mediaType === "video" && "MP4, 3GP up to 5MB"}
                    {mediaType === "document" && "PDF up to 5MB"}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept={
                    mediaType === "image"
                      ? "image/*"
                      : mediaType === "video"
                      ? "video/*"
                      : ".pdf"
                  }
                  onChange={handleMediaFileChange}
                />
              </label>
            ) : (
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-4">
                <button
                  onClick={clearMediaFile}
                  className="absolute top-2 right-2 z-10 p-1 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-red-50 text-slate-600 hover:text-red-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
                {mediaType === "image" && mediaPreview && (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="w-full h-40 object-contain mx-auto rounded-lg"
                  />
                )}
                {mediaType === "video" && mediaPreview && (
                  <video
                    src={mediaPreview}
                    controls
                    className="w-full h-40 object-contain mx-auto bg-black rounded-lg"
                  />
                )}
                {mediaType === "document" && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <FileText className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {mediaFile.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleSave = async (isSchedule: boolean) => {
    if (!campaignName || !selectedTemplate || rawNumbers.length === 0) {
      toast.error("Fill all required fields");
      return;
    }
    if (isAtLimit) {
      toast.error("Campaign limit reached. Contact admin to increase your limit.");
      return;
    }
    if (isSchedule && scheduleDate && new Date(scheduleDate).getTime() < Date.now() + 15 * 60000) {
      toast.error("Schedule 15 mins ahead");
      return;
    }
    if (mediaType && mediaInputType === "url" && !mediaUrl) {
      toast.error("Please enter the media URL");
      return;
    }
    if (mediaType && mediaInputType === "upload" && !mediaFile) {
      toast.error("Please upload the media file");
      return;
    }

    setSaving(true);
    try {
      let res;
      if (mediaInputType === "upload" && mediaFile) {
        const formData = new FormData();
        formData.append("name", campaignName);
        formData.append("templateName", selectedTemplate.name);
        formData.append("templateCategory", selectedTemplate.category);
        formData.append("variables", JSON.stringify(variables));
        formData.append("phoneNumbers", JSON.stringify(rawNumbers));
        formData.append("names", JSON.stringify(rawNames));
        formData.append("mediaType", mediaType);
        formData.append("languageCode", languageCode);
        formData.append("scheduledAt", isSchedule ? scheduleDate : "null");
        formData.append("file", mediaFile);
        res = await fetch("/api/campaigns/save", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/campaigns/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: campaignName,
            templateName: selectedTemplate.name,
            templateCategory: selectedTemplate.category,
            variables,
            phoneNumbers: rawNumbers,
            names: rawNames,
            mediaUrl,
            mediaType,
            languageCode,
            scheduledAt: isSchedule ? scheduleDate : null,
          }),
        });
      }

      if (res.status === 401) {
        toast.error("Session expired.");
        setTimeout(() => (window.location.href = "/signin"), 1500);
        return;
      }

      // ✅ LIMIT ADDED: Handle 429 limit exceeded
      if (res.status === 429) {
        const data429 = await res.json();
        toast.error(data429.message || "Campaign limit reached", { autoClose: 8000 });
        if (data429.limitInfo) {
          setCampaignLimit((prev: any) =>
            prev
              ? {
                  ...prev,
                  allowed: false,
                  usage: { count: data429.limitInfo.currentUsage, resetAt: null },
                  remaining: 0,
                }
              : prev
          );
        }
        setSaving(false);
        return;
      }

      const data = await res.json();
      if (data.success) {
        toast.success(isSchedule ? "Scheduled!" : "Saved!");
        fetchLimits(); // ✅ LIMIT ADDED: Refresh limits
        setTimeout(() => (window.location.href = "/campaigns/list"), 1000);
      } else toast.error(data.message);
    } catch (err) {
      toast.error("Error");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading")
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  if (status === "unauthenticated") return null;

  const previewMediaSrc = mediaInputType === "upload" && mediaPreview ? mediaPreview : mediaUrl;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />
      <div className="md:ml-64 p-4 sm:p-6 lg:p-10 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100 shadow-lg shadow-blue-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#93C5FD]/40 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-16 -left-10 w-40 h-40 bg-white/60 rounded-full blur-2xl"></div>
            <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-blue-900">
                  Create Campaign
                </h1>
                <p className="text-blue-700/80 text-xs sm:text-sm mt-2 font-medium">
                  Set up your audience and broadcast WhatsApp messages instantly.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* ✅ LIMIT ADDED: Badge */}
                {campaignLimit && (
                  <div
                    className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold shrink-0 ${
                      isAtLimit
                        ? "bg-red-50 border-red-200 text-red-700"
                        : usagePercent >= 80
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : isLimitActive
                        ? "bg-white border-slate-200 text-slate-600"
                        : "bg-emerald-50 border-emerald-200 text-emerald-600"
                    }`}
                  >
                    {isLimitActive ? (
                      <>
                        <Gauge size={14} /> {campaignLimit.usage.count}/{campaignLimit.limit.max}{" "}
                        {campaignLimit.limit.period !== "total" && `/${campaignLimit.limit.period}`}
                      </>
                    ) : (
                      <>
                        <InfinityIcon size={14} /> Unlimited
                      </>
                    )}
                  </div>
                )}
                {rawNumbers.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-500 to-sky-600 px-5 sm:px-8 py-2 sm:py-3 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 text-base sm:text-lg font-bold text-white shadow-md shadow-blue-200/60">
                    <Users size={20} /> {rawNumbers.length} Contacts
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ✅ LIMIT ADDED: Warning Bar */}
          {isLimitActive && (
            <div
              className={`rounded-xl p-3 flex items-center gap-3 text-sm border ${
                isAtLimit
                  ? "bg-red-50 border-red-200 text-red-700"
                  : usagePercent >= 80
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-blue-50 border-blue-200 text-blue-600"
              }`}
            >
              {isAtLimit ? (
                <AlertCircle size={16} className="shrink-0" />
              ) : (
                <Gauge size={16} className="shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-bold">
                  {isAtLimit
                    ? "Campaign limit reached!"
                    : usagePercent >= 80
                    ? "Approaching campaign limit"
                    : "Campaign usage"}
                </span>
                <span className="ml-2 opacity-80">
                  {campaignLimit?.usage.count} of {campaignLimit?.limit.max} campaigns used
                  {campaignLimit?.limit.period !== "total" && ` per ${campaignLimit?.limit.period}`}
                </span>
              </div>
              <div className="w-24 h-2 bg-white/60 rounded-full overflow-hidden shrink-0">
                <div
                  className={`h-full rounded-full transition-all ${
                    isAtLimit
                      ? "bg-red-500"
                      : usagePercent >= 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <span className="text-xs font-bold shrink-0">{usagePercent}%</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-10">
            <div className="lg:col-span-2 space-y-6 sm:space-y-8">
              <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 space-y-5 sm:space-y-6 hover:shadow-md transition-shadow">
                <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={14} className="text-emerald-500" /> Campaign Details
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Diwali Dhamaka Offer"
                  disabled={isAtLimit}
                  className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <select
                  value={
                    selectedTemplate
                      ? `${selectedTemplate.name}|${selectedTemplate.language}`
                      : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const [name, lang] = val.split("|");
                    handleTemplateSelect(name, lang);
                  }}
                  disabled={isAtLimit}
                  className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select Template</option>
                  {templates.map((t: any, i: number) => (
                    <option
                      key={`${t.name}-${t.language}-${i}`}
                      value={`${t.name}|${t.language}`}
                    >
                      {t.name} ({t.language || "N/A"})
                    </option>
                  ))}
                </select>

                {selectedTemplate && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                    🌐 Language: <span className="font-bold">{languageCode}</span>
                  </p>
                )}

                {renderMediaInput()}

                {variables.length > 0 && (
                  <div className="space-y-4 pt-5 border-t border-slate-100">
                    <label className="text-[11px] font-extrabold text-slate-700 flex items-center gap-2 uppercase tracking-widest">
                      <Sparkles size={12} className="text-indigo-500" /> Template Variables
                    </label>
                    {variables.map((v, i) => (
                      <div key={i} className="relative">
                        <div className="absolute left-3 top-2.5 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{`{{${i + 1}}}`}</div>
                        <input
                          type="text"
                          value={v}
                          onChange={(e) => {
                            const u = [...variables];
                            u[i] = e.target.value;
                            setVariables(u);
                          }}
                          placeholder="Enter value..."
                          disabled={isAtLimit}
                          className="w-full pl-20 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)] disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedTemplate && (
                <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest mb-5 block">
                    Live Preview
                  </label>
                  <div className="bg-[#efeae2] p-4 rounded-2xl w-full max-w-xs sm:max-w-sm mx-auto shadow-inner border border-slate-200 relative overflow-hidden">
                    <div
                      className="absolute inset-0 opacity-[0.04]"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                      }}
                    ></div>
                    <div className="relative flex justify-end">
                      <div className="bg-white rounded-xl rounded-tr-sm shadow-sm text-sm text-gray-800 leading-relaxed max-w-[95%] overflow-hidden">
                        {mediaType === "image" && (
                          <div className="w-full bg-slate-100">
                            {previewMediaSrc ? (
                              <img
                                src={previewMediaSrc}
                                alt="Preview"
                                className="w-full h-48 object-cover"
                              />
                            ) : (
                              <div className="w-full h-48 flex items-center justify-center text-slate-400">
                                <ImageIcon size={32} />
                              </div>
                            )}
                          </div>
                        )}
                        {mediaType === "video" && (
                          <div className="w-full bg-slate-900 h-48 flex items-center justify-center relative">
                            <Film className="text-white/50" size={32} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-white ml-1"></div>
                              </div>
                            </div>
                          </div>
                        )}
                        {mediaType === "document" && (
                          <div className="w-full bg-slate-100 p-4 flex items-center gap-3">
                            <FileText className="text-red-500" size={28} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">
                                {mediaFile
                                  ? mediaFile.name
                                  : previewMediaSrc
                                  ? previewMediaSrc.split("/").pop()
                                  : "Document.pdf"}
                              </p>
                              <p className="text-[10px] text-slate-500">PDF Document</p>
                            </div>
                          </div>
                        )}
                        <div className="p-3">
                          {headerFormat === "TEXT" && headerText && (
                            <p className="font-bold text-emerald-900 whitespace-pre-wrap mb-1 text-xs sm:text-sm">
                              {replaceVars(headerText)}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-[12px] sm:text-[13px]">
                            {replaceVars(bodyText)}
                          </p>
                          {footerText && (
                            <p className="text-[10px] text-slate-500 mt-2">{footerText}</p>
                          )}
                        </div>
                        {buttons.length > 0 && (
                          <div className="border-t border-slate-100">
                            {buttons.map((btn, i) => (
                              <div
                                key={i}
                                className={`py-2.5 text-center text-emerald-700 font-medium text-xs hover:bg-slate-50 cursor-pointer ${
                                  i < buttons.length - 1 ? "border-b border-slate-100" : ""
                                }`}
                              >
                                {btn.type === "QUICK_REPLY" && btn.text}
                                {btn.type === "URL" && (btn.text || "Visit Link")}
                                {btn.type === "PHONE_NUMBER" && (btn.text || "Call Us")}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-3 pb-2 flex items-center justify-end gap-1 -mt-1">
                          <p className="text-[9px] text-gray-500">12:00 PM</p>
                          <CheckCircle2 size={12} className="text-blue-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-3 space-y-6 sm:space-y-8">
              <div className="bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 space-y-5 sm:space-y-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <label className="text-[11px] font-extrabold text-slate-800 uppercase tracking-widest">
                    Target Audience
                  </label>
                  <div className="relative w-full sm:w-36">
                    <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ""))}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all font-bold shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                    />
                  </div>
                </div>

                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 space-y-2">
                  <label className="text-[11px] font-extrabold text-purple-800 uppercase tracking-widest flex items-center gap-2">
                    <TagIcon size={14} /> Load from Tags
                  </label>
                  <select
                    value={selectedTag}
                    onChange={(e) => handleTagSelect(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-purple-100 focus:border-purple-500 transition-all font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                  >
                    <option value="">-- Select a Tag to Load Contacts --</option>
                    {tags.map((t) => (
                      <option key={t._id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {uploadStep === 1 ? (
                  <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 sm:p-10 text-center hover:bg-emerald-50/30 hover:border-emerald-300 transition-all h-48 sm:h-56 flex flex-col items-center justify-center group cursor-pointer">
                    <input
                      type="file"
                      accept=".csv,.txt,.xlsx,.xls"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300 shadow-sm">
                      <Upload className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600" />
                    </div>
                    <p className="text-sm sm:text-base font-bold text-slate-700">
                      Upload Excel or CSV File
                    </p>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      Supports .xlsx, .xls, .csv, .txt (Max 50k)
                    </p>
                  </div>
                ) : (
                  <div className="border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-emerald-100 shadow-sm min-w-0">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                        <p className="text-sm font-bold text-emerald-900 truncate">{fileName}</p>
                      </div>
                      <button
                        onClick={resetFileUpload}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1.5 hover:underline font-bold bg-red-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                      >
                        <RotateCcw size={12} /> Change
                      </button>
                    </div>
                    <select
                      value={selectedPhoneCol}
                      onChange={(e) => setSelectedPhoneCol(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                    >
                      <option value="skip">-- Select Phone Column --</option>
                      {fileHeaders.map((h, i) => (
                        <option key={i} value={h}>
                          📱 {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedNameCol}
                      onChange={(e) => setSelectedNameCol(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                    >
                      <option value="skip">-- Select Name Column (Optional) --</option>
                      {fileHeaders.map((h, i) => (
                        <option key={i} value={h}>
                          👤 {h}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={processFileColumns}
                      className="w-full px-5 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl text-sm font-bold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md flex items-center justify-center gap-2"
                    >
                      <Sparkles size={16} /> Extract Audience
                    </button>
                  </div>
                )}

                <div className="relative">
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Or manually paste numbers (comma or newline separated)..."
                    className="w-full pl-5 pr-24 sm:pr-28 py-4 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all h-32 text-sm font-mono shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                  />
                  <button
                    onClick={handleTextNumbers}
                    className="absolute right-3 bottom-3 px-4 sm:px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-xs font-bold hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md flex items-center gap-1.5"
                  >
                    <Send size={12} /> Parse
                  </button>
                </div>

                {rawNumbers.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center pt-2">
                    <div className="bg-gradient-to-br from-emerald-50 to-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600">
                        {stats.valid}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-emerald-700 font-bold uppercase tracking-widest mt-1 flex items-center justify-center gap-1">
                        <CheckCircle2 size={10} /> Valid
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-red-100 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-2xl sm:text-3xl font-extrabold text-red-600">
                        {stats.invalid}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-red-700 font-bold uppercase tracking-widest mt-1 flex items-center justify-center gap-1">
                        <AlertCircle size={10} /> Invalid
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-amber-100 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-2xl sm:text-3xl font-extrabold text-amber-600">
                        {stats.duplicates}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-amber-700 font-bold uppercase tracking-widest mt-1 flex items-center justify-center gap-1">
                        <RotateCcw size={10} /> Duplicates
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-slate-100 to-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <p className="text-2xl sm:text-3xl font-extrabold text-slate-600">
                        {stats.optedOut}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-slate-700 font-bold uppercase tracking-widest mt-1 flex items-center justify-center gap-1">
                        <Ban size={10} /> Opted Out
                      </p>
                    </div>
                  </div>
                )}
              </div>

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
                      className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleSave(false)}
                      disabled={saving || isAtLimit}
                      className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-3.5 bg-slate-100 border border-slate-200 rounded-xl font-bold hover:bg-slate-200 flex items-center justify-center gap-2 text-sm transition-colors text-slate-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet size={16} /> Save Draft
                    </button>
                    <button
                      onClick={() => handleSave(true)}
                      disabled={saving || !scheduleDate || isAtLimit}
                      className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-purple-600 flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                      <Clock size={16} /> Schedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
