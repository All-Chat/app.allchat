/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Loader2, Users, UserPlus, Trash2, ShieldCheck, Building2,
  Eye, X, Wallet, Clock, Activity, Gauge, Infinity as InfinityIcon,
  Save, Ban, Play, KeyRound, Lock, User, Tag, GitBranch, FileText, Send, Megaphone, UserPlus as UserPlusIcon, ClipboardList, EyeOff
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const LIMIT_RESOURCES_CONFIG = [
  { key: "tags", label: "Tags", icon: Tag },
  { key: "workflows", label: "Workflows", icon: GitBranch },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "testMessages", label: "Test Messages", icon: Send },
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "optNumbers", label: "Opt-in Numbers", icon: UserPlusIcon },
  { key: "forms", label: "Forms", icon: ClipboardList },
];

const PERIOD_OPTIONS = [
  { value: "day", label: "Per Day" }, { value: "month", label: "Per Month" }, { value: "year", label: "Per Year" },
  { value: "total", label: "Total (Lifetime)" }, { value: "unlimited", label: "Unlimited ♾️" },
];

export default function TenantManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Forms
  const [newUser, setNewUser] = useState({ name: "", password: "" });
  const [newUserLimits, setNewUserLimits] = useState<Record<string, any>>({});
  
  const [viewingUser, setViewingUser] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [editingUser, setEditingUser] = useState<any>(null);
  const [editLimits, setEditLimits] = useState<Record<string, any>>({});
  const [editName, setEditName] = useState("");
  const [editPass, setEditPass] = useState("");
  const [showEditCurrentPass, setShowEditCurrentPass] = useState(false); 
  const [editTab, setEditTab] = useState<"limits" | "account" | "credentials">("limits");

  const [actionLoading, setActionLoading] = useState(false);

  // Tenant Limits State
  const [tenantLimits, setTenantLimits] = useState<any>({});
  const [tenantLimitsState, setTenantLimitsState] = useState({ max: 0, current: 0 });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/users");
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setTenantLimitsState({ max: data.maxSubUsers, current: data.currentSubUsersCount });
        setTenantLimits(data.tenantLimits || {});
        
        // Initialize default limits for NEW users based on Tenant's plan
        const initL: Record<string, any> = {};
        LIMIT_RESOURCES_CONFIG.forEach(r => {
          const tLimit = data.tenantLimits?.[r.key] || { max: -1, period: "unlimited" };
          const tIsLimited = tLimit.period !== "unlimited" && tLimit.max !== -1;
          if (tIsLimited) {
            initL[r.key] = { max: tLimit.max, period: tLimit.period };
          } else {
            initL[r.key] = { max: -1, period: "unlimited" };
          }
        });
        setNewUserLimits(initL);
      }
    } catch { toast.error("Error fetching users"); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await fetch("/api/tenant/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newUser, limits: newUserLimits }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Sub-user created!");
        setShowCreateModal(false);
        setNewUser({ name: "", password: "" });
        fetchUsers();
      } else { toast.error(data.error); }
    } catch { toast.error("Creation failed"); } 
    finally { setActionLoading(false); }
  };

  const handleDelete = async (userId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/tenant/users?userId=${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("Sub-user deleted"); fetchUsers(); setShowEditModal(false); }
      else toast.error(data.error);
    } catch { toast.error("Delete failed"); }
  };

  const handleStatusChange = async (user: any, suspend: boolean) => {
    try {
      const res = await fetch("/api/tenant/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user._id, action: "status", suspend, reactivate: !suspend }),
      });
      const data = await res.json();
      if (data.success) { toast.success(`User ${suspend ? "suspended" : "reactivated"}`); fetchUsers(); setShowEditModal(false); }
    } catch { toast.error("Update failed"); }
  };

  const openEditModal = (user: any) => {
    // Format limits to ensure they don't exceed tenant limits upon opening
    const userLimits: Record<string, any> = {};
    LIMIT_RESOURCES_CONFIG.forEach(r => {
      const tLimit = tenantLimits[r.key] || { max: -1, period: "unlimited" };
      const tIsLimited = tLimit.period !== "unlimited" && tLimit.max !== -1;
      const currentLimit = user.limits?.[r.key] || { max: -1, period: "unlimited" };

      if (tIsLimited) {
        // Cap the max at the tenant's max, and force the period
        const cappedMax = currentLimit.max === -1 ? tLimit.max : Math.min(currentLimit.max, tLimit.max);
        userLimits[r.key] = { max: cappedMax, period: tLimit.period };
      } else {
        userLimits[r.key] = currentLimit;
      }
    });

    setEditingUser(user);
    setEditLimits(userLimits);
    setEditName(user.name);
    setEditPass("");
    setEditTab("limits");
    setShowEditCurrentPass(false);
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    setActionLoading(true);
    try {
      const body: any = { userId: editingUser._id, action: editTab };
      if (editTab === "limits") body.limits = editLimits;
      if (editTab === "credentials") { body.name = editName; body.password = editPass; }

      const res = await fetch("/api/tenant/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { toast.success("Sub-user updated"); fetchUsers(); setShowEditModal(false); }
      else toast.error(data.error);
    } catch { toast.error("Update failed"); } 
    finally { setActionLoading(false); }
  };

  const updateLimitField = (resource: string, field: "max" | "period", value: any, isEdit: boolean = false) => {
    const setter = isEdit ? setEditLimits : setNewUserLimits;
    setter(prev => {
      const current = { ...prev[resource] };
      if (field === "period") {
        current.period = value;
        if (value === "unlimited") current.max = -1; else if (current.max === -1) current.max = 0;
      } else { current.max = value; }
      return { ...prev, [resource]: current };
    });
  };

  const formatDate = (date: string | null) => !date ? "N/A" : new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const capacityPct = tenantLimitsState.max > 0 ? Math.min(100, Math.round((tenantLimitsState.current / tenantLimitsState.max) * 100)) : 0;

  // Reusable component for rendering limit inputs (USED FOR BOTH CREATE AND EDIT)
  const renderLimitInputs = (res: any, isEdit: boolean = false) => {
    const limitsState = isEdit ? editLimits : newUserLimits;
    const limit = limitsState[res.key] || { max: -1, period: "unlimited" };
    const isUnlimited = limit.period === "unlimited";
    const tLimit = tenantLimits[res.key] || { max: -1, period: "unlimited" };
    const tIsLimited = tLimit.period !== "unlimited" && tLimit.max !== -1;

    return (
      <div key={res.key} className={`p-3 bg-slate-50 border border-slate-200 rounded-xl ${isUnlimited ? "opacity-70" : ""}`}>
        <div className="flex items-center gap-2 mb-2">
          <res.icon size={14} className="text-slate-500" />
          <p className="text-sm font-bold text-gray-800">{res.label}</p>
          <span className="text-[9px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded ml-auto">
            Your Plan: {tIsLimited ? `${tLimit.max} / ${tLimit.period}` : "Unlimited"}
          </span>
        </div>
        <div className="flex gap-2">
          <input 
            type="number" 
            min="0" 
            max={tIsLimited ? tLimit.max : undefined} 
            value={isUnlimited ? "" : limit.max} 
            onChange={e => updateLimitField(res.key, "max", parseInt(e.target.value) || 0, isEdit)} 
            disabled={isUnlimited} 
            placeholder={isUnlimited ? "∞" : "0"} 
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold disabled:bg-slate-100 disabled:text-slate-400" 
          />
          <select 
            value={limit.period} 
            onChange={e => updateLimitField(res.key, "period", e.target.value, isEdit)} 
            disabled={tIsLimited} // Lock period if tenant is limited, so they can't bypass with a shorter period
            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold appearance-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-400"
          >
            {/* If tenant is limited, only show their period. Otherwise show all options */}
            {tIsLimited 
              ? PERIOD_OPTIONS.filter(opt => opt.value === tLimit.period).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)
              : PERIOD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)
            }
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />
      <div className="md:ml-64 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-2xl shadow-lg shadow-indigo-200">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Tenant Management</h1>
              <p className="text-gray-500 text-sm">Create, manage, and monitor sub-users.</p>
            </div>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md hover:from-indigo-600 hover:to-blue-600 transition-all">
            <UserPlus size={18} /> Create Sub-User
          </button>
        </div>

        {/* Sub-User Capacity Progress Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full">
            <div className="p-2.5 bg-indigo-100 rounded-xl">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Sub-User Capacity</p>
              <p className="text-xs text-gray-500">
                {tenantLimitsState.current} created out of {tenantLimitsState.max === 0 ? "Unlimited" : tenantLimitsState.max} allowed
              </p>
            </div>
          </div>
          {tenantLimitsState.max > 0 && (
            <div className="w-full sm:w-1/2">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] font-bold text-indigo-600">{capacityPct}% Used</span>
                <span className="text-[10px] font-bold text-gray-400">{tenantLimitsState.max - tenantLimitsState.current} remaining</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className="bg-gradient-to-r from-indigo-500 to-blue-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${capacityPct}%` }}></div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-500">No sub-users created yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((user) => (
              <div key={user._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-slate-400 to-slate-500">
                    {user.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 ${user.accountStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <ShieldCheck size={9} /> {user.accountStatus?.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900">{user.name}</h3>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock size={12} className="text-slate-400" /> {formatDate(user.createdAt)}</span>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center mt-auto">
                  <button onClick={() => { setViewingUser(user); setShowViewModal(true); setShowPassword(false); }} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                    <Eye size={14} /> View Data
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditModal(user)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Manage User">
                      <KeyRound size={14} />
                    </button>
                    <button onClick={() => handleDelete(user._id, user.name)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete User">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
            <h2 className="text-xl font-bold mb-1">Create New Sub-User</h2>
            <p className="text-sm text-slate-500 mb-6">Limits cannot exceed your own tenant limits.</p>
            
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Username</label>
                  <input type="text" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Password</label>
                  <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all" />
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1.5"><Gauge size={12} /> Set Resource Limits</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LIMIT_RESOURCES_CONFIG.map(res => renderLimitInputs(res, false))}
                </div>
              </div>

              <button type="submit" disabled={actionLoading} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">
                {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />} Create User
              </button>
            </form>
          </div>
        </div>
      )}

      {/* View User Data Modal */}
      {showViewModal && viewingUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowViewModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 p-6 flex items-start justify-between z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br from-indigo-500 to-blue-500">{viewingUser.name?.charAt(0).toUpperCase()}</div>
                <div>
                  <h2 className="text-2xl font-bold">{viewingUser.name}</h2>
                  <p className="text-sm text-slate-500">Joined {formatDate(viewingUser.createdAt)}</p>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Login Credentials */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><KeyRound size={12} /> Login Credentials</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Username</p>
                    <p className="text-sm font-bold text-gray-800 font-mono">{viewingUser.name}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Password</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-800 font-mono">{showPassword ? viewingUser.password : "••••••••"}</p>
                      <button onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-indigo-600">
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Activity size={12} /> Account Overview</h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Wallet Balance (Shared)</p>
                  <p className="text-lg font-extrabold text-indigo-600">Uses Parent Tenant Wallet</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Gauge size={12} /> Resource Usage & Data Created</h3>
                <div className="space-y-2">
                  {viewingUser.limits && Object.entries(viewingUser.limits).map(([key, limitData]: [string, any]) => {
                    const usageData = viewingUser.usage?.[key];
                    const isUnlimited = limitData.period === "unlimited" || limitData.max === -1;
                    const usedCount = usageData?.count || 0;
                    const maxCount = limitData.max;
                    const pct = isUnlimited ? 0 : Math.min(100, Math.round((usedCount / maxCount) * 100));

                    return (
                      <div key={key} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div className="flex-1 capitalize text-sm font-medium text-gray-700">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div className="flex-1 px-4">
                          {isUnlimited ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><InfinityIcon size={12} /> Unlimited</span>
                          ) : (
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-right text-xs font-bold text-slate-600">
                          {isUnlimited ? `${usedCount} used` : `${usedCount} / ${maxCount}`}
                          {!isUnlimited && limitData.period !== "total" && <span className="text-slate-400 font-normal"> / {limitData.period}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 pt-4 z-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Manage {editingUser.name}</h2>
                <button onClick={() => setShowEditModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><X size={20} /></button>
              </div>
              <div className="flex border-b border-slate-200">
                {[{id:"limits", label:"Limits", icon: Gauge}, {id:"credentials", label:"Credentials", icon: KeyRound}, {id:"account", label:"Account", icon: User}].map(t => (
                  <button key={t.id} onClick={() => setEditTab(t.id as any)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all ${editTab === t.id ? "border-indigo-500 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                    <t.icon size={14} /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {editTab === "limits" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LIMIT_RESOURCES_CONFIG.map(res => renderLimitInputs(res, true))}
                </div>
              )}

              {editTab === "credentials" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Username</label>
                    <input 
                      type="text" 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all font-mono" 
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Current Password</label>
                    <div className="relative">
                      <input
                        type={showEditCurrentPass ? "text" : "password"}
                        value={editingUser.password || ""}
                        readOnly
                        className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-gray-700 font-mono focus:outline-none pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditCurrentPass(!showEditCurrentPass)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-indigo-600"
                      >
                        {showEditCurrentPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Set New Password</label>
                    <input 
                      type="password" 
                      value={editPass} 
                      onChange={e => setEditPass(e.target.value)} 
                      placeholder="Leave blank to keep current" 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all" 
                    />
                  </div>
                </div>
              )}

              {editTab === "account" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Current Status: <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${editingUser.accountStatus === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{editingUser.accountStatus?.toUpperCase()}</span></p>
                  {editingUser.accountStatus === "active" ? (
                    <button onClick={() => handleStatusChange(editingUser, true)} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all">
                      <Ban size={16} /> Suspend Account
                    </button>
                  ) : (
                    <button onClick={() => handleStatusChange(editingUser, false)} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all">
                      <Play size={16} /> Reactivate Account
                    </button>
                  )}
                </div>
              )}

              {editTab !== "account" && (
                <button onClick={saveEdit} disabled={actionLoading} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50">
                  {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
