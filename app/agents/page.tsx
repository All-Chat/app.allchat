/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import styled from "styled-components";
import Sidebar from "@/components/Sidebar";
import {
  Bot, Trash2, Pencil, Save, X, Globe, Mail, Clock, 
  Loader2, Sparkles, FileText, Power,
  Gauge, AlertTriangle, Infinity as InfinityIcon
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/* =========================================================
   LOADER COMPONENT
========================================================= */

const ScannerLoader = () => {
  return (
    <ScannerWrapper>
      <div className="loader">
        <div className="scanner">
          <span>Loading...</span>
        </div>
      </div>
    </ScannerWrapper>
  );
};

const ScannerWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 40px 0;

  .scanner span {
    color: transparent;
    font-size: 1.4rem;
    position: relative;
    overflow: hidden;
  }

  .scanner span::before {
    content: "Loading...";
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 100%;
    border-right: 4px solid #000000;
    overflow: hidden;
    color: #000000;
    animation: load91371 2s linear infinite;
  }

  @keyframes load91371 {
    0%, 10%, 100% { width: 0; }
    10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 100% { border-right-color: transparent; }
    11%, 21%, 31%, 41%, 51%, 61%, 71%, 81%, 91% { border-right-color: #000000; }
    60%, 80% { width: 100%; }
  }
`;

/* =========================================================
   MAIN COMPONENT
========================================================= */

interface LimitInfo {
  limit: { max: number; period: string };
  usage: { count: number; resetAt: string | null };
  remaining: number;
  allowed: boolean;
}

export default function AgentsPage() {
  const router = useRouter();
  const { status } = useSession();

  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [agentLimit, setAgentLimit] = useState<LimitInfo | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    details: "",
    language: "english",
    fallbackMessage: "",
    supportEmail: "",
  });

  const defaultFallbacks = {
    english: "Hmm, I'm not entirely sure I caught that. 🤔 I couldn't find anything about that in my documentation. I really want to make sure you get the right help, so could you drop an email to [email]? Our team will take great care of you! 💌",
    hindi: "माफ़ कीजिए, मुझे इस बारे में जानकारी नहीं है। 🤔 कृपया [email] पर ईमेल करें, हमारी टीम आपकी मदद करेगी! 💌"
  };

  const langData = formData.language === "hindi" ? {
    detailsPh: "कृपया अपनी कंपनी का विवरण हिंदी में यहाँ लिखें... (जैसे: हमारी कंपनी क्या करती है, हमारी सेवाएं, संपर्क जानकारी आदि)",
    fallbackPh: "वह संदेश दर्ज करें जो तब भेजा जाएगा जब बॉट को सवाल का जवाब नहीं पता होगा...",
    detailsHint: "बॉट इस जानकारी का उपयोग ग्राहकों के सवालों के जवाब देने के लिए करेगा।",
    fallbackHint: "[email] की जगह ऊपर दिया गया सपोर्ट ईमेल अपने आप चला जाएगा।"
  } : {
    detailsPh: "Please enter your company details here in English... (e.g., What our company does, our services, contact info, etc.)",
    fallbackPh: "Enter the message to send when the bot doesn't know the answer...",
    detailsHint: "The bot will use this information to answer customer questions.",
    fallbackHint: "The [email] placeholder will be automatically replaced with the support email provided above."
  };

  /* -------------------- FETCH FUNCTIONS -------------------- */

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const [agentsRes, limitsRes] = await Promise.all([
        fetch("/api/agents", { cache: "no-store" }),
        fetch("/api/user/limits?resource=aiAgents")
      ]);

      if (agentsRes.status === 401) {
        router.push("/");
        return;
      }

      const agentsData = await agentsRes.json();
      if (agentsData.success && Array.isArray(agentsData.agents)) {
        setAgents(agentsData.agents);
      } else {
        setAgents([]);
      }

      if (limitsRes.ok) {
        const limitsData = await limitsRes.json();
        if (limitsData.success) {
          setAgentLimit({
            limit: { max: limitsData.limit, period: limitsData.period },
            usage: { count: limitsData.currentUsage || 0, resetAt: null },
            remaining: limitsData.remaining,
            allowed: limitsData.allowed,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load agents", err);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- EFFECTS -------------------- */

  useEffect(() => {
    if (status === "authenticated") {
      fetchAgents();
    }
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  /* -------------------- HANDLERS -------------------- */

  const handleLanguageChange = (lang: string) => {
    const shouldUpdateFallback = !formData.fallbackMessage || Object.values(defaultFallbacks).some(d => formData.fallbackMessage.includes(d.split(' ')[0]));
    setFormData(prev => ({
      ...prev,
      language: lang,
      fallbackMessage: shouldUpdateFallback ? defaultFallbacks[lang as keyof typeof defaultFallbacks] : prev.fallbackMessage,
    }));
  };

  const isLimitActive = useMemo(() => !!agentLimit && agentLimit.limit.period !== "unlimited" && agentLimit.limit.max !== -1, [agentLimit]);
  const usagePercent = useMemo(() => isLimitActive && agentLimit ? Math.min(100, Math.round(((agentLimit.usage.count || 0) / agentLimit.limit.max) * 100)) : 0, [isLimitActive, agentLimit]);
  const isAtLimit = useMemo(() => isLimitActive && agentLimit ? !agentLimit.allowed : false, [isLimitActive, agentLimit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let finalFallback = formData.fallbackMessage;
    if (finalFallback.includes("[email]")) {
      finalFallback = finalFallback.replace("[email]", formData.supportEmail);
    }

    const payload = { ...formData, fallbackMessage: finalFallback };

    try {
      const url = editingId ? `/api/agents/${editingId}` : "/api/agents";
      const method = editingId ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (res.status === 429 && data.limitExceeded) {
        toast.error(data.error);
        if (data.limitInfo) { 
          setAgentLimit((prev) => prev ? { ...prev, allowed: false, usage: { count: data.limitInfo.currentUsage, resetAt: null }, remaining: 0 } : prev); 
        }
        return;
      }
      
      if (data.success) {
        toast.success(editingId ? "Agent updated successfully!" : "Agent created successfully!");
        handleReset();
        fetchAgents();
      } else {
        toast.error(data.error || "Failed to save agent");
      }
    } catch (err) {
      console.error("Failed to save agent", err);
      toast.error("Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (agent: any) => {
    setEditingId(agent._id);
    setFormData({
      name: agent.name,
      details: agent.details,
      language: agent.language,
      fallbackMessage: agent.fallbackMessage,
      supportEmail: agent.supportEmail,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this AI Agent?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Agent deleted");
        setAgents((prev) => prev.filter((a) => a._id !== id));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const action = currentStatus ? "Deactivate" : "Activate";
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} this agent?`)) return;
    
    setActivatingId(id);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentStatus }) 
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Agent ${action}d!`);
        fetchAgents();
      } else {
        toast.error(`Failed to ${action.toLowerCase()}`);
      }
    } catch (err) {
      toast.error(`Failed to ${action.toLowerCase()}`);
    } finally {
      setActivatingId(null);
    }
  };

  const handleReset = () => {
    setEditingId(null);
    setFormData({
      name: "",
      details: "",
      language: "english",
      fallbackMessage: defaultFallbacks.english,
      supportEmail: "",
    });
  };

  /* -------------------- UI RENDER -------------------- */

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 text-gray-900">
      <Sidebar />

      <div className="md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#E8F8EF] to-[#D1F4DE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-lg shadow-emerald-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#A5D6A7]/40 rounded-full blur-3xl"></div>
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex-shrink-0 p-3 sm:p-3.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl sm:rounded-2xl shadow-md shadow-emerald-200/60">
                  <Sparkles size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-900">AI Agents</h1>
                  <p className="text-emerald-700/80 text-xs sm:text-sm mt-1 font-medium">Create and manage your custom AI Assistants</p>
                </div>
              </div>
              {agentLimit && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold shrink-0 ${isAtLimit ? "bg-red-50 border-red-200 text-red-700" : usagePercent >= 80 ? "bg-amber-50 border-amber-200 text-amber-700" : isLimitActive ? "bg-white border-slate-200 text-slate-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"}`}>
                  {isLimitActive ? (<><Gauge size={14} /><span>{agentLimit.usage.count}/{agentLimit.limit.max}</span>{agentLimit.limit.period !== "total" && <span className="opacity-60">/{agentLimit.limit.period}</span>}</>) : (<><InfinityIcon size={14} /><span>Unlimited</span></>)}
                </div>
              )}
            </div>
          </div>

          {/* Limit Warning Bar */}
          {isLimitActive && (
            <div className={`rounded-xl p-3 flex items-center gap-3 text-sm border animate-slide-in ${isAtLimit ? "bg-red-50 border-red-200 text-red-700" : usagePercent >= 80 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
              {isAtLimit ? <AlertTriangle size={16} className="shrink-0" /> : <Gauge size={16} className="shrink-0" />}
              <div className="flex-1">
                <span className="font-bold">{isAtLimit ? "AI Agent limit reached!" : usagePercent >= 80 ? "Approaching AI Agent limit" : "AI Agent usage"}</span>
                <span className="ml-2 opacity-80">{agentLimit!.usage.count} of {agentLimit!.limit.max} agents used{agentLimit!.limit.period !== "total" && ` per ${agentLimit!.limit.period}`}</span>
              </div>
              <div className="w-24 h-2 bg-white/60 rounded-full overflow-hidden shrink-0">
                <div className={`h-full rounded-full transition-all ${isAtLimit ? "bg-red-500" : usagePercent >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${usagePercent}%` }} />
              </div>
              <span className="text-xs font-bold shrink-0">{usagePercent}%</span>
            </div>
          )}

          {/* Create/Edit Form */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <Bot size={18} className="text-emerald-600" />
                {editingId ? "Edit Agent" : "Create New Agent"}
              </h2>
              {editingId && (
                <button 
                  onClick={handleReset} 
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <X size={12} /> Cancel Edit
                </button>
              )}
            </div>

            {isAtLimit && !editingId && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <div><p className="text-xs font-bold text-red-700">Agent limit reached</p><p className="text-[11px] text-red-600 mt-0.5">Delete existing agents or contact admin.</p></div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Name & Language */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Agent Name / Title</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:bg-slate-100"
                    placeholder="e.g. Alex from AllChat"
                    disabled={isAtLimit && !editingId}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Language</label>
                  <select
                    value={formData.language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none cursor-pointer disabled:bg-slate-100"
                    disabled={isAtLimit && !editingId}
                  >
                    <option value="english">🌐 English</option>
                    <option value="hindi">🌐 Hindi</option>
                  </select>
                </div>
              </div>

              {/* Company Details */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Company Details & Information (Knowledge Base)
                </label>
                <textarea
                  required
                  value={formData.details}
                  onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                  rows={8}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:bg-slate-100"
                  style={{ resize: "vertical", minHeight: "150px" }}
                  placeholder={langData.detailsPh}
                  disabled={isAtLimit && !editingId}
                />
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <FileText size={10} /> {langData.detailsHint}
                </p>
              </div>

              {/* Fallback Message */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Fallback Message (Out of Workflow/Details)
                </label>
                <textarea
                  required
                  value={formData.fallbackMessage}
                  onChange={(e) => setFormData({ ...formData, fallbackMessage: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:bg-slate-100"
                  style={{ resize: "vertical" }}
                  placeholder={langData.fallbackPh}
                  disabled={isAtLimit && !editingId}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {langData.fallbackHint}
                </p>
              </div>

              {/* Support Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Support Email</label>
                  <input
                    type="email"
                    required
                    value={formData.supportEmail}
                    onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all disabled:bg-slate-100"
                    placeholder="support@yourcompany.com"
                    disabled={isAtLimit && !editingId}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving || (isAtLimit && !editingId)}
                  className={`px-6 py-2.5 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed ${isAtLimit && !editingId ? "bg-slate-400" : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 hover:scale-105 disabled:hover:scale-100"}`}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : isAtLimit && !editingId ? <AlertTriangle size={16} /> : <Save size={16} />}
                  {saving ? "Saving..." : isAtLimit && !editingId ? "Limit Reached" : editingId ? "Update Agent" : "Save Agent"}
                </button>
              </div>
            </form>
          </div>

          {/* Agents List */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
              <Bot size={18} className="text-slate-600" /> Your Agents
            </h2>

            {loading ? (
              <div className="flex justify-center items-center py-20">
                <ScannerLoader />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
                <Bot className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium text-slate-500">No AI Agents created yet</p>
                <p className="text-xs mt-1">Fill out the form above to create one.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {agents.map((agent) => (
                  <div 
                    key={agent._id} 
                    className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate max-w-[200px] sm:max-w-none">
                            {agent.name}
                          </h3>
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 border bg-emerald-50 text-emerald-700 border-emerald-200 capitalize">
                            <Globe size={10} /> {agent.language}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Mail size={11} className="text-slate-400" />
                            {agent.supportEmail}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock size={11} className="text-slate-400" />
                            <strong>Created:</strong> {new Date(agent.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:ml-4 w-full sm:w-auto justify-end">
                        {agent.active ? (
                          <button
                            onClick={() => handleToggleActive(agent._id, agent.active)}
                            disabled={activatingId === agent._id}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-sm disabled:opacity-50"
                            title="Click to deactivate"
                          >
                            {activatingId === agent._id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                            )}
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleActive(agent._id, agent.active)}
                            disabled={activatingId === agent._id}
                            className="px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-all disabled:opacity-50"
                          >
                            {activatingId === agent._id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                            Activate
                          </button>
                        )}

                        <button
                          onClick={() => handleEdit(agent)}
                          className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Edit Agent"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(agent._id)}
                          disabled={deletingId === agent._id}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Agent"
                        >
                          {deletingId === agent._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      <ToastContainer position="bottom-right" theme="light" autoClose={3000} />
    </div>
  );
}
