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
  RotateCcw, Gauge, Package, Trash2, Check, Globe
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const PLAN_PRESETS = [
  { label: "1 Hour", value: "1h" }, { label: "6 Hours", value: "6h" }, { label: "1 Day", value: "1d" }, { label: "3 Days", value: "3d" },
  { label: "1 Week", value: "1w" }, { label: "2 Weeks", value: "2w" }, { label: "1 Month", value: "1mo" }, { label: "3 Months", value: "3mo" },
  { label: "6 Months", value: "6mo" }, { label: "1 Year", value: "1y" }, { label: "2 Years", value: "2y" }, { label: "Unlimited", value: "unlimited" },
];

const PERIOD_OPTIONS = [
  { value: "day", label: "Per Day" }, { value: "month", label: "Per Month" }, { value: "year", label: "Per Year" },
  { value: "total", label: "Total (Lifetime)" }, { value: "unlimited", label: "Unlimited ♾️" },
];

const LIMIT_RESOURCES_CONFIG = [
  { key: "tags", label: "Tags", icon: Tag, color: "orange", description: "Contact & group tag creation" },
  { key: "workflows", label: "Workflows", icon: GitBranch, color: "emerald", description: "Automation workflow creation" },
  { key: "templates", label: "Templates", icon: FileText, color: "blue", description: "Message template creation" },
  { key: "testMessages", label: "Test Messages", icon: Send, color: "violet", description: "Test message sends" },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, color: "rose", description: "Campaign creation & launch" },
  { key: "optNumbers", label: "Opt-in Numbers", icon: UserPlus, color: "cyan", description: "Opt-in contact numbers" },
  { key: "forms", label: "Forms", icon: ClipboardList, color: "amber", description: "Form creation" },
  { key: "whatsappNumbers", label: "WhatsApp Numbers", icon: Phone, color: "indigo", description: "Multiple WA numbers per user" },
];

const LIMIT_PRESETS = [
  { label: "Free Tier", limits: { tags: { max: 5, period: "month" }, workflows: { max: 2, period: "total" }, templates: { max: 3, period: "total" }, testMessages: { max: 5, period: "day" }, campaigns: { max: 2, period: "month" }, optNumbers: { max: 50, period: "total" }, forms: { max: 2, period: "total" }, whatsappNumbers: { max: 1, period: "total" } } },
  { label: "Basic", limits: { tags: { max: 50, period: "month" }, workflows: { max: 5, period: "total" }, templates: { max: 10, period: "total" }, testMessages: { max: 20, period: "day" }, campaigns: { max: 5, period: "month" }, optNumbers: { max: 500, period: "total" }, forms: { max: 5, period: "total" }, whatsappNumbers: { max: 2, period: "total" } } },
  { label: "Pro", limits: { tags: { max: 200, period: "month" }, workflows: { max: 20, period: "total" }, templates: { max: 50, period: "total" }, testMessages: { max: 100, period: "day" }, campaigns: { max: 20, period: "month" }, optNumbers: { max: 5000, period: "total" }, forms: { max: 20, period: "total" }, whatsappNumbers: { max: 5, period: "total" } } },
  { label: "Enterprise", limits: { tags: { max: -1, period: "unlimited" }, workflows: { max: -1, period: "unlimited" }, templates: { max: -1, period: "unlimited" }, testMessages: { max: -1, period: "unlimited" }, campaigns: { max: -1, period: "unlimited" }, optNumbers: { max: -1, period: "unlimited" }, forms: { max: -1, period: "unlimited" }, whatsappNumbers: { max: -1, period: "unlimited" } } },
];

const DEFAULT_LIMITS: Record<string, { max: number; period: string }> = {
  tags: { max: -1, period: "unlimited" }, workflows: { max: -1, period: "unlimited" }, templates: { max: -1, period: "unlimited" },
  testMessages: { max: -1, period: "unlimited" }, campaigns: { max: -1, period: "unlimited" }, optNumbers: { max: -1, period: "unlimited" }, 
  forms: { max: -1, period: "unlimited" }, whatsappNumbers: { max: -1, period: "unlimited" },
};

type LimitValue = { max: number; period: string };

function getLimitColor(color: string) {
  const map: Record<string, any> = {
    orange: { bg: "bg-orange-50", border: "border-orange-200", iconBg: "bg-orange-100", iconText: "text-orange-600", inputBorder: "border-orange-200", inputFocus: "focus:ring-orange-500/30 focus:border-orange-400" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-100", iconText: "text-emerald-600", inputBorder: "border-emerald-200", inputFocus: "focus:ring-emerald-500/30 focus:border-emerald-400" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", iconBg: "bg-blue-100", iconText: "text-blue-600", inputBorder: "border-blue-200", inputFocus: "focus:ring-blue-500/30 focus:border-blue-400" },
    violet: { bg: "bg-violet-50", border: "border-violet-200", iconBg: "bg-violet-100", iconText: "text-violet-600", inputBorder: "border-violet-200", inputFocus: "focus:ring-violet-500/30 focus:border-violet-400" },
    rose: { bg: "bg-rose-50", border: "border-rose-200", iconBg: "bg-rose-100", iconText: "text-rose-600", inputBorder: "border-rose-200", inputFocus: "focus:ring-rose-500/30 focus:border-rose-400" },
    cyan: { bg: "bg-cyan-50", border: "border-cyan-200", iconBg: "bg-cyan-100", iconText: "text-cyan-600", inputBorder: "border-cyan-200", inputFocus: "focus:ring-cyan-500/30 focus:border-cyan-400" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconText: "text-amber-600", inputBorder: "border-amber-200", inputFocus: "focus:ring-amber-500/30 focus:border-amber-400" },
    indigo: { bg: "bg-indigo-50", border: "border-indigo-200", iconBg: "bg-indigo-100", iconText: "text-indigo-600", inputBorder: "border-indigo-200", inputFocus: "focus:ring-indigo-500/30 focus:border-indigo-400" },
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
  const [editTab, setEditTab] = useState<"billing" | "plan" | "account" | "credentials" | "limits" | "tenancy" | "integrations">("billing");
  const [editRecharge, setEditRecharge] = useState("");
  const [editPlanDuration, setEditPlanDuration] = useState("1mo");
  const [editCustomDuration, setEditCustomDuration] = useState("");
  const [editSuspendReason, setEditSuspendReason] = useState("");

  const [editPriceMarketing, setEditPriceMarketing] = useState("0.90");
  const [editPriceUtility, setEditPriceUtility] = useState("0.50");
  const [editPriceAuthentication, setEditPriceAuthentication] = useState("0.30");

  // ✅ Country Pricing State
  const [editMaxCountries, setEditMaxCountries] = useState("0");
  const [editEnabledCountries, setEditEnabledCountries] = useState<any[]>([]);

  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPhoneNumberId, setEditPhoneNumberId] = useState("");
  const [editWabaId, setEditWabaId] = useState("");
  const [editAccessToken, setEditAccessToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);

  const [editLimits, setEditLimits] = useState<Record<string, LimitValue>>({ ...DEFAULT_LIMITS });
  const [selectedPreset, setSelectedPreset] = useState("");

  const [editIsTenant, setEditIsTenant] = useState(false);
  const [editMaxSubUsers, setEditMaxSubUsers] = useState("0");

  const [editHideIntegrations, setEditHideIntegrations] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", password: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [requests, setRequests] = useState<any[]>([]);
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);

  const [saving, setSaving] = useState<string | null>(null);

  const formatINR = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(amount);
  const formatDate = (date: string | null) => !date ? "N/A" : new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const getPlanLabel = (duration: string | null) => !duration ? "No Plan" : (PLAN_PRESETS.find(p => p.value === duration)?.label || duration);
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" };
      case "expired": return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" };
      case "suspended": return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" };
      default: return { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", dot: "bg-gray-500" };
    }
  };

  const getActiveLimitsCount = (limits: any) => !limits ? 0 : Object.values(limits).filter((l: any) => l.period !== "unlimited").length;
  const getUsagePercent = (usage: any, limit: any) => (!usage || !limit || limit.period === "unlimited" || limit.max <= 0) ? 0 : Math.min(100, Math.round(((usage.count || 0) / limit.max) * 100));

  const handleVerify = async () => {
    if (!adminKey.trim()) { toast.error("Please enter the admin key"); return; }
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminKey }) });
      const data = await res.json();
      if (data.success) { setIsVerified(true); toast.success("Admin verified!"); fetchUsers(); fetchRequests(); } else toast.error("Invalid admin key");
    } catch { toast.error("Verification failed"); } finally { setVerifying(false); }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/billing", { headers: { "x-admin-key": adminKey } });
      const data = await res.json();
      if (data.success) setUsers(data.users); else toast.error("Failed to fetch users");
    } catch { toast.error("Error fetching users"); } finally { setLoading(false); }
  };

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/admin/requests", { headers: { "x-admin-key": adminKey } });
      const data = await res.json();
      if (data.success) setRequests(data.requests);
    } catch { console.error("Error fetching requests"); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ action: "createUser", name: newUser.name, password: newUser.password }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("User created successfully!");
        setShowCreateModal(false);
        setNewUser({ name: "", password: "" });
        fetchUsers();
      } else { toast.error(data.message || "Failed to create user"); }
    } catch { toast.error("Error creating user"); } finally { setCreatingUser(false); }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${name}"? This action cannot be undone.`)) return;
    setDeletingId(userId);
    try {
      const res = await fetch(`/api/admin/billing?userId=${userId}`, { method: "DELETE", headers: { "x-admin-key": adminKey } });
      const data = await res.json();
      if (data.success) {
        toast.success("User deleted successfully");
        fetchUsers();
      } else { toast.error(data.message || "Failed to delete user"); }
    } catch { toast.error("Error deleting user"); } finally { setDeletingId(null); }
  };

  const handleProcessRequest = async (reqId: string, action: "approve" | "reject") => {
    setProcessingReqId(reqId);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ requestId: reqId, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchRequests();
        fetchUsers(); 
      } else { toast.error(data.message || "Failed to process request"); }
    } catch { toast.error("Error processing request"); } finally { setProcessingReqId(null); }
  };

  const startEdit = (user: any, tab: "billing" | "plan" | "account" | "credentials" | "limits" | "tenancy" | "integrations" = "billing") => {
    setEditingUserId(user._id);
    setEditTab(tab);
    setEditPriceMarketing(user.priceMarketing?.toString() || "0.90");
    setEditPriceUtility(user.priceUtility?.toString() || "0.50");
    setEditPriceAuthentication(user.priceAuthentication?.toString() || "0.30");
    
    // ✅ Set Country State
    setEditMaxCountries(user.maxEnabledCountries?.toString() || "0");
    setEditEnabledCountries(user.enabledCountries || []);

    setEditRecharge(""); setEditPlanDuration(user.planDuration || "1mo"); setEditCustomDuration(""); setEditSuspendReason("");
    setEditName(user.name || ""); setEditPassword(user.password || ""); setEditPhoneNumberId(user.whatsappPhoneNumberId || "");
    setEditWabaId(user.wabaId || ""); setEditAccessToken(user.whatsappAccessToken || "");
    setShowPassword(false); setShowAccessToken(false);
    setEditIsTenant(user.isTenant || false); setEditMaxSubUsers(user.maxSubUsers?.toString() || "0");
    setEditHideIntegrations(user.hideIntegrations || false);

    const userLimits: Record<string, LimitValue> = {};
    for (const res of LIMIT_RESOURCES_CONFIG) userLimits[res.key] = user.limits?.[res.key] || DEFAULT_LIMITS[res.key];
    setEditLimits(userLimits); setSelectedPreset("");
  };

  const cancelEdit = () => { setEditingUserId(null); setEditTab("billing"); };

  const updateLimitField = (resource: string, field: "max" | "period", value: number | string) => {
    setEditLimits(prev => {
      const current = { ...prev[resource] };
      if (field === "period") { current.period = value as string; if (value === "unlimited") current.max = -1; else if (current.max === -1) current.max = 0; } 
      else { current.max = value as number; }
      return { ...prev, [resource]: current };
    });
    setSelectedPreset("");
  };

  const applyPreset = (presetLabel: string) => {
    const preset = LIMIT_PRESETS.find(p => p.label === presetLabel);
    if (preset) { setEditLimits({ ...preset.limits }); setSelectedPreset(presetLabel); toast.info(`Applied "${presetLabel}" limits preset`); }
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
        
        // ✅ Force convert to Numbers on the frontend before sending
        body.maxEnabledCountries = Number(editMaxCountries) || 0;
        body.enabledCountries = editEnabledCountries.map((c: any) => ({
          name: String(c.name || ""),
          code: String(c.code || "").replace(/\D/g, ""),
          priceMarketing: Number(c.priceMarketing) || 0,
          priceUtility: Number(c.priceUtility) || 0,
          priceAuthentication: Number(c.priceAuthentication) || 0
        }));
      }
      if (action === "plan") { body.activatePlan = true; body.planDuration = editCustomDuration || editPlanDuration; }
      if (action === "clearPlan") body.clearPlan = true;
      if (action === "suspend") { body.suspendAccount = true; body.suspendReason = editSuspendReason || "Suspended by admin"; }
      if (action === "reactivate") body.reactivateAccount = true;
      if (action === "credentials") {
        body.whatsappPhoneNumberId = editPhoneNumberId; body.wabaId = editWabaId;
        if (editAccessToken.trim() !== "") body.whatsappAccessToken = editAccessToken;
        if (editName.trim() !== "") body.name = editName; if (editPassword.trim() !== "") body.password = editPassword;
      }
      if (action === "limits") body.limits = editLimits;
      if (action === "tenancy") { body.isTenant = editIsTenant; body.maxSubUsers = Number(editMaxSubUsers); }
      
      if (action === "integrations") { body.hideIntegrations = extraData?.hideIntegrations !== undefined ? extraData.hideIntegrations : editHideIntegrations; }
      if (action === "disconnectGoogle") { body.disconnectGoogle = true; }

      if (action === "resetUsage") { body.resetUsage = extraData?.resetUsage || {}; body.limits = editLimits; }
      if (action === "resetAllUsage") { body.resetAllUsage = true; body.limits = editLimits; }

      const res = await fetch("/api/admin/billing", { method: "PUT", headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        toast.success(`Updated ${data.user.name}`); fetchUsers();
        if (action === "disconnectGoogle") {
          toast.success("Google account disconnected for this user.");
        } else if (action !== "integrations") {
          cancelEdit();
        }
      } else { toast.error(data.message || "Failed to update"); }
    } catch { toast.error("Error updating user"); } finally { setSaving(null); }
  };

  const toggleHideIntegrations = (userId: string) => {
    const newVal = !editHideIntegrations;
    setEditHideIntegrations(newVal);
    saveUser(userId, "integrations", { hideIntegrations: newVal });
  };

  const filteredUsers = users
    .filter(u => statusFilter === "all" || u.accountStatus === statusFilter)
    .filter(u => { if (!searchTerm) return true; const lt = searchTerm.toLowerCase(); return u.name?.toLowerCase().includes(lt) || u.whatsappPhoneNumberId?.toLowerCase().includes(lt) || u.wabaId?.toLowerCase().includes(lt); });

  const activeCount = users.filter(u => u.accountStatus === "active").length;
  const expiredCount = users.filter(u => u.accountStatus === "expired").length;

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl">
            <div className="flex items-center justify-center mb-6 sm:mb-8">
              <div className="p-3 sm:p-4 bg-amber-100 rounded-2xl border border-amber-200"><Shield className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600" /></div>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">Admin Billing Panel</h1>
            <p className="text-gray-500 text-xs sm:text-sm text-center mb-6 sm:mb-8">Enter the admin secret key to access user management</p>
            <div className="space-y-4">
              <div className="relative">
                <input type={showKey ? "text" : "password"} value={adminKey} onChange={e => setAdminKey(e.target.value)} onKeyDown={e => e.key === "Enter" && handleVerify()} placeholder="Enter admin secret key" className="w-full px-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm" />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3.5 text-slate-400 hover:text-gray-700 transition">{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <button onClick={handleVerify} disabled={verifying} className="w-full flex items-center justify-center gap-2 px-6 py-3 sm:py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-sm">
                {verifying ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} {verifying ? "Verifying..." : "Access Admin Panel"}
              </button>
            </div>
            <p className="text-slate-400 text-[10px] text-center mt-6">Set ADMIN_SECRET_KEY in your .env.local file. Default: admin123</p>
          </div>
        </div>
        <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />
      <div className="md:ml-64 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-lg shadow-amber-200"><Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" /></div>
            <div>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">Admin Panel</h1>
              <p className="text-gray-500 text-xs sm:text-sm">Manage users, billing, plans, limits & accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setShowCreateModal(true)} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:from-indigo-600 hover:to-blue-600 transition-all w-full sm:w-auto">
              <UserPlus size={16} /> Create User
            </button>
            <button onClick={() => { fetchUsers(); fetchRequests(); }} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium hover:bg-slate-50 shadow-sm transition-all w-full sm:w-auto justify-center">
              <RefreshCw size={16} className={loading ? "animate-spin text-amber-500" : ""} /> Refresh
            </button>
          </div>
        </div>

        {requests.length > 0 && (
          <div className="mb-6 bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
            <h2 className="text-lg font-bold text-amber-700 mb-4 flex items-center gap-2">
              <AlertCircle size={18} /> Pending Configuration Requests ({requests.length})
            </h2>
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-100 gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-white rounded-lg border border-amber-200 mt-0.5">
                      <Phone size={16} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{req.userName}</p>
                      <p className="text-xs text-indigo-600 font-bold mt-0.5">
                        {req.requestType === "edit" ? "Editing Existing Number" : "Adding New Number"}: {req.name || "WhatsApp Number"}
                      </p>
                      <div className="text-xs text-gray-600 mt-1 space-y-0.5 font-mono">
                        {req.wabaId && <p>WABA ID: <span className="font-semibold">{req.wabaId}</span></p>}
                        {req.whatsappPhoneNumberId && <p>Phone ID: <span className="font-semibold">{req.whatsappPhoneNumberId}</span></p>}
                        <p className="text-emerald-600 font-bold flex items-center gap-1"><KeyRound size={10} /> {req.whatsappAccessToken ? "New Token Provided" : "No Token Change"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button onClick={() => handleProcessRequest(req._id, "approve")} disabled={processingReqId === req._id} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-all disabled:opacity-50">
                      {processingReqId === req._id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                    </button>
                    <button onClick={() => handleProcessRequest(req._id, "reject")} disabled={processingReqId === req._id} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-all disabled:opacity-50">
                      <X size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm"><p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Users</p><p className="text-xl sm:text-2xl font-extrabold">{users.length}</p></div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm"><p className="text-[9px] sm:text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1 flex items-center gap-1"><BadgeCheck size={10} /> Active</p><p className="text-xl sm:text-2xl font-extrabold text-emerald-600">{activeCount}</p></div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm"><p className="text-[9px] sm:text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1"><AlertTriangle size={10} /> Expired</p><p className="text-xl sm:text-2xl font-extrabold text-amber-600">{expiredCount}</p></div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm"><p className="text-[9px] sm:text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Wallet size={10} /> Balance Held</p><p className="text-xl sm:text-2xl font-extrabold text-blue-600">{formatINR(users.reduce((s, u) => s + (u.isTenant || !u.parentTenantId ? (u.balance || 0) : 0), 0))}</p></div>
          <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1"><p className="text-[9px] sm:text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-1 flex items-center gap-1"><CreditCard size={10} /> Total In</p><p className="text-xl sm:text-2xl font-extrabold text-violet-600">{formatINR(users.reduce((s, u) => s + (u.isTenant || !u.parentTenantId ? (u.totalRecharged || 0) : 0), 0))}</p></div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by name, phone ID, or WABA ID..." className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all" />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400 hidden sm:block" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full sm:w-auto px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500/20 outline-none appearance-none cursor-pointer">
              <option value="all">All Status</option><option value="active">Active</option><option value="expired">Expired</option><option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400"><Users className="w-12 h-12 mx-auto mb-3 text-slate-200" /><p className="font-medium text-slate-500">No users found</p></div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.map(user => {
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
                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${user.accountStatus === "active" ? "bg-gradient-to-br from-emerald-400 to-teal-500" : user.accountStatus === "suspended" ? "bg-gradient-to-br from-red-400 to-red-500" : "bg-gradient-to-br from-amber-400 to-orange-500"}`}>{user.name?.charAt(0).toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 mb-0.5">
                            <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">{user.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc.bg} ${sc.text} ${sc.border} flex items-center gap-1 shrink-0`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{user.accountStatus?.toUpperCase()}</span>
                            {user.planDuration && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 flex items-center gap-1 shrink-0"><Clock size={9} /> {planLabel}</span>}
                            {user.isTenant && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1 shrink-0"><Building2 size={9} /> Tenant</span>}
                            {activeLimits > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1 shrink-0"><Gauge size={9} /> {activeLimits} limit{activeLimits > 1 ? "s" : ""}</span>}
                            {user.hideIntegrations && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1 shrink-0"><EyeOff size={9} /> Integrations Hidden</span>}
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
                            <p className="text-[9px] text-slate-400 font-bold uppercase flex items-center gap-1 justify-end">
                              {user.parentTenantId ? <><Users size={10} /> Shared Bal</> : "Balance"}
                            </p>
                            <p className={`text-xs sm:text-sm font-extrabold ${(user.balance || 0) <= 0 ? "text-red-600" : "text-emerald-600"}`}>{formatINR(user.balance || 0)}</p>
                          </div>
                          <div className="flex-1 sm:flex-none text-right px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 rounded-lg sm:rounded-xl border border-slate-100"><p className="text-[9px] text-slate-400 font-bold uppercase">Prices (M/U/A)</p><div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-extrabold"><span className="text-orange-600" title="Marketing">{formatINR(user.priceMarketing || 0.90)}</span><span className="text-slate-300">/</span><span className="text-blue-600" title="Utility">{formatINR(user.priceUtility || 0.50)}</span><span className="text-slate-300">/</span><span className="text-purple-600" title="Authentication">{formatINR(user.priceAuthentication || 0.30)}</span></div></div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                          <button onClick={() => window.open("/", "_blank")} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Open User Dashboard"><ExternalLink size={16} /></button>
                          
                          {user.accountStatus === "active" ? (
                            <button onClick={() => saveUser(user._id, "suspend")} disabled={saving === user._id + "suspend"} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Suspend Account">{saving === user._id + "suspend" ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}</button>
                          ) : (
                            <button onClick={() => saveUser(user._id, "reactivate")} disabled={saving === user._id + "reactivate"} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Reactivate Account">{saving === user._id + "reactivate" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}</button>
                          )}

                          <button onClick={() => handleDeleteUser(user._id, user.name)} disabled={deletingId === user._id} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete User">
                            {deletingId === user._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>

                          {!isEditing ? (
                            <button onClick={() => startEdit(user)} className="px-3 sm:px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold transition-all"><UserCog size={14} className="inline mr-1" /> Manage</button>
                          ) : (
                            <button onClick={cancelEdit} className="px-3 sm:px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all"><X size={14} className="inline mr-1" /> Close</button>
                          )}
                        </div>
                      </div>
                    </div>

                    {user.isTenant && user.subUsersList?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Users size={10} /> Sub-Users ({user.subUsersList.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {user.subUsersList.map((sub: any) => (
                            <span key={sub.id} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium border border-slate-200">{sub.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {user.limits && activeLimits > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Limits:</span>
                        {LIMIT_RESOURCES_CONFIG.map(res => {
                          const limit = user.limits[res.key]; const usage = user.usage?.[res.key];
                          if (!limit || limit.period === "unlimited") return null;
                          const pct = getUsagePercent(usage, limit);
                          return <span key={res.key} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${pct >= 90 ? "bg-red-50 text-red-600 border border-red-200" : pct >= 70 ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>{res.label}: {usage?.count || 0}/{limit.max === -1 ? "∞" : limit.max}{limit.period !== "total" && <span className="text-[8px] ml-0.5 opacity-70">/{limit.period}</span>}</span>;
                        })}
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="border-t border-slate-100 bg-slate-50/50">
                      <div className="flex overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
                        {[{ id: "billing", label: "Billing", icon: Wallet }, { id: "plan", label: "Plan", icon: CalendarDays }, { id: "account", label: "Account", icon: UserCog }, { id: "credentials", label: "Credentials", icon: KeyRound }, { id: "limits", label: "Limits", icon: Gauge }, { id: "tenancy", label: "Tenancy", icon: Building2 }, { id: "integrations", label: "Integrations", icon: FileText }].map(tab => (
                          <button key={tab.id} onClick={() => setEditTab(tab.id as any)} className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${editTab === tab.id ? "border-amber-500 text-amber-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}><tab.icon size={14} /> {tab.label}</button>
                        ))}
                      </div>
                      <div className="p-4 sm:p-6">
                        {editTab === "billing" && (
                          <div className="space-y-5 sm:space-y-6 max-w-2xl">
                            <div>
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><IndianRupee size={12} /> Category-Based Message Pricing (Global Default)</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                <div className="p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-xl"><label className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Megaphone size={12} /> Marketing</label><input type="number" step="0.01" min="0" value={editPriceMarketing} onChange={e => setEditPriceMarketing(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-orange-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all text-sm font-bold" /><p className="text-[9px] text-orange-400 mt-1">Promotional messages</p></div>
                                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl"><label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Wrench size={12} /> Utility</label><input type="number" step="0.01" min="0" value={editPriceUtility} onChange={e => setEditPriceUtility(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-sm font-bold" /><p className="text-[9px] text-blue-400 mt-1">Account updates, alerts</p></div>
                                <div className="p-3 sm:p-4 bg-purple-50 border border-purple-200 rounded-xl"><label className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ShieldCheck size={12} /> Authentication</label><input type="number" step="0.01" min="0" value={editPriceAuthentication} onChange={e => setEditPriceAuthentication(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-purple-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-all text-sm font-bold" /><p className="text-[9px] text-purple-400 mt-1">OTP, verification codes</p></div>
                              </div>
                            </div>

                            {/* ✅ COUNTRY PRICING SECTION INSIDE BILLING TAB */}
                            <div className="border-t border-slate-200 pt-5">
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Globe size={12} /> Country-Specific Pricing</p>
                              <div className="mb-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Max Allowed Countries</label>
                                <input type="number" min="0" value={editMaxCountries} onChange={e => setEditMaxCountries(e.target.value)} className="w-36 px-3 py-2 bg-white border border-slate-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-bold" />
                                <p className="text-[9px] text-slate-400 mt-1">Set 0 for unlimited countries (Global pricing applies).</p>
                              </div>
                              <div className="space-y-3">
                                {editEnabledCountries.map((c, idx) => (
                                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="sm:col-span-3">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Country Name</label>
                                      <input type="text" placeholder="India" value={c.name} onChange={e => { const n=[...editEnabledCountries]; n[idx].name=e.target.value; setEditEnabledCountries(n); }} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Code (e.g. 91)</label>
                                      <input type="text" placeholder="91" value={c.code} onChange={e => { const n=[...editEnabledCountries]; n[idx].code=e.target.value.replace(/\D/g,''); setEditEnabledCountries(n); }} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Mkt ₹</label>
                                      <input type="number" step="0.01" value={c.priceMarketing} onChange={e => { const n=[...editEnabledCountries]; n[idx].priceMarketing=e.target.value; setEditEnabledCountries(n); }} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Util ₹</label>
                                      <input type="number" step="0.01" value={c.priceUtility} onChange={e => { const n=[...editEnabledCountries]; n[idx].priceUtility=e.target.value; setEditEnabledCountries(n); }} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm" />
                                    </div>
                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Auth ₹</label>
                                      <input type="number" step="0.01" value={c.priceAuthentication} onChange={e => { const n=[...editEnabledCountries]; n[idx].priceAuthentication=e.target.value; setEditEnabledCountries(n); }} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm" />
                                    </div>
                                    <div className="sm:col-span-1 flex justify-end">
                                      <button onClick={() => setEditEnabledCountries(editEnabledCountries.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg h-9"><Trash2 size={14} /></button>
                                    </div>
                                  </div>
                                ))}
                                {editEnabledCountries.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No countries added. Base pricing will apply globally.</p>}
                              </div>
                              <button onClick={() => setEditEnabledCountries([...editEnabledCountries, { name: "", code: "", priceMarketing: "0.90", priceUtility: "0.50", priceAuthentication: "0.30" }])} className="mt-3 text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">+ Add Country</button>
                            </div>

                            <div className="border-t border-slate-200 pt-4">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Add Balance (₹)</label>
                              <input type="number" step="1" min="0" value={editRecharge} onChange={e => setEditRecharge(e.target.value)} placeholder="100" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all text-sm" />
                              <p className="text-[10px] text-slate-400 mt-1">{Number(editRecharge) > 0 ? <>New balance: <span className="text-emerald-600 font-bold">{formatINR((user.balance || 0) + Number(editRecharge))}</span></> : "Leave 0 to skip recharge"}</p>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-3">
                              <button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                              <button onClick={() => saveUser(user._id, "billing")} disabled={saving === user._id + "billing"} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">{saving === user._id + "billing" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Billing</button>
                            </div>
                          </div>
                        )}
                        {editTab === "plan" && (
                          <div className="max-w-2xl space-y-5 sm:space-y-6">
                            <div className="p-4 bg-white rounded-xl border border-slate-200"><p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Current Plan</p><div className="flex flex-wrap items-center gap-3"><span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>{planLabel}</span>{user.planExpiry ? <span className={`text-xs ${isExpired ? "text-red-500 font-bold" : "text-slate-400"}`}>{isExpired ? "EXPIRED" : `Expires ${formatDate(user.planExpiry)}`}</span> : <span className="text-xs text-slate-400">No plan assigned</span>}</div></div>
                            <div><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Select Plan Duration</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{PLAN_PRESETS.map(p => <button key={p.value} onClick={() => { setEditPlanDuration(p.value); setEditCustomDuration(""); }} className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${editPlanDuration === p.value && !editCustomDuration ? "bg-amber-50 border-amber-300 text-amber-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>{p.label}</button>)}</div></div>
                            <div><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Or Custom Duration</p><input type="text" value={editCustomDuration} onChange={e => setEditCustomDuration(e.target.value)} placeholder="e.g. 45d, 2mo, 18m" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm" /></div>
                            <div className="flex flex-col sm:flex-row gap-3 pt-3">
                              <button onClick={() => saveUser(user._id, "plan")} disabled={saving === user._id + "plan"} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">{saving === user._id + "plan" ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Activate Plan</button>
                              {user.planDuration && <button onClick={() => saveUser(user._id, "clearPlan")} disabled={saving === user._id + "clearPlan"} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Remove Plan</button>}
                            </div>
                          </div>
                        )}
                        {editTab === "account" && (
                          <div className="max-w-2xl space-y-5">
                            <div className="p-4 bg-white rounded-xl border border-slate-200"><div className="flex justify-between items-center"><div><p className="text-sm font-bold text-gray-900">Account Status</p><p className="text-xs text-slate-400 mt-0.5">{user.accountStatus === "active" ? "Account is active." : "Needs attention."}</p></div><span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>{user.accountStatus?.toUpperCase()}</span></div></div>
                            {user.accountStatus === "active" && (
                              <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                                <p className="text-sm font-bold text-red-800 flex items-center gap-2"><Ban size={16} /> Suspend Account</p>
                                <input type="text" value={editSuspendReason} onChange={e => setEditSuspendReason(e.target.value)} placeholder="Reason for suspension" className="w-full px-4 py-2.5 bg-white border border-red-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all text-sm" />
                                <button onClick={() => saveUser(user._id, "suspend", { suspendReason: editSuspendReason })} disabled={saving === user._id + "suspend"} className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all disabled:opacity-50 text-sm">{saving === user._id + "suspend" ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Suspend Now</button>
                              </div>
                            )}
                            {(user.accountStatus === "suspended" || user.accountStatus === "expired") && (
                              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <p className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2"><Play size={16} /> Reactivate Account</p>
                                <button onClick={() => saveUser(user._id, "reactivate")} disabled={saving === user._id + "reactivate"} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50 text-sm">{saving === user._id + "reactivate" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Reactivate</button>
                              </div>
                            )}
                          </div>
                        )}
                        {editTab === "credentials" && (
                          <div className="space-y-5 sm:space-y-6 max-w-2xl">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><User size={12} /> Username</label>
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><Lock size={12} /> Password</label>
                                <div className="relative">
                                  <input type={showPassword ? "text" : "password"} value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono pr-10" />
                                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-gray-700 transition">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><Building2 size={12} /> WABA ID</label>
                                <input type="text" value={editWabaId} onChange={e => setEditWabaId(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono" />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><Phone size={12} /> Phone Number ID</label>
                                <input type="text" value={editPhoneNumberId} onChange={e => setEditPhoneNumberId(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block flex items-center gap-1.5"><KeyRound size={12} /> Access Token</label>
                              <div className="relative">
                                <input type={showAccessToken ? "text" : "password"} value={editAccessToken} onChange={e => setEditAccessToken(e.target.value)} placeholder="Leave blank to keep existing" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all text-sm font-mono pr-10" />
                                <button type="button" onClick={() => setShowAccessToken(!showAccessToken)} className="absolute right-3 top-3 text-slate-400 hover:text-gray-700 transition">
                                  {showAccessToken ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1">Leave blank to keep the existing token unchanged.</p>
                            </div>
                            <div className="flex justify-end gap-3 pt-3">
                              <button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button>
                              <button onClick={() => saveUser(user._id, "credentials")} disabled={saving === user._id + "credentials"} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">{saving === user._id + "credentials" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Credentials</button>
                            </div>
                          </div>
                        )}
                        {editTab === "limits" && (
                          <div className="space-y-5 sm:space-y-6 max-w-4xl">
                            <div className="p-4 bg-white rounded-xl border border-slate-200"><p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Package size={12} /> Quick Apply Preset</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{LIMIT_PRESETS.map(preset => <button key={preset.label} onClick={() => applyPreset(preset.label)} className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedPreset === preset.label ? "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>{preset.label}</button>)}</div></div>
                            <div><p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Gauge size={12} /> Resource Limits</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">{LIMIT_RESOURCES_CONFIG.map(res => { const limit = editLimits[res.key] || { max: -1, period: "unlimited" }; const colors = getLimitColor(res.color); const isUnlimited = limit.period === "unlimited"; return <div key={res.key} className={`p-4 ${colors.bg} border ${colors.border} rounded-xl transition-all ${isUnlimited ? "opacity-70" : ""}`}><div className="flex items-center gap-2 mb-3"><div className={`p-1.5 ${colors.iconBg} rounded-lg`}><res.icon size={14} className={colors.iconText} /></div><div><p className="text-sm font-bold text-gray-900">{res.label}</p><p className="text-[10px] text-slate-400">{res.description}</p></div></div><div className="flex items-center gap-3"><div className="flex-1"><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Max Limit</label><input type="number" min="0" value={isUnlimited ? "" : limit.max} onChange={e => updateLimitField(res.key, "max", parseInt(e.target.value) || 0)} disabled={isUnlimited} placeholder={isUnlimited ? "∞" : "0"} className={`w-full px-3 py-2 bg-white border ${colors.inputBorder} rounded-lg text-gray-900 focus:outline-none focus:ring-2 ${colors.inputFocus} transition-all text-sm font-bold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`} /></div><div className="w-36"><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Period</label><select value={limit.period} onChange={e => updateLimitField(res.key, "period", e.target.value)} className={`w-full px-3 py-2 bg-white border ${colors.inputBorder} rounded-lg text-sm font-bold focus:outline-none focus:ring-2 ${colors.inputFocus} transition-all appearance-none cursor-pointer`}>{PERIOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div></div></div>; })}</div></div>
                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200"><button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button><button onClick={() => saveUser(user._id, "limits")} disabled={saving === user._id + "limits"} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">{saving === user._id + "limits" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Limits</button></div>
                          </div>
                        )}
                        {editTab === "tenancy" && (
                          <div className="space-y-5 max-w-2xl">
                            <div className="p-4 bg-white rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between mb-4">
                                <div><p className="text-sm font-bold text-gray-900">Enable Tenant System</p><p className="text-xs text-slate-400 mt-0.5">Allows this user to create and manage sub-users.</p></div>
                                <button onClick={() => setEditIsTenant(!editIsTenant)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editIsTenant ? "bg-indigo-600" : "bg-gray-200"}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editIsTenant ? "translate-x-6" : "translate-x-1"}`} /></button>
                              </div>
                              {editIsTenant && <div className="mt-4 pt-4 border-t border-slate-100"><label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Max Sub-Users Allowed</label><input type="number" min="0" value={editMaxSubUsers} onChange={e => setEditMaxSubUsers(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all text-sm" /></div>}
                            </div>
                            <div className="flex justify-end gap-3 pt-3"><button onClick={cancelEdit} className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all">Cancel</button><button onClick={() => saveUser(user._id, "tenancy")} disabled={saving === user._id + "tenancy"} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 text-sm">{saving === user._id + "tenancy" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Tenancy</button></div>
                          </div>
                        )}
                        
                        {editTab === "integrations" && (
                          <div className="space-y-5 max-w-2xl">
                            <div className="p-4 bg-white rounded-xl border border-slate-200">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                                <div>
                                  <p className="text-sm font-bold text-gray-900">Integrations Visibility</p>
                                  <p className="text-xs text-slate-400 mt-0.5">Hide or show the Integrations section in the user&apos;s Settings. Background syncs continue to work even if hidden.</p>
                                </div>
                                <button 
                                  onClick={() => toggleHideIntegrations(user._id)} 
                                  disabled={saving === user._id + "integrations"}
                                  className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
                                    editHideIntegrations 
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                                      : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                                  }`}
                                >
                                  {saving === user._id + "integrations" ? <Loader2 size={14} className="animate-spin" /> : 
                                    editHideIntegrations ? <Eye size={14} /> : <EyeOff size={14} />
                                  }
                                  {editHideIntegrations ? "Unhide Integrations" : "Hide Integrations"}
                                </button>
                              </div>
                            </div>

                            <div className="p-4 bg-white rounded-xl border border-slate-200">
                              <p className="text-sm font-bold text-gray-900 mb-2">Google Sheets Integration</p>
                              {user.googleSheetId ? (
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
                                  <span className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold">Connected</span>
                                  <div className="flex gap-2">
                                    <a href={`https://docs.google.com/spreadsheets/d/${user.googleSheetId}/edit`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-1">
                                      <ExternalLink size={12} /> View Sheet
                                    </a>
                                    <button onClick={() => saveUser(user._id, "disconnectGoogle")} disabled={saving === user._id + "disconnectGoogle"} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-all disabled:opacity-50 flex items-center gap-1">
                                      {saving === user._id + "disconnectGoogle" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Disconnect
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 mt-2">User has not connected a Google Account.</p>
                              )}
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
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
            <div className="flex items-center gap-3 mb-6"><div className="p-2 bg-indigo-100 rounded-xl"><UserPlus className="w-5 h-5 text-indigo-600" /></div><h2 className="text-xl font-bold">Create New User</h2></div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Username</label><input type="text" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Password</label><input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" /></div>
              <button type="submit" disabled={creatingUser} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">{creatingUser ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />} Create User</button>
            </form>
          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
