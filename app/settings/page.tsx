/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2, Save, ShieldCheck, Phone, KeyRound, Building2,
  CheckCircle2, XCircle, Eye, Wallet, AlertCircle, IndianRupee,
  ArrowRight, TrendingUp, CreditCard, Info, Users, Clock, PlusCircle, Trash2, Pencil,
} from "lucide-react";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Sidebar from "@/components/Sidebar";

// ✅ Declare FB window object for TypeScript
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [signingUp, setSigningUp] = useState(false);

  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  
  const [balance, setBalance] = useState(0);
  const [totalRecharged, setTotalRecharged] = useState(0);
  const [whatsappNumbers, setWhatsappNumbers] = useState<any[]>([]);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [waNumberLimit, setWaNumberLimit] = useState<any>(null);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newNumName, setNewNumName] = useState("");
  const [newWabaId, setNewWabaId] = useState("");
  const [newPhoneId, setNewPhoneId] = useState("");
  const [newAccessToken, setNewAccessToken] = useState("");

  // ✅ NEW: Google Sheets & Hide Integrations State
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [hideIntegrations, setHideIntegrations] = useState(false);

  const parentTenantName = (session?.user as any)?.parentTenantName;

  const formatINR = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amount);

  const totalSpent = Math.max(Math.round((totalRecharged - balance) * 100) / 100, 0);
  const usagePercent = totalRecharged > 0 ? Math.round((totalSpent / totalRecharged) * 100) : 0;
  const isLowBalance = balance <= 0;

  const fetchSettings = async () => {
    try {
      const [settingsRes, limitsRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/user/limits?resource=whatsappNumbers")
      ]);

      if (settingsRes.status === 401) return;
      const settingsData = await settingsRes.json();
      if (settingsData.success) {
        setBalance(settingsData.settings.balance || 0);
        setTotalRecharged(settingsData.settings.totalRecharged || 0);
        setWhatsappNumbers(settingsData.settings.whatsappNumbers || []);
        setPendingRequest(settingsData.settings.pendingRequest || null);
        
        // ✅ NEW: Set Hide Integrations flag
        setHideIntegrations(settingsData.settings.hideIntegrations || false);
        
        // ✅ NEW: Set Google Sheet URL if exists
        if (settingsData.settings.googleSheetId) {
          setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${settingsData.settings.googleSheetId}/edit`);
        } else {
          setGoogleSheetUrl("");
        }
      }

      if (limitsRes.ok) {
        const limitsData = await limitsRes.json();
        if (limitsData.success) {
          setWaNumberLimit({
            limit: limitsData.limit,
            usage: limitsData.currentUsage || 0,
            remaining: limitsData.remaining,
            allowed: limitsData.allowed,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Automatically open Google Sheet in a new tab after successful connection
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleSuccess = urlParams.get('google_success');

    if (googleSuccess === 'true') {
      // Wait 1 second to ensure settings are fetched and googleSheetUrl is set in state
      setTimeout(() => {
        fetchSettings().then(() => {
          if (googleSheetUrl) {
            window.open(googleSheetUrl, '_blank', 'noopener,noreferrer');
            // Clean the URL to remove ?google_success=true so it doesn't open again on refresh
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        });
      }, 1000);
    }
  }, [googleSheetUrl]);

  useEffect(() => {
    if (status === "authenticated") fetchSettings();
    else if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  // ✅ Load Facebook SDK for Embedded Signup
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_META_APP_ID || "YOUR_META_APP_ID",
        cookie: true,
        xfbml: true,
        version: "v19.0",
      });
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setShowManualForm(false);
    setEditingId(null);
    setNewNumName(""); setNewWabaId(""); setNewPhoneId(""); setNewAccessToken("");
  };

  const handleEditClick = (num: any) => {
    setEditingId(num._id);
    setShowForm(true);
    setShowManualForm(true);
    setNewNumName(num.name || "");
    setNewWabaId(num.wabaId || "");
    setNewPhoneId(num.whatsappPhoneNumberId || "");
    setNewAccessToken("");
  };

  // ✅ HANDLE META EMBEDDED SIGNUP
  const handleEmbeddedSignup = () => {
    if (!window.FB) {
      toast.error("Facebook SDK is still loading. Please wait a few seconds and try again.");
      return;
    }

    setSigningUp(true);

    window.FB.login((response: any) => {
      if (response.authResponse && response.authResponse.code) {
        const code = response.authResponse.code;
        
        fetch("/api/settings/embedded-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            toast.success("WhatsApp number connected successfully!");
            fetchSettings();
          } else {
            toast.error(data.message || "Failed to connect WhatsApp number.");
          }
        })
        .catch(() => toast.error("Error exchanging code."))
        .finally(() => setSigningUp(false));

      } else {
        toast.error("Facebook login was cancelled or failed.");
        setSigningUp(false);
      }
    }, {
      config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID || "YOUR_CONFIG_ID",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
      },
    });
  };

  // ✅ NEW: Handle Google Sheets Connect (POPUP)
  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const res = await fetch("/api/google-sheets/auth");
      const data = await res.json();
      if (data.url) {
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        window.open(
          data.url, 
          "googlePopup", 
          `width=${width},height=${height},top=${top},left=${left}`
        );
      }
    } catch (error) {
      toast.error("Failed to connect Google");
      setConnectingGoogle(false);
    }
  };

  // ✅ NEW: Handle Google Sheets Disconnect
  const handleDisconnectGoogle = async () => {
    if (!window.confirm("Are you sure you want to disconnect Google Sheets? Live campaign updates will stop.")) return;
    
    setDisconnectingGoogle(true);
    try {
      const res = await fetch("/api/google-sheets/auth", { method: "DELETE" });
      const data = await res.json();
      
      if (data.success) {
        toast.success("Google account disconnected.");
        setGoogleSheetUrl(""); // Hide the Open Sheet button immediately
      } else {
        toast.error(data.message || "Failed to disconnect");
      }
    } catch (error) {
      toast.error("Error disconnecting Google account");
    } finally {
      setDisconnectingGoogle(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isEdit = !!editingId;
      const method = isEdit ? "PUT" : "POST";
      const body = isEdit 
        ? { numberId: editingId, name: newNumName, wabaId: newWabaId, whatsappPhoneNumberId: newPhoneId, whatsappAccessToken: newAccessToken }
        : { name: newNumName, wabaId: newWabaId, whatsappPhoneNumberId: newPhoneId, whatsappAccessToken: newAccessToken };

      const res = await fetch("/api/settings", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        resetForm();
        fetchSettings();
      } else {
        toast.error(data.message || "Failed to send request");
      }
    } catch (error) {
      toast.error("Error sending request");
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchNumber = async (numberId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to switch the active WhatsApp number to "${name}"?`)) return;
    
    setSwitchingId(numberId);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numberId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSettings();
      } else {
        toast.error(data.message || "Failed to switch number");
      }
    } catch (error) {
      toast.error("Error switching number");
    } finally {
      setSwitchingId(null);
    }
  };

  const handleDeleteNumber = async (numberId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the number "${name}"?`)) return;

    setDeletingId(numberId);
    try {
      const res = await fetch(`/api/settings?numberId=${numberId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchSettings();
      } else {
        toast.error(data.message || "Failed to delete number");
      }
    } catch (error) {
      toast.error("Error deleting number");
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const isLimitActive = waNumberLimit && waNumberLimit.limit !== -1 && waNumberLimit.limit !== "unlimited";
  const isAtLimit = isLimitActive && !waNumberLimit?.allowed;
  const isPending = pendingRequest?.status === "pending";

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans">
      <Sidebar />
      <div className="ml-0 md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto pb-12">

          {/* HEADER */}
          <div className="mb-8 sm:mb-10">
            <div className="flex items-center gap-3 sm:gap-4 mb-2">
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl sm:rounded-2xl shadow-lg shadow-emerald-200">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
                <p className="text-gray-500 mt-0.5 text-xs sm:text-sm">Manage your WhatsApp API configuration & billing</p>
              </div>
            </div>
          </div>

          {/* BILLING & BALANCE */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-6 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Billing & Balance</h2>
            </div>

            <div className={`relative overflow-hidden rounded-2xl border shadow-sm ${
              isLowBalance ? "border-red-200 bg-white" : "border-emerald-200/60 bg-white"
            }`}>
              <div className={`h-1.5 ${
                isLowBalance ? "bg-gradient-to-r from-red-400 to-red-500" : "bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400"
              }`} />

              <div className="p-4 sm:p-7">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-7">
                  <div className="flex items-center gap-4">
                    <div className={`relative p-3 sm:p-4 rounded-xl sm:rounded-2xl ${
                      isLowBalance ? "bg-gradient-to-br from-red-50 to-red-100/50" : "bg-gradient-to-br from-emerald-50 to-teal-50"
                    }`}>
                      <Wallet className={`w-6 h-6 sm:w-7 sm:h-7 ${isLowBalance ? "text-red-500" : "text-emerald-600"}`} />
                      {balance > 0 && (
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                          <CheckCircle2 size={6} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-widest">Available Balance</p>
                      <p className={`text-2xl sm:text-4xl font-extrabold tracking-tight mt-0.5 ${
                        isLowBalance ? "text-red-700" : "text-emerald-700"
                      }`}>
                        {formatINR(balance)}
                      </p>
                      {parentTenantName && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          <Users size={10} /> Shared wallet from {parentTenantName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    {isLowBalance ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-700 bg-red-50 px-3.5 py-2 rounded-full border border-red-200 shadow-sm">
                        <AlertCircle size={13} /> Insufficient
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3.5 py-2 rounded-full border border-emerald-200 shadow-sm">
                        <CheckCircle2 size={13} /> Active
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                  <div className="relative overflow-hidden p-4 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white">
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp size={12} className="text-blue-500" />
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total In</p>
                      </div>
                      <p className="text-xl font-extrabold text-blue-800">{formatINR(totalRecharged)}</p>
                    </div>
                  </div>
                  <div className="relative overflow-hidden p-4 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-white">
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-2">
                        <CreditCard size={12} className="text-orange-500" />
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Total Spent</p>
                      </div>
                      <p className="text-xl font-extrabold text-orange-800">{formatINR(totalSpent)}</p>
                    </div>
                  </div>
                  <div className={`relative overflow-hidden p-4 rounded-xl border ${
                    isLowBalance ? "border-red-100 bg-gradient-to-br from-red-50/80 to-white" : "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white"
                  }`}>
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Wallet size={12} className={isLowBalance ? "text-red-500" : "text-emerald-500"} />
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isLowBalance ? "text-red-600" : "text-emerald-600"}`}>Remaining</p>
                      </div>
                      <p className={`text-xl font-extrabold ${isLowBalance ? "text-red-800" : "text-emerald-800"}`}>{formatINR(balance)}</p>
                    </div>
                  </div>
                </div>

                {isLowBalance ? (
                  <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-800">No Balance Remaining</p>
                      <p className="text-xs text-red-600 mt-0.5">
                        You cannot send any messages. {parentTenantName ? `Please contact your tenant administrator (${parentTenantName}) to recharge.` : "Please recharge your account."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Balance Active</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Messages will be charged automatically from your balance.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* WHATSAPP NUMBERS MANAGEMENT */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full" />
                <h2 className="text-base sm:text-lg font-bold text-gray-900">WhatsApp Numbers</h2>
              </div>
              {isLimitActive && (
                <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
                  isAtLimit ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-600"
                }`}>
                  {waNumberLimit.usage}/{waNumberLimit.limit} Used
                </span>
              )}
            </div>

            {isPending && (
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Request Sent: Waiting for Response</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your request to modify your WhatsApp numbers is pending admin approval.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {whatsappNumbers.map((num) => (
                <div key={num._id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                  num.isActive ? "border-emerald-300 ring-2 ring-emerald-100" : "border-gray-200"
                }`}>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${num.isActive ? "bg-emerald-100" : "bg-slate-100"}`}>
                          <Phone className={`w-5 h-5 ${num.isActive ? "text-emerald-600" : "text-slate-500"}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">{num.name}</h3>
                          <p className="text-[11px] text-gray-500 font-mono">{num.whatsappPhoneNumberId || "No ID"}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {num.isActive ? (
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                            <CheckCircle2 size={12} /> Active
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSwitchNumber(num._id, num.name)}
                            disabled={switchingId === num._id}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-200 hover:bg-indigo-100 transition-all disabled:opacity-50"
                          >
                            {switchingId === num._id ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                            Use This
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleEditClick(num)}
                          disabled={isPending}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Edit Number"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleDeleteNumber(num._id, num.name)}
                          disabled={deletingId === num._id || isPending}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Number"
                        >
                          {deletingId === num._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-gray-400 font-bold uppercase mb-1 flex items-center gap-1"><Building2 size={12} /> WABA ID</p>
                        <p className="font-mono text-gray-700 truncate">{num.wabaId || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 font-bold uppercase mb-1 flex items-center gap-1"><KeyRound size={12} /> Token</p>
                        <p className="font-mono text-gray-700 flex items-center gap-1">
                          {num.whatsappAccessToken ? <><ShieldCheck size={12} className="text-emerald-500" /> Secured</> : "Missing"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Form Container */}
              {!showForm ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <button
                    onClick={handleEmbeddedSignup}
                    disabled={isAtLimit || isPending || signingUp}
                    className="w-full px-6 py-3.5 bg-[#1877F2] text-white rounded-xl font-bold hover:bg-[#166FE5] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {signingUp ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    {signingUp ? "Connecting..." : "Connect with Meta (Embedded Signup)"}
                  </button>

                  <div className="relative flex items-center my-2">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="px-3 text-xs text-gray-400 font-medium">OR</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                  </div>

                  <button
                    onClick={() => { resetForm(); setShowForm(true); setShowManualForm(true); }}
                    disabled={isAtLimit || isPending}
                    className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAtLimit ? <AlertCircle size={16} /> : <PlusCircle size={16} />}
                    {isAtLimit ? "Number Limit Reached" : isPending ? "Pending Approval..." : "Enter Details Manually"}
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-violet-200 shadow-sm p-5">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      {editingId ? <Pencil size={16} className="text-violet-500" /> : <PlusCircle size={16} className="text-violet-500" />}
                      {editingId ? "Edit WhatsApp Number" : "Add New WhatsApp Number"}
                    </h3>
                    <button onClick={resetForm} className="text-slate-400 hover:text-red-500"><XCircle size={18} /></button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-gray-600 mb-1.5 block">Number Name (e.g. Support Line)</label>
                      <input type="text" value={newNumName} onChange={(e) => setNewNumName(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 mb-1.5 block">WABA ID</label>
                      <input type="text" value={newWabaId} onChange={(e) => setNewWabaId(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-mono" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 mb-1.5 block">Phone Number ID</label>
                      <input type="text" value={newPhoneId} onChange={(e) => setNewPhoneId(e.target.value)} required className="w-full px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-mono" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 mb-1.5 block">Access Token</label>
                      <input 
                        type="password" 
                        value={newAccessToken} 
                        onChange={(e) => setNewAccessToken(e.target.value)} 
                        placeholder={editingId ? "Leave blank to keep current token" : "Paste your EAAxxxxxx token"} 
                        required={!editingId} 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-mono" 
                      />
                    </div>
                    <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
                      {editingId ? "Send Edit for Approval" : "Send for Approval"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* ✅ NEW: INTEGRATIONS (Respects Admin Hide Flag) */}
          {!hideIntegrations && (
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-6 bg-gradient-to-b from-green-500 to-emerald-500 rounded-full" />
                <h2 className="text-base sm:text-lg font-bold text-gray-900">Integrations</h2>
              </div>
              
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-700" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3h-4v4.5h7V4.5A1.5 1.5 0 0021 3h-1.5zM15 21h4.5a1.5 1.5 0 001.5-1.5V15h-7v4.5H15V21zM3 19.5A1.5 1.5 0 004.5 21H9v-4.5H3v3zM3 9h6V3H4.5A1.5 1.5 0 003 4.5V9zm0 4.5h6V9H3v4.5zM13.5 3H9v6h4.5V3zm0 9H9v4.5h4.5V12z"/></svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">Google Sheets (Live Reports)</h3>
                      <p className="text-xs text-gray-500">Automatically export campaign reports to a Google Sheet.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {googleSheetUrl ? (
                      <>
                        <a 
                          href={googleSheetUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-5 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-green-100 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7z"/></svg>
                          Open Sheet
                        </a>
                        <button
                          onClick={handleDisconnectGoogle}
                          disabled={disconnectingGoogle}
                          className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          {disconnectingGoogle ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleConnectGoogle}
                        disabled={connectingGoogle}
                        className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                      >
                        {connectingGoogle ? <Loader2 size={14} className="animate-spin" /> : null}
                        Connect Google Account
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
