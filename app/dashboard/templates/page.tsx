/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useMemo, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Type, Image, Video, FileText, MousePointerClick, ExternalLink, Phone,
  Trash2, Send, Loader2, Upload, X, Globe, AlertTriangle,
} from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession } from "next-auth/react";

type HeaderType = "none" | "text" | "image" | "video" | "document";
type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
type SampleSource = "upload" | "url";
type TemplateButton = { id: string; type: ButtonType; text: string; url?: string; phone?: string };

const uid = () => Math.random().toString(36).substr(2, 9);

export default function TemplatesPage() {
  const { data: session, status } = useSession();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("en");
  const [submitting, setSubmitting] = useState(false);

  const [headerType, setHeaderType] = useState<HeaderType>("none");
  const [headerText, setHeaderText] = useState("");
  const [sampleSource, setSampleSource] = useState<SampleSource>("upload");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");

  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  const [mediaPermissionWarning, setMediaPermissionWarning] = useState(false);

  const bodyVariables = useMemo(() => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g);
    if (!matches) return [];
    const uniqueNums = [...new Set(matches.map((m) => parseInt(m.replace(/\D/g, ""))))];
    return uniqueNums.sort((a, b) => a - b);
  }, [bodyText]);

  const [bodyExamples, setBodyExamples] = useState<Record<number, string>>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/";
    }
  }, [status]);

  const handleNameChange = (val: string) =>
    setName(val.toLowerCase().replace(/[^a-z0-9_]/g, "_"));

  const handleSampleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be under 5MB");
        e.target.value = "";
        return;
      }
      setSampleFile(file);
    }
  };

  const addButton = (type: ButtonType) => {
    if (buttons.length >= 3) { toast.error("Max 3 buttons allowed"); return; }
    setButtons([...buttons, { id: uid(), type, text: "" }]);
  };

  const updateButton = (id: string, data: Partial<TemplateButton>) =>
    setButtons(buttons.map((b) => (b.id === id ? { ...b, ...data } : b)));

  const removeButton = (id: string) =>
    setButtons(buttons.filter((b) => b.id !== id));

  const isMediaHeader = ["image", "video", "document"].includes(headerType);

  const resetForm = () => {
    setName(""); setBodyText(""); setHeaderText(""); setFooterText("");
    setHeaderType("none"); setSampleFile(null); setSampleUrl("");
    setSampleSource("upload"); setButtons([]); setBodyExamples({});
    setMediaPermissionWarning(false);
  };

  const createTemplate = async () => {
    if (!name) { toast.error("Template name is required"); return; }
    if (!bodyText) { toast.error("Body text is required"); return; }
    if (headerType === "text" && !headerText) { toast.error("Please enter header text"); return; }
    if (isMediaHeader && sampleSource === "upload" && !sampleFile) { toast.error("Please upload a sample media file"); return; }
    if (isMediaHeader && sampleSource === "url" && !sampleUrl.trim()) { toast.error("Please provide a sample media URL"); return; }
    if (isMediaHeader && sampleSource === "url" && sampleUrl.trim()) {
      try { new URL(sampleUrl.trim()); } catch { toast.error("Please enter a valid URL (include https://)"); return; }
    }
    for (const varNum of bodyVariables) {
      if (!bodyExamples[varNum]?.trim()) { toast.error(`Please provide a sample value for {{${varNum}}}`); return; }
    }
    for (const btn of buttons) {
      if (!btn.text.trim()) { toast.error("All buttons must have label text"); return; }
      if (btn.type === "URL" && !btn.url?.trim()) { toast.error("URL buttons must have a URL"); return; }
      if (btn.type === "PHONE_NUMBER" && !btn.phone?.trim()) { toast.error("Phone buttons must have a phone number"); return; }
    }

    setSubmitting(true);

    try {
      const components: any[] = [];

      if (headerType !== "none") {
        const headerComp: any = { type: "HEADER", format: headerType.toUpperCase() };
        if (headerType === "text") headerComp.text = headerText;
        components.push(headerComp);
      }

      const bodyComp: any = { type: "BODY", text: bodyText };
      if (bodyVariables.length > 0) {
        const exampleValues = bodyVariables.map((v) => bodyExamples[v] || `sample_${v}`);
        bodyComp.example = { body_text: [exampleValues] };
      }
      components.push(bodyComp);

      if (footerText) components.push({ type: "FOOTER", text: footerText });

      if (buttons.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: buttons.map((b) => {
            const btn: any = { type: b.type, text: b.text };
            if (b.type === "URL") btn.url = b.url;
            if (b.type === "PHONE_NUMBER") btn.phone_number = b.phone;
            return btn;
          }),
        });
      }

      const formData = new FormData();
      formData.append("name", name);
      formData.append("category", category);
      formData.append("language", language);
      formData.append("components", JSON.stringify(components));
      formData.append("sampleSource", sampleSource);

      if (isMediaHeader && sampleSource === "upload" && sampleFile) {
        formData.append("sampleFile", sampleFile);
      }
      if (isMediaHeader && sampleSource === "url" && sampleUrl.trim()) {
        formData.append("sampleUrl", sampleUrl.trim());
      }

      const res = await fetch("/api/templates/create", { method: "POST", body: formData });

      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        setTimeout(() => window.location.href = "/", 1500);
        setSubmitting(false);
        return;
      }

      let data;
      try {
        data = await res.json();
      } catch {
        toast.error("Server returned an invalid response.");
        setSubmitting(false);
        return;
      }

      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed", { autoClose: 8000 });
        if (data.mediaWarning) {
          setMediaPermissionWarning(true);
        }
        setSubmitting(false);
        return;
      }

      if (data.mediaWarning) {
        toast.warning(
          "Template created as TEXT-ONLY. Media headers require 'whatsapp_business_management' permission.",
          { autoClose: 10000 }
        );
        setMediaPermissionWarning(true);
      } else {
        toast.success("Template submitted! Pending Meta approval 🚀");
      }

      resetForm();
    } catch (err) {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const acceptTypes: Record<string, string> = {
    image: "image/png,image/jpeg,image/webp",
    video: "video/mp4,video/3gp",
    document: "application/pdf,.pdf",
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Sidebar Component - Handles Mobile Subnavbar automatically */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="md:ml-64 flex h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-4 sm:p-8">
            <div className="mb-6 sm:mb-8">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Template</h1>
              <p className="text-gray-500 text-xs sm:text-sm mt-1">Design rich WhatsApp messages for Meta approval.</p>
            </div>

            {/* MEDIA PERMISSION WARNING BANNER */}
            {mediaPermissionWarning && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-800">Media Upload Permission Missing</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Your Meta token needs the <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px] sm:text-xs">whatsapp_business_management</code> permission to upload media for template headers.
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    <strong>How to fix:</strong> Go to Meta Business Settings → Apps → Your App → App Review → Request this permission. Then generate a new token with it.
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    For now, you can still create <strong>text-only</strong> templates (no media headers).
                  </p>
                </div>
                <button onClick={() => setMediaPermissionWarning(false)} className="text-amber-400 hover:text-amber-600 shrink-0">
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="space-y-5">
              {/* Name & Category & Language */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                  <div className="sm:col-span-3">
                    <label className="text-xs font-bold text-gray-800 mb-2 block">Template Name</label>
                    <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition text-sm font-mono" placeholder="welcome_message" value={name} onChange={(e) => handleNameChange(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold text-gray-800 mb-2 block">Category</label>
                    <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option>MARKETING</option><option>UTILITY</option><option>AUTHENTICATION</option>
                    </select>
                  </div>
                  <div className="sm:col-span-1">
                    <label className="text-xs font-bold text-gray-800 mb-2 block">Lang</label>
                    <select className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
                      <option value="en">EN</option>
                      <option value="en_US">EN_US</option>
                      <option value="en_GB">EN_GB</option>
                      <option value="hi">HI</option>
                      <option value="es">ES</option>
                      <option value="pt_BR">PT_BR</option>
                      <option value="fr">FR</option>
                      <option value="de">DE</option>
                      <option value="id">ID</option>
                      <option value="ar">AR</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Header */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h3 className="text-xs font-bold text-gray-800 mb-3">Header (Optional)</h3>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {[
                    { id: "none", label: "None", icon: Type },
                    { id: "text", label: "Text", icon: Type },
                    { id: "image", label: "Image", icon: Image },
                    { id: "video", label: "Video", icon: Video },
                    { id: "document", label: "PDF", icon: FileText },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setHeaderType(t.id as HeaderType);
                        setHeaderText("");
                        setSampleFile(null);
                        setSampleUrl("");
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        headerType === t.id
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                          : "border-gray-100 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      <t.icon size={14} /> {t.label}
                    </button>
                  ))}
                </div>

                {headerType === "text" && (
                  <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition text-sm" placeholder="Header text..." value={headerText} onChange={(e) => setHeaderText(e.target.value)} />
                )}

                {isMediaHeader && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-blue-700">
                        Media headers require the <code className="bg-blue-100 px-1 rounded font-mono">whatsapp_business_management</code> permission on your Meta token. If you don&apos;t have it, the template will be created as text-only.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSampleSource("upload"); setSampleUrl(""); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${sampleSource === "upload" ? "bg-blue-50 border-blue-400 text-blue-700" : "border-gray-100 text-gray-500 hover:bg-gray-50"}`}
                      >
                        <Upload size={12} /> Upload
                      </button>
                      <button
                        onClick={() => { setSampleSource("url"); setSampleFile(null); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${sampleSource === "url" ? "bg-blue-50 border-blue-400 text-blue-700" : "border-gray-100 text-gray-500 hover:bg-gray-50"}`}
                      >
                        <Globe size={12} /> URL
                      </button>
                    </div>

                    {sampleSource === "upload" && (
                      <label className="block">
                        <div className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${sampleFile ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/30"}`}>
                          <input key={sampleFile ? 'has-file' : 'no-file'} type="file" accept={acceptTypes[headerType]} onChange={handleSampleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                          {sampleFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-xs font-medium text-emerald-700 truncate">{sampleFile.name}</span>
                              <span className="text-[10px] text-gray-400">({(sampleFile.size / 1024).toFixed(0)}KB)</span>
                              <button onClick={(e) => { e.preventDefault(); setSampleFile(null); }} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                            </div>
                          ) : (
                            <div>
                              <Upload size={20} className="mx-auto text-gray-400 mb-1" />
                              <p className="text-xs text-gray-500">Click to upload sample {headerType}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">Max 5MB</p>
                            </div>
                          )}
                        </div>
                      </label>
                    )}

                    {sampleSource === "url" && (
                      <div>
                        <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition text-sm" placeholder="https://example.com/sample-image.jpg" value={sampleUrl} onChange={(e) => setSampleUrl(e.target.value)} />
                        <p className="text-[10px] text-gray-400 mt-1.5">Paste a publicly accessible URL.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h3 className="text-xs font-bold text-gray-800 mb-3">Body</h3>
                <textarea
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 h-28 transition resize-none text-sm"
                  placeholder="Write your message here... (use {{1}} for variables)"
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  maxLength={1024}
                />
                <div className="flex justify-between mt-1.5 px-1">
                  <p className="text-[10px] text-gray-400">Variables: {"{{1}}"}</p>
                  <p className="text-[10px] text-gray-400">{bodyText.length} / 1024</p>
                </div>
                {bodyVariables.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                      ⚠️ Meta requires sample values for all variables
                    </p>
                    {bodyVariables.map((varNum) => (
                      <div key={varNum} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-500 w-10 shrink-0">{"{{" + varNum + "}}"}</span>
                        <input className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 transition min-w-0" placeholder={`Sample value`} value={bodyExamples[varNum] || ""} onChange={(e) => setBodyExamples((prev) => ({ ...prev, [varNum]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h3 className="text-xs font-bold text-gray-800 mb-3">Footer (Optional)</h3>
                <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition text-sm" placeholder="e.g. Reply STOP to unsubscribe" value={footerText} onChange={(e) => setFooterText(e.target.value)} />
              </div>

              {/* Buttons */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-3">
                  <h3 className="text-xs font-bold text-gray-800">Buttons (Max 3)</h3>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => addButton("QUICK_REPLY")} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-medium hover:bg-gray-100 transition"><MousePointerClick size={10} /> Reply</button>
                    <button onClick={() => addButton("URL")} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-medium hover:bg-gray-100 transition"><ExternalLink size={10} /> URL</button>
                    <button onClick={() => addButton("PHONE_NUMBER")} className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-medium hover:bg-gray-100 transition"><Phone size={10} /> Call</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {buttons.map((btn) => (
                    <div key={btn.id} className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 flex items-start gap-2">
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <input className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 transition" placeholder="Button Label" value={btn.text} onChange={(e) => updateButton(btn.id, { text: e.target.value })} />
                        {btn.type === "URL" && <input className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 transition" placeholder="https://example.com" value={btn.url || ""} onChange={(e) => updateButton(btn.id, { url: e.target.value })} />}
                        {btn.type === "PHONE_NUMBER" && <input className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-emerald-400 transition" placeholder="+1234567890" value={btn.phone || ""} onChange={(e) => updateButton(btn.id, { phone: e.target.value })} />}
                      </div>
                      <button onClick={() => removeButton(btn.id)} className="text-gray-300 hover:text-red-500 transition mt-1.5 shrink-0"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {buttons.length === 0 && <p className="text-[10px] text-gray-400 text-center py-2">No buttons added.</p>}
                </div>
              </div>

              <div className="flex justify-center sm:justify-end pt-2 pb-12">
                <button onClick={createTemplate} disabled={submitting} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-md hover:bg-emerald-600 transition-all disabled:opacity-50 text-sm">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {submitting ? "Submitting..." : "Submit to Meta"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview - Hidden on mobile/tablets */}
        <div className="hidden lg:flex w-[420px] bg-white border-l border-gray-100 items-center justify-center p-8 sticky top-0 h-screen">
          <div className="w-[320px] min-h-[600px] bg-[#ECE5DD] rounded-3xl shadow-xl overflow-hidden flex flex-col border border-gray-200">
            <div className="bg-[#075E54] h-[50px] flex items-end pb-2 px-4 text-white">
              <span className="text-xs font-bold">WhatsApp Preview</span>
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-2" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')" }}>
              <div className="flex justify-end">
                <div className="max-w-[90%] bg-[#D9FDD3] rounded-t-xl rounded-l-xl rounded-br-sm shadow-sm overflow-hidden">
                  {headerType === "image" && (
                    <div className="w-full h-40 bg-gray-200 flex flex-col items-center justify-center gap-2 overflow-hidden">
                      {sampleFile ? <img src={URL.createObjectURL(sampleFile)} alt="Preview" className="w-full h-full object-cover" /> : sampleUrl ? <img src={sampleUrl} alt="Preview" className="w-full h-full object-cover" /> : <><Image size={32} className="text-gray-400" /><span className="text-[10px] text-gray-500 font-medium">Image Header</span></>}
                    </div>
                  )}
                  {headerType === "video" && (
                    <div className="relative w-full h-40 bg-gray-200 flex flex-col items-center justify-center gap-2 overflow-hidden">
                      {sampleFile ? <video src={URL.createObjectURL(sampleFile)} className="w-full h-full object-cover" /> : <><Video size={32} className="text-gray-400" /><span className="text-[10px] text-gray-500 font-medium">Video Header</span></>}
                    </div>
                  )}
                  {headerType === "document" && (
                    <div className="w-full h-24 bg-gray-200 flex flex-col items-center justify-center gap-2">
                      <FileText size={32} className="text-gray-400" /><span className="text-[10px] text-gray-500 font-medium">PDF Document</span>
                    </div>
                  )}
                  <div className="p-2">
                    {headerType === "text" && headerText && <p className="font-bold text-[13px] text-gray-900 mb-1">{headerText}</p>}
                    <p className="text-[12px] text-gray-900 whitespace-pre-wrap">
                      {bodyText ? bodyText.replace(/\{\{(\d+)\}\}/g, (_, num) => bodyExamples[parseInt(num)] || `{{${num}}}`) : "Your message body here..."}
                    </p>
                    {footerText && <p className="text-[10px] text-gray-500 mt-1">{footerText}</p>}
                    <div className="flex justify-end items-center gap-1 mt-1">
                      <span className="text-[9px] text-gray-500">12:00 PM</span>
                      <span className="text-blue-500 text-[9px]">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
              {buttons.length > 0 && (
                <div className="flex justify-end">
                  <div className="max-w-[90%] bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    {buttons.map((btn) => (
                      <div key={btn.id} className="px-3 py-2 text-center border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition cursor-pointer">
                        <span className="text-[11px] font-medium text-blue-600 flex items-center justify-center gap-1.5">
                          {btn.type === "QUICK_REPLY" && <MousePointerClick size={12} />}
                          {btn.type === "URL" && <ExternalLink size={12} />}
                          {btn.type === "PHONE_NUMBER" && <Phone size={12} />}
                          {btn.text || "Button"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <ToastContainer position="bottom-right" theme="light" autoClose={5000} />
    </div>
  );
}
