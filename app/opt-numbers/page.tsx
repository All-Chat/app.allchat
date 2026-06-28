/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Plus, Trash2, Loader2, PhoneCall,
  Gauge, AlertTriangle, Infinity as InfinityIcon, X, Check,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface LimitInfo {
  limit: { max: number; period: string };
  usage: { count: number; resetAt: string | null };
  remaining: number;
  allowed: boolean;
}

export default function OptNumbersPage() {
  const { status } = useSession();
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNumber, setNewNumber] = useState("");
  const [adding, setAdding] = useState(false);

  // ✅ Limit State
  const [optLimit, setOptLimit] = useState<LimitInfo | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const isLimitActive = optLimit && optLimit.limit.period !== "unlimited" && optLimit.limit.max !== -1;
  const usagePercent = isLimitActive
    ? Math.min(100, Math.round(((optLimit!.usage.count || 0) / optLimit!.limit.max) * 100))
    : 0;
  const isAtLimit = isLimitActive && !optLimit.allowed;

  const formatResetDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  };

  const loadData = async () => {
    try {
      const [numbersRes, limitsRes] = await Promise.all([
        fetch("/api/opt-numbers"),
        fetch("/api/user/limits?resource=optNumbers"),
      ]);

      if (numbersRes.status === 401) {
        window.location.href = "/signin";
        return;
      }

      const numbersData = await numbersRes.json();
      setNumbers(numbersData.numbers || []);

      // ✅ Load limit info
      if (limitsRes.ok) {
        const limitsData = await limitsRes.json();
        if (limitsData.success) {
          setOptLimit({
            limit: { max: limitsData.limit, period: limitsData.period },
            usage: { count: limitsData.currentUsage || 0, resetAt: null },
            remaining: limitsData.remaining,
            allowed: limitsData.allowed,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") loadData();
    if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) return;

    setAdding(true);
    try {
      const res = await fetch("/api/opt-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: newNumber.trim() }),
      });
      const data = await res.json();

      // ✅ Handle limit exceeded response
      if (res.status === 429 && data.limitExceeded) {
        showToast(data.error, "error");
        if (data.limitInfo) {
          setOptLimit((prev) =>
            prev
              ? {
                  ...prev,
                  allowed: false,
                  usage: { count: data.limitInfo.currentUsage, resetAt: null },
                  remaining: 0,
                }
              : prev
          );
        }
        return;
      }

      if (res.ok) {
        setNumbers([data.optNumber, ...numbers]);
        setNewNumber("");
        showToast("Number added successfully!");
        // Refresh limits
        loadData();
      } else {
        showToast(data.error || "Failed to add number", "error");
      }
    } catch (error) {
      showToast("Failed to add number", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/opt-numbers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNumbers(numbers.filter((n) => n._id !== id));
        showToast("Number deleted");
        // Refresh limits after deletion
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to delete number", "error");
      }
    } catch (error) {
      showToast("Failed to delete number", "error");
    }
  };

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <style jsx global>{`
        @keyframes slide-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${
            toast.type === "success"
              ? "bg-white border-emerald-200 text-emerald-700"
              : "bg-white border-red-200 text-red-700"
          }`}
        >
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              toast.type === "success" ? "bg-emerald-100" : "bg-red-100"
            }`}
          >
            {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
          </span>
          {toast.message}
        </div>
      )}

      <Sidebar />

      <main className="md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:p-10 space-y-6 sm:space-y-8">

          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-cyan-50 to-sky-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-cyan-100 shadow-lg shadow-cyan-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-cyan-200/30 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-16 -left-10 w-40 h-40 bg-white/60 rounded-full blur-2xl"></div>

            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex-shrink-0 p-3 sm:p-3.5 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl sm:rounded-2xl shadow-md shadow-cyan-200/60">
                  <PhoneCall size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-cyan-900">
                    Opt-out Numbers
                  </h1>
                  <p className="text-cyan-700/80 text-xs sm:text-sm mt-1 font-medium">
                    Manage phone numbers collected via workflows or added manually
                  </p>
                </div>
              </div>

              {/* ✅ Limit Badge in Header */}
              {optLimit && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold shrink-0 ${
                    isAtLimit
                      ? "bg-red-50 border-red-200 text-red-700"
                      : usagePercent >= 80
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : isLimitActive
                      ? "bg-white border-slate-200 text-slate-600"
                      : "bg-cyan-50 border-cyan-200 text-cyan-600"
                  }`}
                >
                  {isLimitActive ? (
                    <>
                      <Gauge size={14} />
                      <span>
                        {optLimit.usage.count}/{optLimit.limit.max}
                      </span>
                      {optLimit.limit.period !== "total" && (
                        <span className="opacity-60">/{optLimit.limit.period}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <InfinityIcon size={14} />
                      <span>Unlimited</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ✅ Limit Warning Bar */}
          {isLimitActive && (
            <div
              className={`rounded-xl p-3 flex items-center gap-3 text-sm border animate-slide-in ${
                isAtLimit
                  ? "bg-red-50 border-red-200 text-red-700"
                  : usagePercent >= 80
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-blue-50 border-blue-200 text-blue-600"
              }`}
            >
              {isAtLimit ? (
                <AlertTriangle size={16} className="shrink-0" />
              ) : (
                <Gauge size={16} className="shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-bold">
                  {isAtLimit
                    ? "opt-out number limit reached!"
                    : usagePercent >= 80
                    ? "Approaching opt-out number limit"
                    : "Number usage"}
                </span>
                <span className="ml-2 opacity-80">
                  {optLimit?.usage.count} of {optLimit?.limit.max} numbers used
                  {optLimit?.limit.period !== "total" && ` per ${optLimit?.limit.period}`}
                  {optLimit?.limit.period !== "total" && optLimit?.usage.resetAt && (
                    <span className="ml-1">
                      • Resets {formatResetDate(optLimit.usage.resetAt)}
                    </span>
                  )}
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-24 h-2 bg-white/60 rounded-full overflow-hidden shrink-0">
                <div
                  className={`h-full rounded-full transition-all ${
                    isAtLimit
                      ? "bg-red-500"
                      : usagePercent >= 80
                      ? "bg-amber-500"
                      : "bg-cyan-500"
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <span className="text-xs font-bold shrink-0">{usagePercent}%</span>
            </div>
          )}

          {/* Add Number Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus size={16} className="text-cyan-500" />
                <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest">
                  Add Number
                </h2>
              </div>

              {/* ✅ Limit Reached Warning in Form */}
              {isAtLimit && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 animate-slide-in">
                  <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-700">opt-out number limit reached</p>
                    <p className="text-[11px] text-red-600 mt-0.5">
                      You have used {optLimit?.usage.count} of {optLimit?.limit.max} numbers
                      {optLimit?.limit.period !== "total" && ` per ${optLimit?.limit.period}`}.
                      Delete existing numbers or contact admin to increase your limit.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleAdd} className="flex gap-2">
                <div className="relative flex-1">
                  <PhoneCall
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    placeholder="+1234567890"
                    disabled={isAtLimit || adding}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-gray-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-cyan-100 focus:border-cyan-400 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAtLimit || adding || !newNumber.trim()}
                  className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isAtLimit
                      ? "bg-slate-400 text-white cursor-not-allowed"
                      : "bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-600 hover:to-sky-600 text-white"
                  }`}
                >
                  {adding ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isAtLimit ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {adding ? "Adding..." : isAtLimit ? "Limit Reached" : "Add Number"}
                </button>
              </form>
            </div>
          </div>

          {/* Numbers List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <PhoneCall size={14} className="text-slate-500" />
                Phone Numbers
              </h2>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {numbers.length} Total
                {isLimitActive && (
                  <span className="text-slate-400 ml-1">/ {optLimit?.limit.max}</span>
                )}
              </span>
            </div>

            {numbers.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100 mx-auto">
                  <PhoneCall size={28} />
                </div>
                <p className="font-bold text-slate-700">No numbers yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Add numbers manually or connect an opt-out Node in your workflows.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {numbers.map((num) => {
                  const isDeleting = deletingId === num._id;

                  return (
                    <li
                      key={num._id}
                      className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {num.phoneNumber.slice(-2)}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-800 font-mono">
                            {num.phoneNumber}
                          </span>
                          {num.createdAt && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Added {new Date(num.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>

                      {!isDeleting ? (
                        <button
                          onClick={() => setDeletingId(num._id)}
                          className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Number"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                          <span className="text-[10px] font-bold text-red-600 px-1">Delete?</span>
                          <button
                            onClick={() => {
                              handleDelete(num._id);
                              setDeletingId(null);
                            }}
                            className="p-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-[10px] font-bold px-2"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="p-1 text-slate-500 rounded-md hover:bg-slate-200 text-[10px] font-bold px-2"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Info Box */}
          <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-cyan-100 rounded-lg shrink-0">
              <PhoneCall className="w-4 h-4 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-cyan-800">About opt-out Numbers</p>
              <p className="text-xs text-cyan-700 mt-1 leading-relaxed">
                These phone numbers represent contacts who have opted out of receiving messages from you.
                Numbers can be added manually here or automatically through workflow opt-out nodes.
                All opt-out requests must be honored in accordance with WhatsApp&lsquo;s messaging policies.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
