/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Send, Phone, FileText, Loader2, AlertCircle,
  Image, Video, Upload, X, Variable, Wallet,
  Gauge, Infinity as InfinityIcon, 
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

export default function SendMessagePage() {
  const { data: session, status } = useSession();
  const [phone, setPhone] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [variables, setVariables] = useState<string[]>(["", "", ""]);

  const [headerMediaType, setHeaderMediaType] = useState<"none" | "IMAGE" | "VIDEO" | "DOCUMENT">("none");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const [balance, setBalance] = useState(0);
  const [canSendMessage, setCanSendMessage] = useState(true);

  // ✅ LIMIT ADDED: Limit State
  const [testMessageLimit, setTestMessageLimit] = useState<any>(null);
  const isLimitActive = testMessageLimit && testMessageLimit.limit.period !== "unlimited" && testMessageLimit.limit.max !== -1;
  const usagePercent = isLimitActive ? Math.min(100, Math.round(((testMessageLimit?.usage?.count || 0) / testMessageLimit.limit.max) * 100)) : 0;
  const isAtLimit = isLimitActive && !testMessageLimit.allowed;

  // Check if sub-user to customize messaging
  const parentTenantName = (session?.user as any)?.parentTenantName;

  const formatINR = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);

  const getCategoryColor = (category: string) => {
    switch (category?.toUpperCase()) {
      case "MARKETING":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "UTILITY":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "AUTHENTICATION":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) {
        setBalance(data.billing.balance || 0);
        setCanSendMessage(data.billing.canSendMessage !== false);
      }
    } catch (error) {
      console.error("Failed to fetch billing", error);
    }
  };

  // ✅ LIMIT ADDED: Fetch limits function
  const fetchLimits = async () => {
    try {
      const res = await fetch("/api/user/limits?resource=testMessages");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTestMessageLimit({
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

  useEffect(() => {
    if (status === "authenticated") {
      fetchTemplates();
      fetchBilling();
      fetchLimits(); 
    } else if (status === "unauthenticated") {
      window.location.href = "/signin";
    }
  }, [status]);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/templates");
      if (res.status === 401) {
        window.location.href = "/signin";
        return;
      }
      const data = await res.json();
      if (data.success && data.templates) {
        setTemplates(data.templates);
        if (data.templates.length === 0) toast.info("No approved templates found.");
      } else {
        toast.error("Failed to load templates");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error fetching templates");
    }
    setLoading(false);
  };

  const handleTemplateChange = (compositeValue: string) => {
    if (!compositeValue) {
      setSelectedTemplate(null);
      setHeaderMediaType("none");
      setVariables(["", "", ""]);
      clearMedia();
      return;
    }
    const [name, language] = compositeValue.split("|");
    const template = templates.find(
      (t: any) => t.name === name && t.language === language
    ) || null;
    
    setSelectedTemplate(template);
    setMediaFile(null);
    setMediaPreview(null);

    if (template) {
      const headerComp = template.components?.find((c: any) => c.type === "HEADER");
      if (headerComp && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format)) {
        setHeaderMediaType(headerComp.format);
      } else {
        setHeaderMediaType("none");
      }
      
      if (template.category === "AUTHENTICATION") {
        setVariables([""]);
      } else {
        const bodyComp = template.components?.find((c: any) => c.type === "BODY");
        if (bodyComp?.text) {
          const matches = bodyComp.text.match(/\{\{\d+\}\}/g) || [];
          setVariables(Array(matches.length).fill(""));
        } else {
          setVariables([]);
        }
      }
    } else {
      setHeaderMediaType("none");
      setVariables(["", "", ""]);
    }
  };

  const handleVariableChange = (index: number, value: string) => {
    const updated = [...variables];
    updated[index] = value;
    setVariables(updated);
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds the 5MB limit");
      return;
    }
    setMediaFile(file);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    if (headerMediaType === "IMAGE" || headerMediaType === "VIDEO") {
      setMediaPreview(URL.createObjectURL(file));
    } else {
      setMediaPreview(null);
    }
  };

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
  };

  const sendMessage = async () => {
    if (!phone) {
      toast.error("Please enter a phone number");
      return;
    }
    if (!selectedTemplate) {
      toast.error("Please select a template");
      return;
    }
    if (headerMediaType !== "none" && !mediaFile) {
      toast.error("Please upload the required media file");
      return;
    }
    if (!canSendMessage) {
      toast.error(`Insufficient balance. ${parentTenantName ? `Please contact ${parentTenantName} to recharge.` : "Please recharge your account to send messages."}`);
      return;
    }
    if (isAtLimit) { 
      toast.error("Test message limit reached. Contact admin to increase your limit.");
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append("phone", phone.replace(/\+/g, ""));
      formData.append("templateName", selectedTemplate.name);
      formData.append("languageCode", selectedTemplate.language || "en");
      formData.append("category", selectedTemplate.category || "MARKETING");

      if (variables.length > 0) {
        formData.append("variables", JSON.stringify(variables.filter((v) => v !== "")));
      }

      if (headerMediaType !== "none" && mediaFile) {
        formData.append("headerMediaType", headerMediaType.toLowerCase());
        formData.append("file", mediaFile);
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        body: formData,
      });

      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        setTimeout(() => (window.location.href = "/signin"), 1500);
        return;
      }

      if (res.status === 402) {
        const data402 = await res.json();
        toast.error(data402.message || "Insufficient balance. Please recharge.");
        setCanSendMessage(false);
        fetchBilling();
        return;
      }

      if (res.status === 429) {
        const data429 = await res.json();
        toast.error(data429.message || "Test message limit reached", { autoClose: 8000 });
        if (data429.limitInfo) {
          setTestMessageLimit((prev: any) => prev ? { ...prev, allowed: false, usage: { count: data429.limitInfo.currentUsage, resetAt: null }, remaining: 0 } : prev);
        }
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        const errorMsg =
          data?.message ||
          data?.error?.error?.message ||
          data?.error?.message ||
          "Failed to send message";
        toast.error(errorMsg);
        return;
      }

      toast.success("Message sent successfully! 🚀");

      fetchBilling();
      fetchLimits(); 

      setPhone("");
      setSelectedTemplate(null);
      setHeaderMediaType("none");
      setVariables(["", "", ""]);
      clearMedia();
    } catch (err: any) {
      console.error("CLIENT ERROR:", err);
      toast.error(err.message || "Request failed");
    } finally {
      setSending(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const dropdownValue = selectedTemplate
    ? `${selectedTemplate.name}|${selectedTemplate.language}`
    : "";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">

          {/* PAGE HEADER */}
          <div className="mb-6 sm:mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Send Message
              </h1>
              <p className="text-gray-500 mt-1 text-xs sm:text-sm">
                Deliver approved WhatsApp template messages to your customers instantly.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* ✅ LIMIT ADDED: Badge */}
              {testMessageLimit && (
                <div className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold shrink-0 ${
                  isAtLimit ? "bg-red-50 border-red-200 text-red-700" :
                  usagePercent >= 80 ? "bg-amber-50 border-amber-200 text-amber-700" :
                  isLimitActive ? "bg-white border-slate-200 text-slate-600" :
                  "bg-emerald-50 border-emerald-200 text-emerald-600"
                }`}>
                  {isLimitActive ? (
                    <><Gauge size={14} /> {testMessageLimit.usage.count}/{testMessageLimit.limit.max} {testMessageLimit.limit.period !== "total" && `/${testMessageLimit.limit.period}`}</>
                  ) : (
                    <><InfinityIcon size={14} /> Unlimited</>
                  )}
                </div>
              )}

              {/* BALANCE DISPLAY */}
              <div className={`flex items-center gap-3 px-4 sm:px-5 py-2 sm:py-3 rounded-xl border shadow-sm shrink-0 ${
                !canSendMessage
                  ? "bg-red-50 border-red-200"
                  : "bg-emerald-50 border-emerald-200"
              }`}>
                <Wallet className={`w-4 h-4 sm:w-5 sm:h-5 ${!canSendMessage ? "text-red-500" : "text-emerald-500"}`} />
                <div>
                  <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${
                    !canSendMessage ? "text-red-500" : "text-emerald-600"
                  }`}>Balance</p>
                  <p className={`text-base sm:text-lg font-extrabold ${
                    !canSendMessage ? "text-red-700" : "text-emerald-700"
                  }`}>{formatINR(balance)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ✅ LIMIT ADDED: Warning Bar */}
          {isLimitActive && (
            <div className={`mb-6 rounded-xl p-3 flex items-center gap-3 text-sm border ${
              isAtLimit ? "bg-red-50 border-red-200 text-red-700" :
              usagePercent >= 80 ? "bg-amber-50 border-amber-200 text-amber-700" :
              "bg-blue-50 border-blue-200 text-blue-600"
            }`}>
              {isAtLimit ? <AlertCircle size={16} className="shrink-0" /> : <Gauge size={16} className="shrink-0" />}
              <div className="flex-1">
                <span className="font-bold">
                  {isAtLimit ? "Test message limit reached!" : usagePercent >= 80 ? "Approaching test message limit" : "Test message usage"}
                </span>
                <span className="ml-2 opacity-80">
                  {testMessageLimit?.usage.count} of {testMessageLimit?.limit.max} messages used
                  {testMessageLimit?.limit.period !== "total" && ` per ${testMessageLimit?.limit.period}`}
                </span>
              </div>
              <div className="w-24 h-2 bg-white/60 rounded-full overflow-hidden shrink-0">
                <div className={`h-full rounded-full transition-all ${isAtLimit ? "bg-red-500" : usagePercent >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${usagePercent}%` }} />
              </div>
              <span className="text-xs font-bold shrink-0">{usagePercent}%</span>
            </div>
          )}

          {/* LOW BALANCE WARNING BANNER */}
          {!canSendMessage && (
            <div className="mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Insufficient Balance</p>
                <p className="text-xs text-red-600 mt-0.5">
                  You cannot send messages. {parentTenantName ? `Please contact your tenant administrator (${parentTenantName}) to recharge the account.` : "Please contact your administrator to recharge your account."}
                  {!parentTenantName && <> Go to <a href="/settings" className="underline font-medium">Settings</a> to check your balance.</>}
                </p>
              </div>
            </div>
          )}

          {/* MAIN FORM CARD */}
          <div className="bg-white border border-gray-200 shadow-xl rounded-2xl overflow-hidden">
            {/* Card Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-500 p-5 sm:p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Send className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">WhatsApp Sender</h2>
                  <p className="text-xs sm:text-sm text-green-100">Template-based messaging</p>
                </div>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-5 sm:p-8 space-y-6 sm:space-y-8">
              {/* PHONE INPUT */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  Recipient Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  disabled={isAtLimit} 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-[11px] sm:text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Include country code without + symbol
                </p>
              </div>

              {/* TEMPLATE SELECT */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  Select Template
                </label>
                {loading ? (
                  <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-green-500" />
                    Loading approved templates...
                  </div>
                ) : (
                  <select
                    value={dropdownValue}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    disabled={isAtLimit} 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition appearance-none cursor-pointer shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="" disabled>
                      {templates.length > 0
                        ? "-- Choose an approved template --"
                        : "No approved templates available"}
                    </option>
                    {templates.map((t: any, i: number) => {
                      const headerComp = t.components?.find((c: any) => c.type === "HEADER");
                      const hasMedia = headerComp && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format);
                      const mediaLabel = hasMedia ? ` [${headerComp.format}]` : "";
                      const catLabel = t.category ? ` [${t.category}]` : "";
                      return (
                        <option
                          key={`${t.name}-${t.language}-${i}`}
                          value={`${t.name}|${t.language}`}
                        >
                          {t.name} ({t.language || "N/A"}){mediaLabel}{catLabel}
                        </option>
                      );
                    })}
                  </select>
                )}

                {/* Category Badge + Language Info */}
                {selectedTemplate && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] sm:text-xs text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                      🌐 Language: <span className="font-bold">{selectedTemplate.language || "en"}</span>
                    </span>
                    {selectedTemplate.category && (
                      <span className={`text-[11px] sm:text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${getCategoryColor(selectedTemplate.category)}`}>
                        📋 {selectedTemplate.category}
                      </span>
                    )}
                  </div>
                )}

                {!loading && templates.length === 0 && (
                  <div className="flex items-center gap-2 mt-2 text-yellow-600 text-xs bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>You need an &quot;APPROVED&quot; template to send messages.</span>
                  </div>
                )}
              </div>

              {/* DYNAMIC MEDIA UPLOAD */}
              {headerMediaType !== "none" && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    {headerMediaType === "IMAGE" && <Image className="w-4 h-4 text-blue-500" />}
                    {headerMediaType === "VIDEO" && <Video className="w-4 h-4 text-purple-500" />}
                    {headerMediaType === "DOCUMENT" && <FileText className="w-4 h-4 text-red-500" />}
                    Upload {headerMediaType.charAt(0) + headerMediaType.slice(1).toLowerCase()} Media
                  </label>
                  {!mediaFile ? (
                    <label className={`flex flex-col items-center justify-center w-full h-36 sm:h-40 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition ${isAtLimit ? "opacity-50 pointer-events-none" : ""}`}>
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="mb-1 text-sm text-gray-500 font-medium text-center">
                          Click to upload {headerMediaType.toLowerCase()}
                        </p>
                        <p className="text-xs text-gray-400 text-center">
                          {headerMediaType === "IMAGE" && "PNG, JPG, WEBP up to 5MB"}
                          {headerMediaType === "VIDEO" && "MP4, 3GP up to 5MB"}
                          {headerMediaType === "DOCUMENT" && "PDF up to 5MB"}
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept={
                          headerMediaType === "IMAGE" ? "image/*" :
                            headerMediaType === "VIDEO" ? "video/*" :
                              ".pdf"
                        }
                        onChange={handleMediaChange}
                      />
                    </label>
                  ) : (
                    <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                      <button
                        onClick={clearMedia}
                        className="absolute top-2 right-2 z-10 p-1 bg-white/80 backdrop-blur-sm rounded-full shadow-md hover:bg-red-50 text-gray-600 hover:text-red-600 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {headerMediaType === "IMAGE" && mediaPreview && (
                        <img src={mediaPreview} alt="Upload Preview" className="w-full h-48 object-contain mx-auto" />
                      )}
                      {headerMediaType === "VIDEO" && mediaPreview && (
                        <video src={mediaPreview} controls className="w-full h-48 object-contain mx-auto bg-black" />
                      )}
                      {headerMediaType === "DOCUMENT" && (
                        <div className="flex items-center gap-3 p-4">
                          <div className="p-3 bg-red-100 rounded-lg">
                            <FileText className="w-6 h-6 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{mediaFile.name}</p>
                            <p className="text-xs text-gray-500">{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* DYNAMIC VARIABLES INPUT */}
              {selectedTemplate && variables.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Variable className="w-4 h-4 text-gray-400" />
                    {selectedTemplate.category === "AUTHENTICATION" ? "OTP Code" : "Template Variables"}
                  </label>
                  <div className="space-y-3">
                    {variables.map((v, i) => (
                      <input
                        key={i}
                        type="text"
                        placeholder={selectedTemplate.category === "AUTHENTICATION" ? "Enter OTP Code (e.g. 1234)" : `Variable {{${i + 1}}}`}
                        value={v}
                        onChange={(e) => handleVariableChange(i, e.target.value)}
                        disabled={isAtLimit} 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition shadow-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* SEND BUTTON */}
              <div className="pt-2 sm:pt-4">
                <button
                  onClick={sendMessage}
                  disabled={sending || loading || templates.length === 0 || !canSendMessage || isAtLimit} 
                  className={`w-full flex items-center justify-center gap-2 px-4 sm:px-6 py-3.5 sm:py-4 font-bold rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-green-500/20 disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base ${
                    isAtLimit
                      ? "bg-slate-400 text-white"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending Message...
                    </>
                  ) : isAtLimit ? ( 
                    <>
                      <AlertCircle className="w-5 h-5" />
                      Limit Reached — Contact Admin
                    </>
                  ) : !canSendMessage ? (
                    <>
                      <AlertCircle className="w-5 h-5" />
                      Insufficient Balance — Recharge to Send
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Send WhatsApp Message
                    </>
                  )}
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
