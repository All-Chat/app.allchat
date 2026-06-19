/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Loader2, Shield, Wallet, IndianRupee, Save, RefreshCw,
  Users, AlertCircle, Eye, EyeOff, LogIn,
  Search, Filter, Clock, Phone, Building2, KeyRound,
  Ban, Play, ExternalLink, CalendarDays, X,
  Zap, CreditCard, UserCog,
  Timer, Infinity as InfinityIcon, AlertTriangle, BadgeCheck,
  User, Lock, Megaphone, Wrench, ShieldCheck,
  Tag, GitBranch, FileText, Send, UserPlus, ClipboardList,
  RotateCcw, Gauge, Package,
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

const PERIOD_OPTIONS = [
  { value: "day", label: "Per Day" },
  { value: "month", label: "Per Month" },
  { value: "year", label: "Per Year" },
  { value: "total", label: "Total (Lifetime)" },
  { value: "unlimited", label: "Unlimited ♾️" },
];

const LIMIT_RESOURCES_CONFIG = [
  { key: "tags", label: "Tags", icon: Tag, color: "orange", description: "Contact & group tag creation" },
  { key: "workflows", label: "Workflows", icon: GitBranch, color: "emerald", description: "Automation workflow creation" },
  { key: "templates", label: "Templates", icon: FileText, color: "blue", description: "Message template creation" },
  { key: "testMessages", label: "Test Messages", icon: Send, color: "violet", description: "Test message sends" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, color: "rose", description: "Campaign creation & launch" },
  { key: "optNumbers", label: "Opt-in Numbers", icon: UserPlus, color: "cyan", description: "Opt-in contact numbers" },
  { key: "forms", label: "Forms", icon: ClipboardList, color: "amber", description: "Form creation" },
];

const LIMIT_PRESETS = [
  {
    label: "Free Tier",
    limits: {
      tags: { max: 5, period: "month" },
      workflows: { max: 2, period: "total" },
      templates: { max: 3, period: "total" },
      testMessages: { max: 5, period: "day" },
      campaigns: { max: 2, period: "month" },
      optNumbers: { max: 50, period: "total" },
      forms: { max: 2, period: "total" },
    },
  },
  {
    label: "Basic",
    limits: {
      tags: { max: 50, period: "month" },
      workflows: { max: 5, period: "total" },
      templates: { max: 10, period: "total" },
      testMessages: { max: 20, period: "day" },
      campaigns: { max: 5, period: "month" },
      optNumbers: { max: 500, period: "total" },
      forms: { max: 5, period: "total" },
    },
  },
  {
    label: "Pro",
    limits: {
      tags: { max: 200, period: "month" },
      workflows: { max: 20, period: "total" },
      templates: { max: 50, period: "total" },
      testMessages: { max: 100, period: "day" },
      campaigns: { max: 20, period: "month" },
      optNumbers: { max: 5000, period: "total" },
      forms: { max: 20, period: "total" },
    },
  },
  {
    label: "Enterprise (All Unlimited)",
    limits: {
      tags: { max: -1, period: "unlimited" },
      workflows: { max: -1, period: "unlimited" },
      templates: { max: -1, period: "unlimited" },
      testMessages: { max: -1, period: "unlimited" },
      campaigns: { max: -1, period: "unlimited" },
      optNumbers: { max: -1, period: "unlimited" },
      forms: { max: -1, period: "unlimited" },
    },
  },
];

const DEFAULT_LIMITS: Record<string, { max: number; period: string }> = {
  tags: { max: -1, period: "unlimited" },
  workflows: { max: -1, period: "unlimited" },
  templates: { max: -1, period: "unlimited" },
  testMessages: { max: -1, period: "unlimited" },
  campaigns: { max: -1, period: "unlimited" },
  optNumbers: { max: -1, period: "unlimited" },
  forms: { max: -1, period: "unlimited" },
};

type LimitValue = { max: number; period: string };

function getLimitColor(color: string) {
  const map: Record<string, { bg: string; border: string; iconBg: string; iconText: string; inputBorder: string; inputFocus: string; badge: string; badgeText: string }> = {
    orange: { bg: "bg-orange-50", border: "border-orange-200", iconBg: "bg-orange-100", iconText: "text-orange-600", inputBorder: "border-orange-200", inputFocus: "focus:ring-orange-500/30 focus:border-orange-400", badge: "bg-orange-100", badgeText: "text-orange-700" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-100", iconText: "text-emerald-600", inputBorder: "border-emerald-200", inputFocus: "focus:ring-emerald-500/30 focus:border-emerald-400", badge: "bg-emerald-100", badgeText: "text-emerald-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", iconBg: "bg-blue-100", iconText: "text-blue-600", inputBorder: "border-blue-200", inputFocus: "focus:ring-blue-500/30 focus:border-blue-400", badge: "bg-blue-100", badgeText: "text-blue-700" },
    violet: { bg: "bg-violet-50", border: "border-violet-200", iconBg: "bg-violet-100", iconText: "text-violet-600", inputBorder: "border-violet-200", inputFocus: "focus:ring-violet-500/30 focus:border-violet-400", badge: "bg-violet-100", badgeText: "text-violet-700" },
    rose: { bg: "bg-rose-50", border: "border-rose-200", iconBg: "bg-rose-100", iconText: "text-rose-600", inputBorder: "border-rose-200", inputFocus: "focus:ring-rose-500/30 focus:border-rose-400", badge: "bg-rose-100", badgeText: "text-rose-700" },
    cyan: { bg: "bg-cyan-50", border: "border-cyan-200", iconBg: "bg-cyan-100", iconText: "text-cyan-600", inputBorder: "border-cyan-200", inputFocus: "focus:ring-cyan-500/30 focus:border-cyan-400", badge: "bg-cyan-100", badgeText: "text-cyan-700" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconText: "text-amber-600", inputBorder: "border-amber-200", inputFocus: "focus:ring-amber-500/30 focus:border-amber-400", badge: "bg-amber-100", badgeText: "text-amber-700" },
  };
  return map[color] || map.orange;
}

export default function AdminBillingPage() {
  const [adminKey, setAdminKey] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"billing" | "plan" | "account" | "credentials" | "limits">("billing");
  const [editRecharge, setEditRecharge] = useState("");
  const [editPlanDuration, setEditPlanDuration] = useState("1mo");
  const [editCustomDuration, setEditCustomDuration] = useState("");
  const [editSuspendReason, setEditSuspendReason] = useState("");

  const [editPriceMarketing, setEditPriceMarketing] = useState("0.90");
  const [editPriceUtility, setEditPriceUtility] = useState("0.50");
  const [editPriceAuthentication, setEditPriceAuthentication] = useState("0.30");

  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPhoneNumberId, setEditPhoneNumberId] = useState("");
  const [editWabaId, setEditWabaId] = useState("");
  const [editAccessToken, setEditAccessToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);

  // Limits state
  const [editLimits, setEditLimits] = useState<Record<string, LimitValue>>({ ...DEFAULT_LIMITS });
  const [selectedPreset, setSelectedPreset] = useState("");

  const [saving, setSaving] = useState<string | null>(null);

  const formatINR = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getPlanLabel = (duration: string | null) => {
    if (!duration) return "No Plan";
    const preset = PLAN_PRESETS.find((p) => p.value === duration);
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

  const getActiveLimitsCount = (limits: any) => {
    if (!limits) return 0;
    return Object.values(limits).filter((l: any) => l.period !== "unlimited").length;
  };

  const getUsagePercent = (usage: any, limit: any) => {
    if (!usage || !limit || limit.period === "unlimited" || limit.max <= 0) return 0;
    return Math.min(100, Math.round(((usage.count || 0) / limit.max) * 100));
  };

  const handleVerify = async () => {
    if (!adminKey.trim()) { toast.error("Please enter the admin key"); return; }
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminKey }) });
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

  const startEdit = (user: any, tab: "billing" | "plan" | "account" | "credentials" | "limits" = "billing") => {
    setEditingUserId(user._id);
    setEditTab(tab);
    setEditPriceMarketing(user.priceMarketing?.toString() || "0.90");
    setEditPriceUtility(user.priceUtility?.toString() || "0.50");
    setEditPriceAuthentication(user.priceAuthentication?.toString() || "0.30");
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

    // Initialize limits from user data
    const userLimits: Record<string, LimitValue> = {};
    for (const res of LIMIT_RESOURCES_CONFIG) {
      userLimits[res.key] = user.limits?.[res.key] || DEFAULT_LIMITS[res.key];
    }
    setEditLimits(userLimits);
    setSelectedPreset("");
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditTab("billing");
  };

  const updateLimitField = (resource: string, field: "max" | "period", value: number | string) => {
    setEditLimits((prev) => {
      const current = { ...prev[resource] };
      if (field === "period") {
        current.period = value as string;
        if (value === "unlimited") current.max = -1;
        else if (current.max === -1) current.max = 0;
      } else {
        current.max = value as number;
      }
      return { ...prev, [resource]: current };
    });
    setSelectedPreset("");
  };

  const applyPreset = (presetLabel: string) => {
    const preset = LIMIT_PRESETS.find((p) => p.label === presetLabel);
    if (preset) {
      setEditLimits({ ...preset.limits });
      setSelectedPreset(presetLabel);
      toast.info(`Applied "${presetLabel}" limits preset`);
    }
  };

  const saveUser = async (userId: string, action: string, extraData?: any) => {
    setSaving(userId + action);
    try {
      const body: any = { userId, ...extraData };

      if (action === "billing") {
        body.priceMarketing = Number(editPriceMarketing);
        body.priceUtility = Number(editPriceUtility);
        body.priceAuthentication = Number(editPriceAuthentication);
        if (editRecharge !== "" && Number(editRecharge) > 0) body.rechargeAmount = Number(editRecharge);
      }

      if (action === "plan") {
        const duration = editCustomDuration || editPlanDuration;
        body.activatePlan = true;
        body.planDuration = duration;
      }

      if (action === "clearPlan") body.clearPlan = true;
      if (action === "suspend") { body.suspendAccount = true; body.suspendReason = editSuspendReason || "Suspended by admin"; }
      if (action === "reactivate") body.reactivateAccount = true;

      if (action === "credentials") {
        body.whatsappPhoneNumberId = editPhoneNumberId;
        body.wabaId = editWabaId;
        if (editAccessToken.trim() !== "") body.whatsappAccessToken = editAccessToken;
        if (editName.trim() !== "") body.name = editName;
        if (editPassword.trim() !== "") body.password = editPassword;
      }

      if (action === "limits") {
        body.limits = editLimits;
      }

      if (action === "resetUsage") {
        body.resetUsage = extraData?.resetUsage || {};
        body.limits = editLimits;
      }

      if (action === "resetAllUsage") {
        body.resetAllUsage = true;
        body.limits = editLimits;
      }

      const res = await fetch("/api/admin/billing", { method: "PUT", headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify(body) });
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

  const filteredUsers = users
    .filter((u) => statusFilter === "all" || u.accountStatus === statusFilter)
    .filter((u) => {
      if (!searchTerm) return true;
      const lt = searchTerm.toLowerCase();
      return u.name?.toLowerCase().includes(lt) || u.whatsappPhoneNumberId?.toLowerCase().includes(lt) || u.wabaId?.toLowerCase().includes(lt);
    });

  const activeCount = users.filter((u) => u.accountStatus === "active").length;
  const expiredCount = users.filter((u) => u.accountStatus === "expired").length;
  const suspendedCount = users.filter((u) => u.accountStatus === "suspended").length;

  // =============== LOGIN SCREEN ===============
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
            <p className="text-gray-500 text-xs sm:text-sm text-center mb-6 sm:mb-8">Enter the admin secret key to access user management</p>
            <div className="space-y-4">
              <div className="relative">
                <input type={showKey ? "text" : "password"} value={adminKey} onChange={(e) => setAdminKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleVerify()} placeholder="Enter admin secret key" className="w-full px-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm" />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3.5 text-slate-400 hover:text-gray-700 transition">{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <button onClick={handleVerify} disabled={verifying} className="w-full flex items-center justify-center gap-2 px-6 py-3 sm:py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-sm">
                {verifying ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {verifying ? "Verifying..." : "Access Admin Panel"}
              </button>
            </div>
            <p className="text-slate-400 text-[10px] text-center mt-6">Set ADMIN_SECRET_KEY in your .env.local file. Default: admin123</p>
          </div>
        </div>
        <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
      </div>
    );
  }

  // =============== MAIN ADMIN PANEL ===============
  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />

      <div className="md:ml-64 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-lg shadow-amber-200">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">Admin Panel</h1>
              <p className="text-gray-500 text-xs sm:text-sm">Manage users, billing, plans, limits & accounts</p>
            </div>
          </div>
          <button onClick={fetchUsers} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium hover:bg-slate-50 shadow-sm transition-all w-full sm:w-auto justify-center">
            <RefreshCw size={16} className={loading ? "animate-spin text-amber-500" : ""} /> Refresh
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
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name, phone ID, or WABA ID..." className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all" />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400 hidden sm:block" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 outline-none appearance-none cursor-pointer">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {/* User Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
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
              const activeLimits = getActiveLimitsCount(user.limits);

              return (
                <div key={user._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${user.accountStatus === "active" ? "bg-gradient-to-br from-emerald-400 to-teal-500" : user.accountStatus === "suspended" ? "bg-gradient-to-br from-red-400 to-red-500" : "bg-gradient-to-br from-amber-400 to-orange-500"}`}>
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
                            {activeLimits > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1 shrink-0">
                                <Gauge size={9} /> {activeLimits} limit{activeLimits > 1 ? "s" : ""}
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
                            <p className={`text-xs sm:text-sm font-extrabold ${(user.balance || 0) <= 0 ? "text-red-600" : "text-emerald-600"}`}>{formatINR(user.balance || 0)}</p>
                          </div>
                          <div className="flex-1 sm:flex-none text-right px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-100">
                            <p className="text-[9px] text-slate-400 font-bold uppercase">Prices (M/U/A)</p>
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-extrabold">
                              <span className="text-orange-600" title="Marketing">{formatINR(user.priceMarketing || 0.90)}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-blue-600" title="Utility">{formatINR(user.priceUtility || 0.50)}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-purple-600" title="Authentication">{formatINR(user.priceAuthentication || 0.30)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          <button onClick={() => window.open("/", "_blank")} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Open User Dashboard"><ExternalLink size={16} /></button>
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

                    {/* Compact Limits Summary */}
                    {user.limits && activeLimits > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Limits:</span>
                        {LIMIT_RESOURCES_CONFIG.map((res) => {
                          const limit = user.limits[res.key];
                          const usage = user.usage?.[res.key];
                          if (!limit || limit.period === "unlimited") return null;
                          const pct = getUsagePercent(usage, limit);
                          return (
                            <span key={res.key} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${pct >= 90 ? "bg-red-50 text-red-600 border border-red-200" : pct >= 70 ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                              {res.label}: {usage?.count || 0}/{limit.max === -1 ? "∞" : limit.max}
                              {limit.period !== "total" && <span className="text-[8px] ml-0.5 opacity-70">/{limit.period}</span>}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {user.planDuration && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-100"><CalendarDays size={12} /> Plan: <span className="font-bold">{planLabel}</span></span>
                        {user.planActivatedAt && <span className="text-slate-400">Activated: {formatDate(user.planActivatedAt)}</span>}
                        {user.planExpiry ? (
                          <span className={`flex items-center gap-1 ${isExpired ? "text-red-500 font-semibold" : "text-slate-400"}`}><Timer size={12} /> Expires: {formatDate(user.planExpiry)}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-500"><InfinityIcon size={12} /> Never expires</span>
                        )}
                        {user.suspendedReason && <span className="text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {user.suspendedReason}</span>}
                      </div>
                    )}
                  </div>

                  {/* ===== EDIT PANEL ===== */}
                  {isEditing && (
                    <div className="border-t border-slate-100 bg-slate-50/50">
                      <div className="flex overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
                        {[
                          { id: "billing", label: "Billing", icon: Wallet },
                          { id: "plan", label: "Plan", icon: CalendarDays },
                          { id: "account", label: "Account", icon: UserCog },
                          { id: "credentials", label: "Credentials", icon: KeyRound },
                          { id: "limits", label: "Limits", icon: Gauge },
                        ].map((tab) => (
                          <button key={tab.id} onClick={() => setEditTab(tab.id as any)} className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${editTab === tab.id ? "border-amber-500 text-amber-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                            <tab.icon size={14} /> {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="p-4 sm:p-6">
                        {/* ======== BILLING TAB ======== */}
                        {editTab === "billing" && (
                          <div className="space-y-5 sm:space-y-6 max-w-2xl">
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><IndianRupee size={12} /> Category-Based Message Pricing</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                <div className="p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-xl">
                                  <label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Megaphone size={12} /> Marketing</label>
                                  <div className="relative">
                                    <IndianRupee className="absolute left-2.5 top-2.5 w-4 h-4 text-orange-400" />
                                    <input type="number" step="0.01" min="0" value={editPriceMarketing} onChange={(e) => setEditPriceMarketing(e.target.value)} className="w-full pl-8 pr-3 py-2.5 bg-white border border-orange-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all text-sm font-bold" />
                                  </div>
                                  <p className="text-[9px] text-orange-400 mt-1">Promotional messages</p>
                                </div>
                                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                  <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Wrench size={12} /> Utility</label>
                                  <div className="relative">
                                    <IndianRupee className="absolute left-2.5 top-2.5 w-4 h-4 text-blue-400" />
                                    <input type="number" step="0.01" min="0" value={editPriceUtility} onChange={(e) => setEditPriceUtility(e.target.value)} className="w-full pl-8 pr-3 py-2.5 bg-white border border-blue-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-sm font-bold" />
                                  </div>
                                  <p className="text-[9px] text-blue-400 mt-1">Account updates, alerts</p>
                                </div>
                                <div className="p-3 sm:p-4 bg-purple-50 border border-purple-200 rounded-xl">
                                  <label className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ShieldCheck size={12} /> Authentication</label>
                                  <div className="relative">
                                    <IndianRupee className="absolute left-2.5 top-2.5 w-4 h-4 text-purple-400" />
                                    <input type="number" step="0.01" min="0" value={editPriceAuthentication} onChange={(e) => setEditPriceAuthentication(e.target.value)} className="w-full pl-8 pr-3 py-2.5 bg-white border border-purple-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all text-sm font-bold" />
                                  </div>
                                  <p className="text-[9px] text-purple-400 mt-1">OTP, verification codes</p>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">💡 Set price to ₹0 for free messages in that category. Prices are per message sent.</p>
                            </div>
                            <div className="border-t border-slate-200 pt-4">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Add Balance (₹)</label>
                              <div className="relative">
                                <Wallet className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input type="number" step="1" min="0" value={editRecharge} onChange={(e) => setEditRecharge(e.target.value)} placeholder="100" className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all text-sm" />
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">{Number(editRecharge) > 0 ? <>New balance: <span className="text-emerald-600 font-bold">{formatINR((user.balance || 0) + Number(editRecharge))}</span></> : "Leave 0 to skip recharge"}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3">
                              <button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                              <button onClick={() => saveUser(user._id, "billing")} disabled={saving === user._id + "billing"} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">
                                {saving === user._id + "billing" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Billing
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ======== PLAN TAB ======== */}
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
                                  <button key={p.value} onClick={() => { setEditPlanDuration(p.value); setEditCustomDuration(""); }} className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${editPlanDuration === p.value && !editCustomDuration ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>{p.label}</button>
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

                        {/* ======== ACCOUNT TAB ======== */}
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
                                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-gray-700">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
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
                                <button type="button" onClick={() => setShowAccessToken(!showAccessToken)} className="absolute right-3 top-3 text-slate-400 hover:text-gray-700">{showAccessToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
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

                        {/* ======== LIMITS TAB ======== */}
                        {editTab === "limits" && (
                          <div className="space-y-5 sm:space-y-6 max-w-4xl">
                            {/* Preset Selector */}
                            <div className="p-4 bg-white rounded-xl border border-slate-200">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={12} /> Quick Apply Preset</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {LIMIT_PRESETS.map((preset) => (
                                  <button key={preset.label} onClick={() => applyPreset(preset.label)} className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedPreset === preset.label ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">💡 Click a preset to auto-fill all limits, then customize individual ones below.</p>
                            </div>

                            {/* Individual Limit Cards */}
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Gauge size={12} /> Resource Limits</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                {LIMIT_RESOURCES_CONFIG.map((res) => {
                                  const limit = editLimits[res.key] || { max: -1, period: "unlimited" };
                                  const colors = getLimitColor(res.color);
                                  const usage = user.usage?.[res.key];
                                  const usagePct = getUsagePercent(usage, limit);
                                  const IconComp = res.icon;
                                  const isUnlimited = limit.period === "unlimited";

                                  return (
                                    <div key={res.key} className={`p-4 ${colors.bg} border ${colors.border} rounded-xl transition-all ${isUnlimited ? "opacity-70" : ""}`}>
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <div className={`p-1.5 ${colors.iconBg} rounded-lg`}>
                                            <IconComp size={14} className={colors.iconText} />
                                          </div>
                                          <div>
                                            <p className="text-sm font-bold text-gray-900">{res.label}</p>
                                            <p className="text-[10px] text-slate-400">{res.description}</p>
                                          </div>
                                        </div>
                                        {usage && !isUnlimited && (
                                          <button
                                            onClick={() => saveUser(user._id, "resetUsage", { resetUsage: { [res.key]: true } })}
                                            disabled={saving === user._id + "resetUsage"}
                                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white/80 hover:bg-white border border-slate-200 rounded-lg transition-all"
                                            title={`Reset ${res.label} usage`}
                                          >
                                            <RotateCcw size={10} /> Reset
                                          </button>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-3">
                                        <div className="flex-1">
                                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Max Limit</label>
                                          <input
                                            type="number"
                                            min="0"
                                            value={isUnlimited ? "" : limit.max}
                                            onChange={(e) => updateLimitField(res.key, "max", parseInt(e.target.value) || 0)}
                                            disabled={isUnlimited}
                                            placeholder={isUnlimited ? "∞" : "0"}
                                            className={`w-full px-3 py-2 bg-white border ${colors.inputBorder} rounded-lg text-gray-900 focus:outline-none focus:ring-2 ${colors.inputFocus} transition-all text-sm font-bold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
                                          />
                                        </div>
                                        <div className="w-36">
                                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Period</label>
                                          <select
                                            value={limit.period}
                                            onChange={(e) => updateLimitField(res.key, "period", e.target.value)}
                                            className={`w-full px-3 py-2 bg-white border ${colors.inputBorder} rounded-lg text-sm font-bold focus:outline-none focus:ring-2 ${colors.inputFocus} transition-all appearance-none cursor-pointer`}
                                          >
                                            {PERIOD_OPTIONS.map((opt) => (
                                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      {/* Usage Display */}
                                      {usage && !isUnlimited && (
                                        <div className="mt-3">
                                          <div className="flex items-center justify-between text-[11px] mb-1">
                                            <span className="text-slate-500">
                                              Usage: <span className="font-bold text-gray-700">{usage.count || 0}</span> / <span className="font-bold">{limit.max}</span>
                                              {limit.period !== "total" && <span className="text-slate-400"> per {limit.period}</span>}
                                            </span>
                                            <span className={`font-bold ${usagePct >= 90 ? "text-red-500" : usagePct >= 70 ? "text-amber-500" : "text-emerald-500"}`}>{usagePct}%</span>
                                          </div>
                                          <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${usagePct >= 90 ? "bg-red-500" : usagePct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                                              style={{ width: `${usagePct}%` }}
                                            />
                                          </div>
                                          {usage.resetAt && (
                                            <p className="text-[9px] text-slate-400 mt-1">Resets: {formatDate(usage.resetAt)}</p>
                                          )}
                                        </div>
                                      )}

                                      {isUnlimited && (
                                        <div className="mt-3 flex items-center gap-1.5 text-emerald-500">
                                          <InfinityIcon size={14} />
                                          <span className="text-xs font-bold">No limit — unlimited usage</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-200">
                              <button
                                onClick={() => saveUser(user._id, "resetAllUsage")}
                                disabled={saving === user._id + "resetAllUsage"}
                                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
                              >
                                {saving === user._id + "resetAllUsage" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Reset All Usage
                              </button>
                              <div className="flex-1" />
                              <button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                              <button
                                onClick={() => saveUser(user._id, "limits")}
                                disabled={saving === user._id + "limits"}
                                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm"
                              >
                                {saving === user._id + "limits" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Limits
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
              Category-based pricing: Marketing, Utility, Authentication. Limits control resource creation per time period. Suspended/expired users will see a blocked screen on login.
            </p>
          </div>
        </div>
      </div>
      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
