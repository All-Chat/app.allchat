/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Tag as TagIcon, Plus, Loader2, X, Check, Trash2,
  Sparkles, AlertCircle, ChevronDown, Users, Phone, Pencil, ArrowLeft,
  Gauge, AlertTriangle, Infinity as InfinityIcon, Download, Search, UserPlus, XCircle
} from "lucide-react";
import * as XLSX from "xlsx";

interface LimitInfo {
  limit: { max: number; period: string };
  usage: { count: number; resetAt: string | null };
  remaining: number;
  allowed: boolean;
}

const ITEMS_PER_PAGE_MODAL = 10;

export default function TagsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tags, setTags] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null); // For Tag Deletion
  const [tagLimit, setTagLimit] = useState<LimitInfo | null>(null);

  // Modal State
  const [activeTag, setActiveTag] = useState<any | null>(null);
  const [modalContacts, setModalContacts] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalPage, setModalPage] = useState(1);
  const [modalSearch, setModalSearch] = useState("");
  
  // Manual Add State
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [addingToTag, setAddingToTag] = useState(false);

  // ✅ NEW: State for removing contact confirmation
  const [removingContactPhone, setRemovingContactPhone] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [tagsRes, limitsRes] = await Promise.all([
        fetch("/api/tags"),
        fetch("/api/user/limits?resource=tags"),
      ]);

      if (tagsRes.status === 401) { router.push("/signin"); return; }

      const tagsData = await tagsRes.json();
      setTags(tagsData.tags || []);

      if (limitsRes.ok) {
        const limitsData = await limitsRes.json();
        if (limitsData.success) {
          setTagLimit({
            limit: { max: limitsData.limit, period: limitsData.period },
            usage: { count: limitsData.currentUsage || 0, resetAt: null },
            remaining: limitsData.remaining,
            allowed: limitsData.allowed,
          });
        }
      }
    } catch { showToast("Failed to load data", "error"); } 
    finally { setLoading(false); }
  }, [router, showToast]);

  useEffect(() => {
    if (status === "authenticated") loadData();
    else if (status === "unauthenticated") router.push("/signin");
  }, [status, router, loadData]);

  const resetForm = useCallback(() => { setEditingId(null); setTagName(""); }, []);

  const handleEditClick = useCallback((tag: any) => {
    setEditingId(tag._id); setTagName(tag.name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    setSubmitting(true);
    try {
      const payload = { name: tagName };
      const res = editingId
        ? await fetch(`/api/tags/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();

      if (res.status === 429 && data.limitExceeded) {
        showToast(data.error, "error");
        if (data.limitInfo) { setTagLimit((prev) => prev ? { ...prev, allowed: false, usage: { count: data.limitInfo.currentUsage, resetAt: null }, remaining: 0 } : prev); }
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to save tag");
      showToast(editingId ? "Tag updated!" : "Tag created!");
      resetForm(); loadData();
    } catch (err: any) { showToast(err.message, "error"); } 
    finally { setSubmitting(false); }
  }, [tagName, editingId, resetForm, loadData, showToast]);

  const handleDeleteTag = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      showToast("Tag deleted"); setDeletingId(null); loadData();
    } catch (err: any) { showToast(err.message, "error"); }
  }, [loadData, showToast]);

  // --- MODAL FUNCTIONS ---
  const handleOpenModal = useCallback(async (tag: any) => {
    setActiveTag(tag);
    setModalLoading(true);
    setModalPage(1);
    setModalSearch("");
    setRemovingContactPhone(null); // Reset confirmation state
    try {
      const res = await fetch(`/api/contacts?tag=${encodeURIComponent(tag.name)}`);
      const data = await res.json();
      setModalContacts(data.contacts || []);
    } catch { setModalContacts([]); } 
    finally { setModalLoading(false); }
  }, []);

  const handleCloseModal = () => setActiveTag(null);

  const handleAddToTag = async () => {
    if (!newPhone.trim() || !activeTag) return;
    setAddingToTag(true);
    try {
      const res = await fetch("/api/tags/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", tagName: activeTag.name, phone: newPhone.trim(), name: newName.trim() || "Unknown" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      showToast("Number added to tag");
      setNewPhone(""); setNewName("");
      const contactRes = await fetch(`/api/contacts?tag=${encodeURIComponent(activeTag.name)}`);
      const contactData = await contactRes.json();
      setModalContacts(contactData.contacts || []);
    } catch (err: any) { showToast(err.message, "error"); } 
    finally { setAddingToTag(false); }
  };

  const handleRemoveFromTag = async (phone: string) => {
    if (!activeTag) return;
    try {
      const res = await fetch("/api/tags/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", tagName: activeTag.name, phone })
      });
      if (!res.ok) throw new Error("Failed to remove");
      
      setModalContacts(prev => prev.filter(c => c.phone !== phone));
      showToast("Number removed from tag");
    } catch (err: any) { showToast(err.message, "error"); }
  };

  const handleDownloadTagReport = () => {
    if (modalContacts.length === 0) { showToast("No contacts to download", "error"); return; }
    const exportData = modalContacts.map(c => ({ Name: c.name || "Unknown", "Phone Number": c.phone }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTag.name.substring(0, 25));
    XLSX.writeFile(wb, `Tag_${activeTag.name}.xlsx`);
  };

  // --- MEMOIZED VALUES ---
  const isLimitActive = useMemo(() => !!tagLimit && tagLimit.limit.period !== "unlimited" && tagLimit.limit.max !== -1, [tagLimit]);
  const usagePercent = useMemo(() => isLimitActive && tagLimit ? Math.min(100, Math.round(((tagLimit.usage.count || 0) / tagLimit.limit.max) * 100)) : 0, [isLimitActive, tagLimit]);
  const isAtLimit = useMemo(() => isLimitActive && tagLimit ? !tagLimit.allowed : false, [isLimitActive, tagLimit]);

  // Modal Pagination
  const filteredModalContacts = useMemo(() => {
    if (!modalSearch) return modalContacts;
    return modalContacts.filter(c => 
      c.phone?.includes(modalSearch) || c.name?.toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [modalContacts, modalSearch]);

  const modalTotalPages = Math.ceil(filteredModalContacts.length / ITEMS_PER_PAGE_MODAL);
  const currentModalContacts = filteredModalContacts.slice((modalPage - 1) * ITEMS_PER_PAGE_MODAL, modalPage * ITEMS_PER_PAGE_MODAL);

  if (status === "loading" || loading) {
    return (<div className="flex min-h-screen bg-slate-50 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <style jsx global>{`
        @keyframes slide-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        .slim-scroll::-webkit-scrollbar { width: 6px; }
        .slim-scroll::-webkit-scrollbar-track { background: transparent; }
        .slim-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${toast.type === "success" ? "bg-emerald-100" : "bg-red-100"}`}>{toast.type === "success" ? <Check size={14} /> : <X size={14} />}</span>
          {toast.message}
        </div>
      )}

      <Sidebar />

      <main className="md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:p-10 space-y-6 sm:space-y-8">
          
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#E8F8EF] to-[#D1F4DE] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-lg shadow-emerald-100/60">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-[#A5D6A7]/40 rounded-full blur-3xl"></div>
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="flex-shrink-0 p-3 sm:p-3.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl sm:rounded-2xl shadow-md shadow-emerald-200/60">
                  <TagIcon size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-900">WhatsApp Tags</h1>
                  <p className="text-emerald-700/80 text-xs sm:text-sm mt-1 font-medium">Manage your global tags</p>
                </div>
              </div>
              {tagLimit && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold shrink-0 ${isAtLimit ? "bg-red-50 border-red-200 text-red-700" : usagePercent >= 80 ? "bg-amber-50 border-amber-200 text-amber-700" : isLimitActive ? "bg-white border-slate-200 text-slate-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"}`}>
                  {isLimitActive ? (<><Gauge size={14} /><span>{tagLimit.usage.count}/{tagLimit.limit.max}</span>{tagLimit.limit.period !== "total" && <span className="opacity-60">/{tagLimit.limit.period}</span>}</>) : (<><InfinityIcon size={14} /><span>Unlimited</span></>)}
                </div>
              )}
            </div>
          </div>

          {isLimitActive && (
            <div className={`rounded-xl p-3 flex items-center gap-3 text-sm border animate-slide-in ${isAtLimit ? "bg-red-50 border-red-200 text-red-700" : usagePercent >= 80 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
              {isAtLimit ? <AlertTriangle size={16} className="shrink-0" /> : <Gauge size={16} className="shrink-0" />}
              <div className="flex-1">
                <span className="font-bold">{isAtLimit ? "Tag limit reached!" : usagePercent >= 80 ? "Approaching tag limit" : "Tag usage"}</span>
                <span className="ml-2 opacity-80">{tagLimit!.usage.count} of {tagLimit!.limit.max} tags used{tagLimit!.limit.period !== "total" && ` per ${tagLimit!.limit.period}`}</span>
              </div>
              <div className="w-24 h-2 bg-white/60 rounded-full overflow-hidden shrink-0"><div className={`h-full rounded-full transition-all ${isAtLimit ? "bg-red-500" : usagePercent >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${usagePercent}%` }} /></div>
              <span className="text-xs font-bold shrink-0">{usagePercent}%</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
            {/* Left Column: Create/Edit Form */}
            <div className="lg:col-span-2">
              <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow sticky top-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2"><Sparkles size={14} className="text-emerald-500" />{editingId ? "Edit Tag" : "Create New Tag"}</h2>
                  {editingId && <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-red-500 flex items-center gap-1"><ArrowLeft size={12} /> Cancel</button>}
                </div>
                {isAtLimit && !editingId && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                    <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <div><p className="text-xs font-bold text-red-700">Tag limit reached</p><p className="text-[11px] text-red-600 mt-0.5">Delete existing tags or contact admin.</p></div>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Tag Name</label>
                    <input type="text" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="e.g. Interested, VIP, Follow Up" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all" disabled={submitting || (isAtLimit && !editingId)} />
                  </div>
                  <button type="submit" disabled={submitting || !tagName.trim() || (isAtLimit && !editingId)} className={`w-full text-white px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${isAtLimit && !editingId ? "bg-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"}`}>
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : isAtLimit && !editingId ? <><AlertTriangle size={16} /> Limit Reached</> : editingId ? <Check size={16} /> : <Plus size={16} />}
                    {submitting ? "Saving..." : isAtLimit && !editingId ? "Limit Reached" : editingId ? "Update Tag" : "Save Tag"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Tags List */}
            <div className="lg:col-span-3">
              <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col max-h-[75vh]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2"><TagIcon size={14} className="text-slate-500" />Active Tags</h2>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{tags.length} Total{isLimitActive && <span className="text-slate-400 ml-1">/ {tagLimit?.limit.max}</span>}</span>
                </div>

                {tags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100"><TagIcon size={28} /></div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">No tags yet</h3>
                    <p className="text-sm text-slate-400 max-w-xs">Create your first tag using the form on the left.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto slim-scroll pr-2 space-y-3">
                    {tags.map((tag) => {
                      const isDeleting = deletingId === tag._id;
                      return (
                        <div key={tag._id} className={`rounded-xl border transition-all overflow-hidden ${isDeleting ? "border-red-300 bg-red-50/30" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}>
                          <div className="flex items-center justify-between w-full gap-2 pl-4 pr-3 py-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-900 text-sm truncate">{tag.name}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5 text-emerald-600">Tag</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!isDeleting ? (
                                <>
                                  <button onClick={() => handleOpenModal(tag)} className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1.5">
                                    <Users size={12} /> View
                                  </button>
                                  <button onClick={() => handleEditClick(tag)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Edit Tag"><Pencil size={14} /></button>
                                  <button onClick={() => setDeletingId(tag._id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete Tag"><Trash2 size={14} /></button>
                                </>
                              ) : (
                                <div className="flex items-center gap-1 bg-red-50 p-1 rounded-md border border-red-100 animate-slide-in">
                                  <span className="text-[10px] font-bold text-red-600 px-1">Delete?</span>
                                  <button onClick={() => handleDeleteTag(tag._id)} className="p-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-[10px] font-bold px-2">Yes</button>
                                  <button onClick={() => setDeletingId(null)} className="p-1 text-slate-500 rounded-md hover:bg-slate-200 text-[10px] font-bold px-2">No</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* --- VIEW CONTACTS MODAL --- */}
      {activeTag && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 text-white relative shrink-0 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><TagIcon size={20} /> {activeTag.name}</h2>
                <p className="text-sm text-white/80 mt-1">{modalContacts.length} Contacts in this tag</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleDownloadTagReport} className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors">
                  <Download size={14} /> Export
                </button>
                <button onClick={handleCloseModal} className="p-2 hover:bg-white/20 rounded-lg transition-colors"><X size={20} /></button>
              </div>
            </div>

            {/* Add Number Form */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1"><UserPlus size={12} /> Add Number Manually</h3>
              <div className="flex gap-2">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (Optional)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                <input type="text" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))} placeholder="Phone Number" className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                <button onClick={handleAddToTag} disabled={addingToTag || !newPhone.trim()} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1">
                  {addingToTag ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-slate-200 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder="Search by name or phone..." className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>
            </div>

            {/* Contacts List Table */}
            <div className="flex-1 overflow-y-auto slim-scroll">
              {modalLoading ? (
                <div className="flex justify-center items-center h-40"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
              ) : currentModalContacts.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                      <th className="px-5 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentModalContacts.map((contact) => (
                      <tr key={contact.phone} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-medium text-slate-900">{contact.name || "Unknown"}</td>
                        <td className="px-5 py-4 font-mono text-slate-700">{contact.phone}</td>
                        <td className="px-5 py-4 text-right">
                          {removingContactPhone === contact.phone ? (
                            <div className="flex items-center gap-1 justify-end bg-red-50 p-1 rounded-md border border-red-100 animate-slide-in">
                              <span className="text-[10px] font-bold text-red-600">Remove?</span>
                              <button onClick={() => { handleRemoveFromTag(contact.phone); setRemovingContactPhone(null); }} className="p-1 bg-red-500 text-white rounded-md text-[10px] font-bold px-2">Yes</button>
                              <button onClick={() => setRemovingContactPhone(null)} className="p-1 text-slate-500 rounded-md text-[10px] font-bold px-2">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setRemovingContactPhone(contact.phone)} className="text-red-500 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-md transition-colors inline-flex items-center gap-1 text-xs font-bold">
                              <XCircle size={14} /> Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="w-12 h-12 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-500">No contacts found</p>
                  <p className="text-xs text-slate-400 mt-1">Add a number manually above to get started.</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {modalTotalPages > 1 && (
              <div className="flex justify-between items-center px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
                <button onClick={() => setModalPage(p => Math.max(p - 1, 1))} disabled={modalPage === 1} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors">Prev</button>
                <span className="text-xs font-bold text-slate-700">Page {modalPage} of {modalTotalPages}</span>
                <button onClick={() => setModalPage(p => Math.min(p + 1, modalTotalPages))} disabled={modalPage === modalTotalPages} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors">Next</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
