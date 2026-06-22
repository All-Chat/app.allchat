/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Loader2, Save, Search, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import Sidebar from "@/components/Sidebar";

export default function WhiteLabelAdminPage() {
  const [searchName, setSearchName] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [foundUser, setFoundUser] = useState<any>(null);

  const [wlSettings, setWlSettings] = useState({
    enabled: false,
    appName: "",
    logoUrl: "",
    primaryColor: "#10b981",
    supportEmail: "",
    brandUrl: "" // e.g., "therealleads.in"
  });

  const handleSearchUser = async () => {
    if (!searchName) return toast.error("Enter a username to search");
    setSearching(true);
    setFoundUser(null);

    try {
      const res = await fetch(`/api/admin/user?name=${encodeURIComponent(searchName)}`);
      const data = await res.json();

      if (data.success) {
        setFoundUser(data.user);
        const wl = data.user.whiteLabel || {};
        setWlSettings({
          enabled: wl.enabled || false,
          appName: wl.appName || "",
          logoUrl: wl.logoUrl || "",
          primaryColor: wl.primaryColor || "#10b981",
          supportEmail: wl.supportEmail || "",
          brandUrl: wl.brandUrl || ""
        });
        toast.success("User found!");
      } else {
        toast.error(data.message || "User not found");
      }
    } catch (error) {
      toast.error("Error searching user");
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/whitelabel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: foundUser._id, whiteLabelData: wlSettings }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("White Label settings saved! Domain SSL is being provisioned (takes 1-2 mins).");
      } else {
        toast.error(data.message || "Failed to save settings");
      }
    } catch (error) {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Sidebar />
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-amber-100 rounded-2xl border border-amber-200">
            <ShieldCheck className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">White Label Configuration</h1>
            <p className="text-sm text-slate-500">Enable and configure custom branding and domain for tenants.</p>
          </div>
        </div>

        {/* Search User by Name */}
        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Enter Username (e.g., therealleads)"
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
          />
          <button
            onClick={handleSearchUser}
            disabled={searching}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
        </div>

        {foundUser && (
          <div className="space-y-5 border-t border-slate-100 pt-6">
            <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600 flex justify-between items-center">
              <span>Configuring for: <span className="font-bold">{foundUser.name}</span></span>
              <span className="text-xs text-slate-400">ID: {foundUser._id}</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Enable White Label</h3>
                <p className="text-xs text-slate-500">Activate custom branding and URL redirect for this user.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={wlSettings.enabled} 
                  onChange={(e) => setWlSettings({ ...wlSettings, enabled: e.target.checked })}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">App / Brand Name</label>
                <input
                  type="text"
                  value={wlSettings.appName}
                  onChange={(e) => setWlSettings({ ...wlSettings, appName: e.target.value })}
                  placeholder="The Real Leads"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">Custom Domain URL</label>
                <input
                  type="text"
                  value={wlSettings.brandUrl}
                  onChange={(e) => setWlSettings({ ...wlSettings, brandUrl: e.target.value.replace(/https?:\/\//, '').replace(/\s/g, "") })}
                  placeholder="therealleads.in"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Do not include http:// or www. Just the domain.</p>
              </div>
            </div>

            {/* ✅ LOGO URL INPUT ONLY (With Live Preview) */}
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">Brand Logo URL</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {wlSettings.logoUrl ? (
                    <img src={wlSettings.logoUrl} alt="Logo Preview" className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-[10px] text-slate-400 text-center px-2">No Logo</span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={wlSettings.logoUrl}
                    onChange={(e) => setWlSettings({ ...wlSettings, logoUrl: e.target.value })}
                    placeholder="https://therealleads.com/logo.png"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Paste a direct link to the logo image (PNG, JPG, SVG).</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">Primary Brand Color</label>
                <input
                  type="color"
                  value={wlSettings.primaryColor}
                  onChange={(e) => setWlSettings({ ...wlSettings, primaryColor: e.target.value })}
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer p-1"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">Support Email</label>
                <input
                  type="email"
                  value={wlSettings.supportEmail}
                  onChange={(e) => setWlSettings({ ...wlSettings, supportEmail: e.target.value })}
                  placeholder="support@therealleads.com"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save White Label Settings
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
