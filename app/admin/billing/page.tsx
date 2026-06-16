/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Loader2, Shield, Wallet, IndianRupee, Save, RefreshCw,
  Users, AlertCircle, CheckCircle2, Eye, EyeOff, LogIn,
  Search, Filter, Clock, Phone, Building2, KeyRound,
  Ban, Play, ExternalLink, CalendarDays, X, Settings2,
  ChevronDown, Zap, CreditCard, UserCog, MoreVertical,
  Timer, Infinity as InfinityIcon, AlertTriangle, BadgeCheck,
  XCircle, User, Lock, 
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const PLAN_PRESETS = [
  { label: "1 Hour", value: "1h" },
  { label: "6 Hours", value: "6h" },
  { label: "1 Day", value: "1d" },
  { label: "3 Days", value: "3d" },
  { label: "1 Week", value: "1w" },
  { label: "2 Weeks", value: "2w" },
  { label: "1 Month", value: "1mo" },
  { label: "3 Months", value: "3mo" },
  { label: "6 Months", value: "6mo" },
  { label: "1 Year", value: "1y" },
  { label: "2 Years", value: "2y" },
  { label: "Unlimited", value: "unlimited" },
];

export default function AdminBillingPage() {
  const [adminKey, setAdminKey] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Edit states
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"billing" | "plan" | "account" | "credentials">("billing");
  const [editPrice, setEditPrice] = useState("");
  const [editRecharge, setEditRecharge] = useState("");
  const [editPlanDuration, setEditPlanDuration] = useState("1mo");
  const [editCustomDuration, setEditCustomDuration] = useState("");
  const [editSuspendReason, setEditSuspendReason] = useState("");
  
  // Credential States
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPhoneNumberId, setEditPhoneNumberId] = useState("");
  const [editWabaId, setEditWabaId] = useState("");
  const [editAccessToken, setEditAccessToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);

  const [saving, setSaving] = useState<string | null>(null);

  const formatINR = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", minimumFractionDigits: 2,
    }).format(amount);

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getPlanLabel = (duration: string | null) => {
    if (!duration) return "No Plan";
    const preset = PLAN_PRESETS.find(p => p.value === duration);
    return preset ? preset.label : duration;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" };
      case "expired": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" };
      case "suspended": return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" };
      default: return { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-500" };
    }
  };

  const handleVerify = async () => {
    if (!adminKey.trim()) { toast.error("Please enter the admin key"); return; }
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminKey }),
      });
      const data = await res.json();
      if (data.success) { setIsVerified(true); toast.success("Admin verified!"); fetchUsers(); }
      else toast.error("Invalid admin key");
    } catch { toast.error("Verification failed"); }
    finally { setVerifying(false); }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing", { headers: { "x-admin-key": adminKey } });
      const data = await res.json();
      if (data.success) setUsers(data.users);
      else toast.error("Failed to fetch users");
    } catch { toast.error("Error fetching users"); }
    finally { setLoading(false); }
  };

  const startEdit = (user: any, tab: "billing" | "plan" | "account" | "credentials" = "billing") => {
    setEditingUserId(user._id);
    setEditTab(tab);
    setEditPrice(user.pricePerMessage?.toString() || "0.90");
    setEditRecharge("");
    setEditPlanDuration(user.planDuration || "1mo");
    setEditCustomDuration("");
    setEditSuspendReason("");
    
    setEditName(user.name || "");
    setEditPassword(user.password || ""); 
    setEditPhoneNumberId(user.whatsappPhoneNumberId || "");
    setEditWabaId(user.wabaId || "");
    setEditAccessToken(user.whatsappAccessToken || ""); 
    
    setShowPassword(false);
    setShowAccessToken(false);
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditTab("billing");
  };

  const saveUser = async (userId: string, action: string, extraData?: any) => {
    setSaving(userId + action);
    try {
      const body: any = { userId, ...extraData };

      if (action === "billing") {
        if (editPrice !== "") body.pricePerMessage = Number(editPrice);
        if (editRecharge !== "" && Number(editRecharge) > 0) body.rechargeAmount = Number(editRecharge);
      }

      if (action === "plan") {
        const duration = editCustomDuration || editPlanDuration;
        body.activatePlan = true;
        body.planDuration = duration;
      }

      if (action === "clearPlan") {
        body.clearPlan = true;
      }

      if (action === "suspend") {
        body.suspendAccount = true;
        body.suspendReason = editSuspendReason || "Suspended by admin";
      }

      if (action === "reactivate") {
        body.reactivateAccount = true;
      }

      if (action === "credentials") {
        body.whatsappPhoneNumberId = editPhoneNumberId;
        body.wabaId = editWabaId;
        if (editAccessToken.trim() !== "") body.whatsappAccessToken = editAccessToken;
        if (editName.trim() !== "") body.name = editName;
        if (editPassword.trim() !== "") body.password = editPassword;
      }

      const res = await fetch("/api/admin/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Updated ${data.user.name}`);
        fetchUsers();
        if (action !== "suspend" && action !== "reactivate") cancelEdit();
        else setEditingUserId(null);
      } else {
        toast.error(data.message || "Failed to update");
      }
    } catch {
      toast.error("Error updating user");
    } finally {
      setSaving(null);
    }
  };

  const openUserDashboard = (userId: string) => {
    window.open(`/`, "_blank");
  };

  const filteredUsers = users
    .filter(u => statusFilter === "all" || u.accountStatus === statusFilter)
    .filter(u => {
      if (!searchTerm) return true;
      const lt = searchTerm.toLowerCase();
      return u.name?.toLowerCase().includes(lt) ||
        u.whatsappPhoneNumberId?.toLowerCase().includes(lt) ||
        u.wabaId?.toLowerCase().includes(lt);
    });

  const activeCount = users.filter(u => u.accountStatus === "active").length;
  const expiredCount = users.filter(u => u.accountStatus === "expired").length;
  const suspendedCount = users.filter(u => u.accountStatus === "suspended").length;

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl">
            <div className="flex items-center justify-center mb-6 sm:mb-8">
              <div className="p-3 sm:p-4 bg-amber-100 rounded-2xl border border-amber-200">
                <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600" />
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">Admin Billing Panel</h1>
            <p className="text-gray-500 text-xs sm:text-sm text-center mb-6 sm:mb-8">
              Enter the admin secret key to access user management
            </p>
            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  placeholder="Enter admin secret key"
                  className="w-full px-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-gray-700 transition"
                >
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 sm:py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-sm"
              >
                {verifying ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {verifying ? "Verifying..." : "Access Admin Panel"}
              </button>
            </div>
            <p className="text-slate-400 text-[10px] text-center mt-6">
              Set ADMIN_SECRET_KEY in your .env.local file. Default: admin123
            </p>
          </div>
        </div>
        <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      {/* Sidebar Component - Handles Mobile Subnavbar automatically */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="md:ml-64 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-lg shadow-amber-200">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">Admin Panel</h1>
              <p className="text-gray-500 text-xs sm:text-sm">Manage users, billing, plans & accounts</p>
            </div>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium hover:bg-slate-50 shadow-sm transition-all w-full sm:w-auto justify-center"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-amber-500" : ""} />
            Refresh
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Users</p>
            <p className="text-xl sm:text-2xl font-extrabold">{users.length}</p>
          </div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[9px] sm:text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1 flex items-center gap-1"><BadgeCheck size={10} /> Active</p>
            <p className="text-xl sm:text-2xl font-extrabold text-emerald-600">{activeCount}</p>
          </div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[9px] sm:text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1"><AlertTriangle size={10} /> Expired</p>
            <p className="text-xl sm:text-2xl font-extrabold text-amber-600">{expiredCount}</p>
          </div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[9px] sm:text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Wallet size={10} /> Balance Held</p>
            <p className="text-xl sm:text-2xl font-extrabold text-blue-600">{formatINR(users.reduce((s, u) => s + (u.balance || 0), 0))}</p>
          </div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
            <p className="text-[9px] sm:text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-1 flex items-center gap-1"><CreditCard size={10} /> Total In</p>
            <p className="text-xl sm:text-2xl font-extrabold text-violet-600">{formatINR(users.reduce((s, u) => s + (u.totalRecharged || 0), 0))}</p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, phone ID, or WABA ID..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {/* User Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-500">No users found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map((user) => {
              const sc = getStatusColor(user.accountStatus);
              const isEditing = editingUserId === user._id;
              const isExpired = user.accountStatus === "expired" || (user.planExpiry && new Date(user.planExpiry) < new Date());
              const planLabel = getPlanLabel(user.planDuration);

              return (
                <div key={user._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                          user.accountStatus === "active" ? "bg-gradient-to-br from-emerald-400 to-teal-500" :
                          user.accountStatus === "suspended" ? "bg-gradient-to-br from-red-400 to-red-500" :
                          "bg-gradient-to-br from-amber-400 to-orange-500"
                        }`}>
                          {user.name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 mb-0.5">
                            <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">{user.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc.bg} ${sc.text} ${sc.border} flex items-center gap-1 shrink-0`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                              {user.accountStatus?.toUpperCase()}
                            </span>
                            {user.planDuration && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 flex items-center gap-1 shrink-0">
                                <Clock size={9} /> {planLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-[11px] sm:text-xs text-gray-400">
                            {user.whatsappPhoneNumberId && <span className="font-mono truncate">{user.whatsappPhoneNumberId}</span>}
                            {user.wabaId && <span className="truncate">WABA: {user.wabaId}</span>}
                            <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-4 pl-13 sm:pl-0">
                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                          <div className="flex-1 sm:flex-none text-right px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-100">
                            <p className="text-[9px] text-slate-400 font-bold uppercase">Balance</p>
                            <p className={`text-xs sm:text-sm font-extrabold ${(user.balance || 0) <= 0 ? "text-red-600" : "text-emerald-600"}`}>
                              {formatINR(user.balance || 0)}
                            </p>
                          </div>
                          <div className="flex-1 sm:flex-none text-right px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-100">
                            <p className="text-[9px] text-slate-400 font-bold uppercase">Price/Msg</p>
                            <p className="text-xs sm:text-sm font-extrabold text-amber-600">{formatINR(user.pricePerMessage || 0.9)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          <button onClick={() => openUserDashboard(user._id)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Open User Dashboard">
                            <ExternalLink size={16} />
                          </button>
                          {user.accountStatus === "active" && (
                            <button onClick={() => saveUser(user._id, "suspend")} disabled={saving === user._id + "suspend"} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Suspend Account">
                              {saving === user._id + "suspend" ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                            </button>
                          )}
                          {(user.accountStatus === "suspended" || user.accountStatus === "expired") && (
                            <button onClick={() => saveUser(user._id, "reactivate")} disabled={saving === user._id + "reactivate"} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Reactivate Account">
                              {saving === user._id + "reactivate" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            </button>
                          )}
                          {!isEditing ? (
                            <button onClick={() => startEdit(user)} className="px-3 sm:px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold transition-all">
                              <UserCog size={14} className="inline mr-1" /> Manage
                            </button>
                          ) : (
                            <button onClick={cancelEdit} className="px-3 sm:px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all">
                              <X size={14} className="inline mr-1" /> Close
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {user.planDuration && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-100">
                          <CalendarDays size={12} /> Plan: <span className="font-bold">{planLabel}</span>
                        </span>
                        {user.planActivatedAt && <span className="text-slate-400">Activated: {formatDate(user.planActivatedAt)}</span>}
                        {user.planExpiry ? (
                          <span className={`flex items-center gap-1 ${isExpired ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                            <Timer size={12} /> Expires: {formatDate(user.planExpiry)}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-500"><InfinityIcon size={12} /> Never expires</span>
                        )}
                        {user.suspendedReason && <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {user.suspendedReason}</span>}
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="border-t border-slate-100 bg-slate-50/50">
                      <div className="flex overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
                        {[
                          { id: "billing", label: "Billing", icon: Wallet },
                          { id: "plan", label: "Plan", icon: CalendarDays },
                          { id: "account", label: "Account", icon: UserCog },
                          { id: "credentials", label: "Credentials", icon: KeyRound },
                        ].map((tab) => (
                          <button key={tab.id} onClick={() => setEditTab(tab.id as any)} className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${editTab === tab.id ? "border-amber-500 text-amber-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                            <tab.icon size={14} /> {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-4 sm:p-6">
                        {editTab === "billing" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl">
                            <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Price per Message (₹)</label>
                              <div className="relative">
                                <IndianRupee className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input type="number" step="0.01" min="0" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm" />
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Current: {formatINR(user.pricePerMessage || 0.9)}</p>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Add Balance (₹)</label>
                              <div className="relative">
                                <Wallet className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input type="number" step="1" min="0" value={editRecharge} onChange={(e) => setEditRecharge(e.target.value)} placeholder="100" className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all text-sm" />
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">{Number(editRecharge) > 0 ? <>New balance: <span className="text-emerald-600 font-bold">{formatINR((user.balance || 0) + Number(editRecharge))}</span></> : "Leave 0 to skip recharge"}</p>
                            </div>
                            <div className="col-span-1 sm:col-span-2 flex flex-col sm:flex-row justify-end gap-3 pt-3">
                              <button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                              <button onClick={() => saveUser(user._id, "billing")} disabled={saving === user._id + "billing"} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">
                                {saving === user._id + "billing" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Billing
                              </button>
                            </div>
                          </div>
                        )}

                        {editTab === "plan" && (
                          <div className="max-w-2xl space-y-5 sm:space-y-6">
                            <div className="p-4 bg-white rounded-xl border border-slate-200">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Current Plan</p>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>{planLabel}</span>
                                {user.planActivatedAt && <span className="text-xs text-slate-400">Since {formatDate(user.planActivatedAt)}</span>}
                                {user.planExpiry ? <span className={`text-xs ${isExpired ? "text-red-500 font-bold" : "text-slate-400"}`}>{isExpired ? "EXPIRED" : `Expires ${formatDate(user.planExpiry)}`}</span> : user.planDuration ? <span className="text-xs text-emerald-500 font-medium">Unlimited</span> : <span className="text-xs text-slate-400">No plan assigned</span>}
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Select Plan Duration</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {PLAN_PRESETS.map((p) => (
                                  <button key={p.value} onClick={() => { setEditPlanDuration(p.value); setEditCustomDuration(""); }} className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${editPlanDuration === p.value && !editCustomDuration ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Or Custom Duration</p>
                              <input type="text" value={editCustomDuration} onChange={(e) => setEditCustomDuration(e.target.value)} placeholder="e.g. 45d, 2mo, 18m (number + s/m/h/d/w/mo/y)" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm" />
                              <p className="text-[10px] text-slate-400 mt-1">Format: number + unit (s=sec, m=min, h=hour, d=day, w=week, mo=month, y=year)</p>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 pt-3">
                              <button onClick={() => saveUser(user._id, "plan")} disabled={saving === user._id + "plan"} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">
                                {saving === user._id + "plan" ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Activate Plan
                              </button>
                              {user.planDuration && <button onClick={() => saveUser(user._id, "clearPlan")} disabled={saving === user._id + "clearPlan"} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Remove Plan</button>}
                            </div>
                          </div>
                        )}

                        {editTab === "account" && (
                          <div className="max-w-2xl space-y-5">
                            <div className="p-4 bg-white rounded-xl border border-slate-200">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold text-gray-900">Account Status</p>
                                  <p className="text-xs text-slate-400 mt-0.5">{user.accountStatus === "active" ? "Account is active and fully operational." : user.accountStatus === "suspended" ? `Suspended: ${user.suspendedReason || "By admin"}` : "Plan has expired. User cannot access dashboard."}</p>
                                </div>
                                <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${sc.bg} ${sc.text} ${sc.border} shrink-0 w-fit`}>{user.accountStatus?.toUpperCase()}</span>
                              </div>
                            </div>
                            {user.accountStatus === "active" && (
                              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                                <p className="text-sm font-bold text-red-800 flex items-center gap-2"><Ban size={16} /> Suspend Account</p>
                                <input type="text" value={editSuspendReason} onChange={(e) => setEditSuspendReason(e.target.value)} placeholder="Reason for suspension (optional)" className="w-full px-4 py-2.5 bg-white border border-red-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all text-sm" />
                                <button onClick={() => saveUser(user._id, "suspend", { suspendReason: editSuspendReason })} disabled={saving === user._id + "suspend"} className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all disabled:opacity-50 text-sm">
                                  {saving === user._id + "suspend" ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Suspend Now
                                </button>
                              </div>
                            )}
                            {(user.accountStatus === "suspended" || user.accountStatus === "expired") && (
                              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <p className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2"><Play size={16} /> Reactivate Account</p>
                                <button onClick={() => saveUser(user._id, "reactivate")} disabled={saving === user._id + "reactivate"} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50 text-sm">
                                  {saving === user._id + "reactivate" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Reactivate Account
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ======== CREDENTIALS TAB ======== */}
                        {editTab === "credentials" && (
                          <div className="space-y-5 sm:space-y-6 max-w-2xl">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><User size={12} /> Username (Login Name)</label>
                                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><Lock size={12} /> Password</label>
                                <div className="relative">
                                  <input type={showPassword ? "text" : "password"} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono pr-10" />
                                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-gray-700">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><Building2 size={12} /> WABA ID</label>
                                <input type="text" value={editWabaId} onChange={(e) => setEditWabaId(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><Phone size={12} /> Phone Number ID</label>
                                <input type="text" value={editPhoneNumberId} onChange={(e) => setEditPhoneNumberId(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono" />
                              </div>
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><KeyRound size={12} /> Access Token</label>
                              <div className="relative">
                                <input type={showAccessToken ? "text" : "password"} value={editAccessToken} onChange={(e) => setEditAccessToken(e.target.value)} placeholder="Leave blank to keep existing" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono pr-10" />
                                <button type="button" onClick={() => setShowAccessToken(!showAccessToken)} className="absolute right-3 top-3 text-slate-400 hover:text-gray-700">
                                  {showAccessToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Leave blank to keep the existing token unchanged.</p>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3">
                              <button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                              <button onClick={() => saveUser(user._id, "credentials")} disabled={saving === user._id + "credentials"} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">
                                {saving === user._id + "credentials" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Credentials
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 sm:mt-8 p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-xl sm:rounded-2xl flex items-start gap-3 sm:gap-4">
          <div className="p-2 bg-amber-100 rounded-xl shrink-0"><AlertCircle className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="text-sm font-bold text-amber-800">Admin Access Only</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              This panel is not linked from the main application. Set <code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 text-[11px]">ADMIN_SECRET_KEY</code> in <code className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-900 text-[11px]">.env.local</code>. 
              Suspended/expired users will see a blocked screen on login. Plans auto-expire based on duration. Users can be impersonated via the external link button to debug their dashboard.
            </p>
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
