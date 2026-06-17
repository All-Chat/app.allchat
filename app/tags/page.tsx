/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Tag as TagIcon, Plus, Loader2, X, Check, Trash2, Link2 } from "lucide-react";

export default function TagsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [tags, setTags] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [tagName, setTagName] = useState("");
  const [isSpecific, setIsSpecific] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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
      
      // Only show completed/running campaigns for tagging purposes
      const validCamps = (campsData.campaigns || []).filter((c: any) => c.status !== "saved" && c.status !== "scheduled");
      setCampaigns(validCamps);

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

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    if (isSpecific && !selectedCampaign) {
      showToast("Please select a campaign", "error");
      return;
    }

    setSubmitting(true);
    try {
      const camp = campaigns.find(c => c._id === selectedCampaign);
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: tagName, 
          isCampaignSpecific: isSpecific,
          campaignId: isSpecific ? selectedCampaign : null,
          campaignName: isSpecific ? camp?.name : null
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create tag");

      setTagName("");
      setIsSpecific(false);
      setSelectedCampaign("");
      showToast("Tag created successfully!");
      loadData(); 
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
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
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        @keyframes slide-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>

      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${
          toast.type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"
        }`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center ${toast.type === "success" ? "bg-emerald-100" : "bg-red-100"}`}>
            {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
          </span>
          {toast.message}
        </div>
      )}

      <Sidebar />

      <main className="ml-0 md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Tags</h1>
                <p className="text-sm text-gray-400 mt-0.5">Create global or campaign-specific tags</p>
              </div>
            </div>
          </header>

          {/* Create Tag Form */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus size={16} className="text-emerald-600" />
              Create New Tag
            </h2>
            <form onSubmit={handleCreateTag} className="space-y-4">
              <input
                type="text"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g. Interested, VIP, Follow Up"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                disabled={submitting}
              />

              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="isSpecific"
                  checked={isSpecific}
                  onChange={(e) => setIsSpecific(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="isSpecific" className="text-sm font-medium text-gray-700 flex items-center gap-1.5 cursor-pointer">
                  <Link2 size={14} className="text-indigo-500" />
                  Make this tag Campaign-Specific
                </label>
              </div>

              {isSpecific && (
                <div className="animate-slide-in">
                  <select
                    value={selectedCampaign}
                    onChange={(e) => setSelectedCampaign(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                  >
                    <option value="">-- Select a Campaign --</option>
                    {campaigns.map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-2 px-1">
                    This tag will ONLY be applied if the user replies to the selected campaign.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !tagName.trim()}
                className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Save Tag
              </button>
            </form>
          </div>

          {/* Tags List */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TagIcon size={16} className="text-gray-500" />
              Your Tags ({tags.length})
            </h2>

            {tags.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center text-gray-300 mb-3">
                  <TagIcon size={24} />
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-1">No tags yet</h3>
                <p className="text-sm text-gray-400 max-w-xs">Create your first tag using the form above.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tags.map((tag) => (
                  <div 
                    key={tag._id} 
                    className="group flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 pl-3 pr-2 py-2.5 rounded-xl text-sm text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold flex items-center gap-2">
                         <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                         {tag.name}
                      </span>
                      {tag.isCampaignSpecific && tag.campaignName && (
                        <span className="text-[11px] text-indigo-600 flex items-center gap-1 mt-1 ml-4">
                          <Link2 size={10} />
                          Linked to: {tag.campaignName}
                        </span>
                      )}
                    </div>
                    <button className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
}
