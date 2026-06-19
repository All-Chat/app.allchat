/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2, Save, ShieldCheck, Phone, KeyRound, Building2,
  CheckCircle2, XCircle, Eye, Wallet, AlertCircle, IndianRupee,
  ArrowRight, TrendingUp, CreditCard, Info, Users,
} from "lucide-react";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Sidebar from "@/components/Sidebar";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [hasRealToken, setHasRealToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState(0);
  const [totalRecharged, setTotalRecharged] = useState(0);

  // Check if sub-user
  const parentTenantName = (session?.user as any)?.parentTenantName;

  const formatINR = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);

  const totalSpent = Math.max(Math.round((totalRecharged - balance) * 100) / 100, 0);
  const usagePercent = totalRecharged > 0 ? Math.round((totalSpent / totalRecharged) * 100) : 0;
  const isLowBalance = balance <= 0;

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.status === 401) return;
      const data = await res.json();
      if (data.success) {
        setWabaId(data.settings.wabaId);
        setPhoneNumberId(data.settings.whatsappPhoneNumberId);
        setAccessToken(data.settings.whatsappAccessToken);
        setHasRealToken(data.settings.hasRealToken);
        setBalance(data.settings.balance || 0);
        setTotalRecharged(data.settings.totalRecharged || 0);
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") fetchSettings();
    else if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wabaId,
          whatsappPhoneNumberId: phoneNumberId,
          whatsappAccessToken: accessToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Settings saved successfully!");
        fetchSettings();
      } else {
        toast.error(data.message || "Failed to save settings");
      }
    } catch (error) {
      toast.error("Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const isFullyConfigured = wabaId && phoneNumberId && hasRealToken;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans">
      <Sidebar />
      
      {/* Responsive Margin and Padding */}
      <div className="ml-0 md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto pb-12">

          {/* ============================
              HEADER
              ============================ */}
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

          {/* ============================
              1. BILLING & BALANCE
              ============================ */}
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
                {/* Top: Balance + Status */}
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

                {/* Three Metric Cards - Responsive Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                  {/* Total Recharged */}
                  <div className="relative overflow-hidden p-4 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white">
                    <div className="absolute -top-2 -right-2 w-12 h-12 bg-blue-100/40 rounded-full blur-lg" />
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-2">
                        <TrendingUp size={12} className="text-blue-500" />
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total In</p>
                      </div>
                      <p className="text-xl font-extrabold text-blue-800">{formatINR(totalRecharged)}</p>
                    </div>
                  </div>

                  {/* Total Spent */}
                  <div className="relative overflow-hidden p-4 rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-white">
                    <div className="absolute -top-2 -right-2 w-12 h-12 bg-orange-100/40 rounded-full blur-lg" />
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-2">
                        <CreditCard size={12} className="text-orange-500" />
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Total Spent</p>
                      </div>
                      <p className="text-xl font-extrabold text-orange-800">{formatINR(totalSpent)}</p>
                    </div>
                  </div>

                  {/* Remaining */}
                  <div className={`relative overflow-hidden p-4 rounded-xl border ${
                    isLowBalance ? "border-red-100 bg-gradient-to-br from-red-50/80 to-white" : "border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white"
                  }`}>
                    <div className={`absolute -top-2 -right-2 w-12 h-12 rounded-full blur-lg ${
                      isLowBalance ? "bg-red-100/40" : "bg-emerald-100/40"
                    }`} />
                    <div className="relative">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Wallet size={12} className={isLowBalance ? "text-red-500" : "text-emerald-500"} />
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isLowBalance ? "text-red-600" : "text-emerald-600"}`}>Remaining</p>
                      </div>
                      <p className={`text-xl font-extrabold ${isLowBalance ? "text-red-800" : "text-emerald-800"}`}>{formatINR(balance)}</p>
                    </div>
                  </div>
                </div>

                {/* Usage Progress Bar */}
                {totalRecharged > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">Credit Usage</span>
                      <span className={`text-xs font-bold ${
                        usagePercent > 90 ? "text-red-600" : usagePercent > 70 ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {usagePercent}% used
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-700 ${
                          usagePercent > 90
                            ? "bg-gradient-to-r from-red-400 to-red-500"
                            : usagePercent > 70
                              ? "bg-gradient-to-r from-amber-400 to-amber-500"
                              : "bg-gradient-to-r from-emerald-400 to-teal-500"
                        }`}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                        Left: {formatINR(balance)}
                      </span>
                      <span className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                        Spent: {formatINR(totalSpent)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Status Messages */}
                {isLowBalance ? (
                  <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <div className="p-1.5 bg-red-100 rounded-lg shrink-0">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-800">No Balance Remaining</p>
                      <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                        You cannot send any messages. {parentTenantName ? `Please contact your tenant administrator (${parentTenantName}) to recharge the account.` : "Please contact your administrator to recharge your account."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <div className="p-1.5 bg-emerald-100 rounded-lg shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Balance Active</p>
                      <p className="text-xs text-emerald-600 mt-0.5 leading-relaxed">
                        Your account is funded and ready. Messages will be charged automatically from your balance on each successful delivery.
                      </p>
                    </div>
                  </div>
                )}

                {balance === 0 && totalRecharged === 0 && (
                  <div className="mt-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <div className="p-1.5 bg-amber-100 rounded-lg shrink-0">
                      <Info className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-amber-800">Get Started</p>
                      <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                        Your account has not been recharged yet. {parentTenantName ? `Contact your tenant administrator (${parentTenantName}) to add credits.` : "Contact your administrator to add credits and start sending messages."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ============================
              2. CURRENT CONFIGURATION
              ============================ */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full" />
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Current Configuration</h2>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-7 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isFullyConfigured ? "bg-emerald-100" : "bg-amber-100"}`}>
                    <Eye className={`w-4 h-4 ${isFullyConfigured ? "text-emerald-600" : "text-amber-600"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">Live Status</p>
                    <p className="text-[11px] text-gray-500 hidden sm:block">Connected account overview</p>
                  </div>
                </div>
                {isFullyConfigured ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 sm:px-3.5 rounded-full border border-emerald-200 shadow-sm">
                    <CheckCircle2 size={13} /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-3 py-1.5 sm:px-3.5 rounded-full border border-amber-200 shadow-sm">
                    <XCircle size={13} /> Incomplete
                  </span>
                )}
              </div>

              <div className="divide-y divide-gray-50">
                <div className="px-4 sm:px-7 py-4 flex items-center justify-between group hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3 sm:gap-3.5">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Building2 size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">WABA ID</p>
                      <p className={`text-sm font-medium font-mono mt-0.5 ${wabaId ? "text-gray-900" : "text-gray-300 italic"}`}>
                        {wabaId || "Not configured"}
                      </p>
                    </div>
                  </div>
                  {wabaId && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                </div>

                <div className="px-4 sm:px-7 py-4 flex items-center justify-between group hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3 sm:gap-3.5">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Phone size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Phone Number ID</p>
                      <p className={`text-sm font-medium font-mono mt-0.5 ${phoneNumberId ? "text-gray-900" : "text-gray-300 italic"}`}>
                        {phoneNumberId || "Not configured"}
                      </p>
                    </div>
                  </div>
                  {phoneNumberId && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                </div>

                <div className="px-4 sm:px-7 py-4 flex items-center justify-between group hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-3 sm:gap-3.5">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <KeyRound size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Access Token</p>
                      <p className={`text-sm font-medium mt-0.5 flex items-center gap-1.5 ${
                        hasRealToken ? "text-emerald-600" : "text-red-500"
                      }`}>
                        {hasRealToken ? (
                          <><ShieldCheck size={14} /> Secured</>
                        ) : (
                          <><XCircle size={14} /> Missing</>
                        )}
                      </p>
                    </div>
                  </div>
                  {hasRealToken && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                </div>
              </div>
            </div>
          </div>

          {/* ============================
              3. UPDATE CONFIGURATION
              ============================ */}
          <div className="mb-6 sm:mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-6 bg-gradient-to-b from-violet-500 to-purple-500 rounded-full" />
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Update Configuration</h2>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-7 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-100 flex items-center gap-3">
                <div className="p-2.5 bg-violet-100 rounded-xl">
                  <Building2 className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Meta Developer Credentials</p>
                  <p className="text-[11px] text-gray-500 hidden sm:block">Modify your API configuration below</p>
                </div>
              </div>

              <form onSubmit={handleSave} className="p-4 sm:p-7 space-y-6 sm:space-y-7">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Building2 size={14} className="text-gray-400" />
                    WhatsApp Business Account ID
                  </label>
                  <input
                    type="text"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    placeholder="e.g., 102938475610"
                    className="w-full px-4 py-3 bg-slate-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
                  />
                  <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                    <Info size={11} /> Meta Dashboard → WhatsApp → API Setup → Business Account ID
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Phone size={14} className="text-gray-400" />
                    Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="e.g., 108219xxxxxxxxxx"
                    className="w-full px-4 py-3 bg-slate-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
                  />
                  <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                    <Info size={11} /> Meta Dashboard → WhatsApp → API Setup → From Phone Number ID
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <KeyRound size={14} className="text-gray-400" />
                    Permanent Access Token
                  </label>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={hasRealToken ? "Leave blank to keep current token" : "Paste your EAAxxxxxx token"}
                    className="w-full px-4 py-3 bg-slate-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all text-sm shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)]"
                  />
                  <p className="text-[11px] mt-2">
                    {hasRealToken ? (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <ShieldCheck size={11} /> Token is securely saved. Paste a new one only to update.
                      </span>
                    ) : (
                      <span className="text-gray-400">Required to send messages on your behalf.</span>
                    )}
                  </p>
                </div>

                {/* Responsive Button Layout */}
                <div className="pt-5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[11px] text-gray-400 text-center sm:text-left">
                    Changes take effect immediately after saving
                  </p>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl shadow-md shadow-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-emerald-200/50"
                  >
                    {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                    {saving ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ============================
              INFO BOX
              ============================ */}
          <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl flex gap-4">
            <div className="p-2.5 bg-blue-100 rounded-xl shrink-0">
              <ShieldCheck size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-blue-900 text-sm mb-1.5">Secure & Multi-Tenant</p>
              <p className="text-blue-700 text-xs leading-relaxed">
                Your credentials are encrypted in the database and uniquely linked to your account. When a customer replies to your number, the system automatically routes the message to your dashboard using your Phone Number ID. Messaging costs are deducted per successful delivery from your balance.
              </p>
            </div>
          </div>

        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
