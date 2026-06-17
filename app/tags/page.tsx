/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
  Tag as TagIcon, Plus, Loader2, X, Check, Trash2, Link2, 
  Sparkles, AlertCircle, ChevronDown, Users, Phone, Pencil, ArrowLeft 
} from "lucide-react";

export default function TagsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [tags, setTags] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");
  const [isSpecific, setIsSpecific] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Expand/Collapse State
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  const [contactsMap, setContactsMap] = useState<{ [key: string]: any[] }>({});
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [tagsRes, campsRes] = await Promise.all([
        fetch("/api/tags"),
        fetch("/api/campaigns/list")
      ]);

      if (tagsRes.status === 401 || campsRes.status === 401) {
        router.push("/signin");
        return;
      }

      const tagsData = await tagsRes.json();
      const campsData = await campsRes.json();

      setTags(tagsData.tags || []);
      setCampaigns(campsData.campaigns || []);

    } catch (err) {
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      loadData();
    } else if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  const resetForm = () => {
    setEditingId(null);
    setTagName("");
    setIsSpecific(false);
    setSelectedCampaign("");
  };

  const handleEditClick = (tag: any) => {
    setEditingId(tag._id);
    setTagName(tag.name);
    setIsSpecific(tag.isCampaignSpecific);
    setSelectedCampaign(tag.campaignId || "");
    // Scroll to top on mobile
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    if (isSpecific && !selectedCampaign) {
      showToast("Please select a campaign", "error");
      return;
    }

    setSubmitting(true);
    try {
      const camp = campaigns.find(c => c._id === selectedCampaign);
      const payload = { 
        name: tagName, 
        isCampaignSpecific: isSpecific,
        campaignId: isSpecific ? selectedCampaign : null,
        campaignName: isSpecific ? camp?.name : null
      };

      let res;
      if (editingId) {
        // Update existing tag
        res = await fetch(`/api/tags/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new tag
        res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save tag");

      showToast(editingId ? "Tag updated successfully!" : "Tag created successfully!");
      resetForm();
      loadData(); 
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTag = async (id: string) => {
    try {
      const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete tag");

      showToast("Tag deleted successfully!");
      setDeletingId(null);
      loadData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleTagClick = async (tag: any) => {
    if (expandedTagId === tag._id) {
      setExpandedTagId(null);
      return;
    }
    
    setExpandedTagId(tag._id);
    
    if (!contactsMap[tag._id]) {
      setLoadingContacts(true);
      try {
        const res = await fetch(`/api/contacts?tag=${encodeURIComponent(tag.name)}`);
        const data = await res.json();
        setContactsMap(prev => ({ ...prev, [tag._id]: data.contacts || [] }));
      } catch (err) {
        console.error("Failed to fetch contacts", err);
        setContactsMap(prev => ({ ...prev, [tag._id]: [] }));
      } finally {
        setLoadingContacts(false);
      }
    }
  };

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

      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${
          toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"
        }`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${toast.type === "success" ? "bg-emerald-100" : "bg-red-100"}`}>
            {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
          </span>
          {toast.message}
        </div>
      )}

      <Sidebar />

      <main className="md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:p-10 space-y-6 sm:space-y-8">
          
          {/* Premium Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-500 to-pink-500 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-indigo-200">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
                <TagIcon size={28} />
                Tags Management
              </h1>
              <p className="text-indigo-100 text-xs sm:text-sm mt-2 font-medium max-w-lg">
                Create, edit, or delete global and campaign-specific tags to automatically organize your contacts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
            
            {/* Left Column: Create/Edit Form */}
            <div className="lg:col-span-2">
              <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow sticky top-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={14} className="text-emerald-500" />
                    {editingId ? "Edit Tag" : "Create New Tag"}
                  </h2>
                  {editingId && (
                    <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-red-500 flex items-center gap-1">
                      <ArrowLeft size={12} /> Cancel
                    </button>
                  )}
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">Tag Name</label>
                    <input
                      type="text"
                      value={tagName}
                      onChange={(e) => setTagName(e.target.value)}
                      placeholder="e.g. Interested, VIP, Follow Up"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                      disabled={submitting}
                    />
                  </div>

                  <div 
                    className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${isSpecific ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}
                    onClick={() => setIsSpecific(!isSpecific)}
                  >
                    <input
                      type="checkbox"
                      id="isSpecific"
                      checked={isSpecific}
                      onChange={(e) => setIsSpecific(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="isSpecific" className="text-sm font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer flex-1">
                      <Link2 size={14} className="text-indigo-500" />
                      Campaign-Specific
                    </label>
                  </div>

                  {isSpecific && (
                    <div className="animate-slide-in">
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">Select Campaign</label>
                      <select
                        value={selectedCampaign}
                        onChange={(e) => setSelectedCampaign(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                      >
                        <option value="">-- Select a Campaign --</option>
                        {campaigns.map(c => (
                          <option key={c._id} value={c._id}>{c.name} ({c.status})</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-2 px-1 flex items-start gap-1.5">
                        <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                        This tag will ONLY be applied if the user replies to the selected campaign.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !tagName.trim()}
                    className={`w-full text-white px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                      editingId 
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600' 
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600'
                    }`}
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : (editingId ? <Check size={16} /> : <Plus size={16} />)}
                    {submitting ? "Saving..." : editingId ? "Update Tag" : "Save Tag"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Tags List */}
            <div className="lg:col-span-3">
              <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow min-h-[400px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <TagIcon size={14} className="text-slate-500" />
                    Active Tags
                  </h2>
                  <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {tags.length} Total
                  </span>
                </div>

                {tags.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                      <TagIcon size={28} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1">No tags yet</h3>
                    <p className="text-sm text-slate-400 max-w-xs">Create your first tag using the form on the left to start organizing your audience.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {tags.map((tag) => {
                      const isExpanded = expandedTagId === tag._id;
                      const contacts = contactsMap[tag._id] || [];
                      const isSpecificTag = tag.isCampaignSpecific;
                      const isDeleting = deletingId === tag._id;

                      return (
                        <div 
                          key={tag._id} 
                          className={`rounded-xl border transition-all overflow-hidden ${
                            isExpanded 
                              ? (isSpecificTag ? 'border-indigo-300 shadow-md' : 'border-emerald-300 shadow-md') 
                              : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full gap-2 pl-4 pr-3 py-3">
                            <div 
                              className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                              onClick={() => handleTagClick(tag)}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${isSpecificTag ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-900 text-sm truncate">{tag.name}</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5 ${
                                  isSpecificTag ? 'text-indigo-600' : 'text-emerald-600'
                                }`}>
                                  {isSpecificTag ? (
                                    <>
                                      <Link2 size={9} /> Campaign Specific {tag.campaignName ? `(${tag.campaignName})` : ''}
                                    </>
                                  ) : (
                                    'Global Tag'
                                  )}
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 shrink-0">
                              {!isDeleting ? (
                                <>
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1 hidden sm:flex">
                                    <Users size={10} /> {contacts.length || 0}
                                  </span>
                                  <button 
                                    onClick={() => handleEditClick(tag)} 
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                    title="Edit Tag"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button 
                                    onClick={() => setDeletingId(tag._id)} 
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    title="Delete Tag"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  <ChevronDown 
                                    size={16} 
                                    className={`text-slate-400 transition-transform cursor-pointer ${isExpanded ? 'rotate-180' : ''}`} 
                                    onClick={() => handleTagClick(tag)}
                                  />
                                </>
                              ) : (
                                <div className="flex items-center gap-1 bg-red-50 p-1 rounded-md border border-red-100">
                                  <span className="text-[10px] font-bold text-red-600 px-1">Delete?</span>
                                  <button 
                                    onClick={() => handleDeleteTag(tag._id)} 
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
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/50 p-4 animate-slide-in max-h-60 overflow-y-auto">
                              {loadingContacts && !contacts.length ? (
                                <div className="flex justify-center items-center py-4">
                                  <Loader2 size={16} className="animate-spin text-slate-400" />
                                </div>
                              ) : contacts.length > 0 ? (
                                <div className="space-y-2">
                                  {contacts.map((contact, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs">
                                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                                        {contact.name?.charAt(0).toUpperCase() || <Phone size={12} />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 truncate">{contact.name || "Unknown"}</p>
                                        <p className="text-slate-500 font-mono">{contact.phone}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <p className="text-xs text-slate-400 font-medium">No contacts have been tagged with this yet.</p>
                                </div>
                              )}
                            </div>
                          )}
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
    </div>
  );
}
