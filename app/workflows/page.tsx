/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar"; 
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Connection,
  Edge,
  Node,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Zap,
  MessageSquare,
  Plus,
  Trash2,
  X,
  Workflow as WorkflowIcon,
  Check,
  MousePointerClick,
  Maximize,
  Minimize,
  Type,
  Crosshair,
  Loader2,
  Layout,
  FileText,
  Upload,
  Link as LinkIcon,
  Library,
  PhoneCall,
  Tag,
} from "lucide-react";
import { useSession } from "next-auth/react";

/* ────────────────────────────────────────────
   MOCK EXISTING TAGS
   ──────────────────────────────────────────── */
const EXISTING_TAGS = [
  "Lead",
  "VIP Customer",
  "Newsletter",
  "Support Ticket",
  "Blocked",
  "Interested"
];

/* ────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────── */
type Trigger = { keyword: string; matchMode: "exact" | "contains" };
type Button = { id: string; label: string; nextStepId: string | null };
type Step = { 
  id: string; 
  stepType?: "message" | "url_action" | "call_action" | "tag_node";
  message: string; 
  buttons: Button[]; 
  position?: { x: number; y: number };
  mediaType?: "image" | "video" | "document" | "audio" | "link" | null;
  mediaUrl?: string | null;
  urlLabel?: string;
  url?: string;
  phoneNumber?: string;
  tagName?: string; // Added for Tag Node
};
type Workflow = {
  _id: string;
  triggers: Trigger[];
  steps: Record<string, Step>;
  rootStepId: string;
};

const uid = () => Math.random().toString(36).substr(2, 9);

const getYouTubeEmbedUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${urlObj.pathname.slice(1)}`;
    }
    if (urlObj.hostname.includes("youtube.com")) {
      const v = urlObj.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (urlObj.pathname.includes("/embed/")) {
        return url;
      }
    }
  } catch (e) {
    return null;
  }
  return null;
};

/* ────────────────────────────────────────────
   TOAST COMPONENT
   ──────────────────────────────────────────── */
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${
        type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"
      }`}
    >
      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${type === "success" ? "bg-emerald-100" : "bg-red-100"}`}>
        {type === "success" ? <Check size={14} /> : <X size={14} />}
      </span>
      {message}
    </div>
  );
}

/* ────────────────────────────────────────────
   REACT FLOW CUSTOM NODES
   ──────────────────────────────────────────── */
const TriggerNode = ({ data, id }: any) => {
  const { setNodes } = useReactFlow();

  const handleTriggerChange = (index: number, val: string, mode?: "exact" | "contains") => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id) {
          const newTriggers = [...data.triggers];
          newTriggers[index] = { keyword: val, matchMode: mode || newTriggers[index].matchMode || "contains" };
          return { ...n, data: { ...n.data, triggers: newTriggers } };
        }
        return n;
      })
    );
  };

  const addTrigger = () => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id) return { ...n, data: { ...n.data, triggers: [...n.data.triggers, { keyword: "", matchMode: "contains" }] } };
        return n;
      })
    );
  };

  const removeTrigger = (index: number) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id) return { ...n, data: { ...n.data, triggers: n.data.triggers.filter((_: any, i: number) => i !== index) } };
        return n;
      })
    );
  };

  return (
    <div className="w-72 bg-white border border-amber-200 shadow-lg rounded-2xl overflow-hidden">
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white" />
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-amber-50 to-white">
        <div className="flex items-center gap-2 text-amber-700">
          <Zap size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">Triggers</span>
        </div>
        <button onClick={addTrigger} className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
        {data.triggers.map((trigger: Trigger, index: number) => (
          <div key={index} className="flex items-center gap-2 group">
            <div className="flex-1 relative min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500"><Zap size={14} /></span>
              <input 
                value={trigger.keyword} 
                onChange={(e) => handleTriggerChange(index, e.target.value)} 
                placeholder="e.g. price" 
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm text-gray-900 placeholder:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm" 
              />
            </div>
            <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5 shrink-0">
              <button onClick={() => handleTriggerChange(index, trigger.keyword, "contains")} className={`p-1.5 rounded-md ${trigger.matchMode === "contains" ? "bg-blue-500 text-white" : "text-gray-400"}`}>
                <Type size={12} />
              </button>
              <button onClick={() => handleTriggerChange(index, trigger.keyword, "exact")} className={`p-1.5 rounded-md ${trigger.matchMode === "exact" ? "bg-purple-500 text-white" : "text-gray-400"}`}>
                <Crosshair size={12} />
              </button>
            </div>
            <button onClick={() => removeTrigger(index)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const MessageNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
    );
  };

  const handleMsgChange = (msg: string) => updateNode({ message: msg });

  const addButton = () => {
    const newBtn: Button = { id: uid(), label: "", nextStepId: null };
    updateNode({ buttons: [...data.buttons, newBtn] });
  };

  const removeButton = (btnId: string) => {
    updateNode({ buttons: data.buttons.filter((b: Button) => b.id !== btnId) });
  };

  const handleButtonLabelChange = (btnId: string, label: string) => {
    updateNode({ buttons: data.buttons.map((b: Button) => (b.id === btnId ? { ...b, label } : b)) });
  };

  const maxSizes: Record<string, number> = {
    image: 2 * 1024 * 1024, video: 10 * 1024 * 1024, audio: 10 * 1024 * 1024, document: 20 * 1024 * 1024
  };

  const allowedTypes: Record<string, string[]> = {
    image: ["image/jpeg", "image/png", "image/webp"],
    video: ["video/mp4", "video/3gpp"],
    audio: ["audio/mpeg", "audio/aac", "audio/ogg", "audio/amr"],
    document: [
      "application/pdf", "text/plain", "application/msword", 
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint", 
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel", 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let mediaType: "image" | "video" | "document" | "audio" = "document";
    if (file.type.startsWith("image")) mediaType = "image";
    if (file.type.startsWith("video")) mediaType = "video";
    if (file.type.startsWith("audio")) mediaType = "audio";

    if (!allowedTypes[mediaType]?.includes(file.type)) {
      alert(`Invalid file format for ${mediaType}.`);
      return;
    }
    if (file.size > maxSizes[mediaType]) {
      alert(`File is too large. Max size for ${mediaType} is ${maxSizes[mediaType] / (1024 * 1024)}MB.`);
      return;
    }

    updateNode({ mediaUrl: "UPLOADING...", mediaType });

    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const text = await res.text();
      if (!res.ok) throw new Error(text || "Upload failed");
      const resData = JSON.parse(text);
      
      if (resData.success && resData.url) {
        updateNode({ mediaUrl: resData.url, mediaType });
      } else {
        throw new Error(resData.error || "Unknown error");
      }
    } catch (err: any) {
      console.error("Upload failed", err);
      alert("Media upload failed: " + err.message);
      updateNode({ mediaUrl: null, mediaType: null });
    }
  };

  const openLibrary = async () => {
    setShowLibrary(true);
    setLibraryItems([]);
    try {
      const res = await fetch("/api/media");
      const text = await res.text();
      if (!res.ok) {
        console.error("Library API Error:", text);
        alert("Failed to load media library.");
        setShowLibrary(false);
        return;
      }
      const data = JSON.parse(text);
      if (data.media) setLibraryItems(data.media);
    } catch (err: any) {
      console.error("Failed to load library", err);
      alert("An error occurred while fetching the media library.");
      setShowLibrary(false);
    }
  };

  const ytEmbedUrl = data.mediaType === "link" && data.mediaUrl ? getYouTubeEmbedUrl(data.mediaUrl) : null;

  return (
    <div className="w-72 bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white" />
      
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-white">
        <div className="flex items-center gap-2 text-emerald-700">
          <MessageSquare size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">Message Step</span>
        </div>
        <button onClick={() => deleteElements({ nodes: [{ id }] })} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={14} />
        </button>
      </div>
      
      {data.mediaUrl && (
        <div 
          className="relative border-b border-gray-100 cursor-pointer group/media bg-gray-50 p-2" 
          onClick={() => updateNode({ mediaUrl: null, mediaType: null })} 
          title="Click to remove media"
        >
          {data.mediaUrl.startsWith("http") || data.mediaType === "link" ? (
            <>
              {data.mediaType === "image" && <img src={data.mediaUrl} alt="Media" className="w-full h-32 object-cover" />}
              {data.mediaType === "video" && <video src={data.mediaUrl} className="w-full h-32 object-cover" controls />}
              {data.mediaType === "audio" && <audio src={data.mediaUrl} controls className="w-full mt-2" />}
              {data.mediaType === "document" && (
                <div className="flex items-center gap-2 w-full p-2">
                  <FileText size={24} className="text-red-500" />
                  <span className="text-xs text-gray-600 truncate">Document URL (Click to remove)</span>
                </div>
              )}
              {data.mediaType === "link" && (
                <div className="w-full space-y-2">
                  {ytEmbedUrl ? (
                    <div className="relative">
                      <iframe 
                        src={ytEmbedUrl} 
                        className="w-full aspect-video rounded-md pointer-events-none" 
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                      ></iframe>
                      <span className="absolute top-1 right-1 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">YouTube Preview (Click to remove)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full p-2 border border-gray-200 rounded-lg bg-white shadow-sm">
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${data.mediaUrl}&sz=64`} 
                        alt="favicon" 
                        className="w-10 h-10 rounded-md bg-gray-50 border border-gray-200 object-contain p-1"
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/40x40/e5e7eb/9ca3af?text=Link`; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">Social Media Link</p>
                        <p className="text-[10px] text-gray-500 truncate">{data.mediaUrl}</p>
                      </div>
                      <LinkIcon size={16} className="text-blue-500 shrink-0" />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 w-full p-2">
              {data.mediaUrl === "UPLOADING..." ? (
                <Loader2 size={20} className="animate-spin text-gray-400" />
              ) : (
                <FileText size={24} className="text-emerald-500" />
              )}
              <span className="text-xs text-gray-600 truncate">
                {data.mediaUrl === "UPLOADING..." ? "Uploading to WhatsApp..." : `${data.mediaType?.toUpperCase()} Uploaded (Click to remove)`}
              </span>
            </div>
          )}
          <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/media:opacity-100 transition-opacity z-10">
            <X size={12} />
          </div>
        </div>
      )}

      <div className="p-3 space-y-3">
        {!data.mediaUrl && (
          <div className="border border-dashed border-gray-200 rounded-xl p-2 space-y-2">
            <select 
              value={data.mediaType || ""} 
              onChange={(e) => updateNode({ mediaType: e.target.value || null })}
              className="flex-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none"
            >
              <option value="">No Media / Link</option>
              <option value="link">Link / Social Media</option>
              <option value="image">Image (2MB)</option>
              <option value="video">Video (10MB)</option>
              <option value="audio">Audio (10MB)</option>
              <option value="document">PDF / Doc (20MB)</option>
            </select>
            
            {data.mediaType && (
              <div className="space-y-2 relative">
                <div className="relative">
                  <LinkIcon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder={data.mediaType === "link" ? "Paste URL (YouTube, Insta, FB)" : "Paste Public URL (Recommended)"} 
                    value={data.mediaUrl && data.mediaUrl !== "UPLOADING..." ? data.mediaUrl : ""} 
                    onChange={(e) => updateNode({ mediaUrl: e.target.value })}
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>
                
                {data.mediaType !== "link" && (
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-gray-200 rounded-lg cursor-pointer text-xs text-gray-600 hover:bg-gray-50">
                      <Upload size={12} /> Upload
                      <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                    <button 
                      onClick={openLibrary} 
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <Library size={12} /> Library
                    </button>
                  </div>
                )}

                {data.mediaType === "link" ? (
                  <p className="text-[9px] text-blue-600 leading-tight px-1">
                    🔗 WhatsApp will automatically generate a rich preview (thumbnail/video) for valid social media links.
                  </p>
                ) : (
                  <>
                    <p className="text-[9px] text-emerald-600 leading-tight mt-1 px-1">
                      ✅ URL is recommended (never expires).
                    </p>
                    <p className="text-[9px] text-amber-600 leading-tight px-1">
                      ⚠️ Uploaded files expire on WhatsApp servers after 30 days and must be re-uploaded.
                    </p>
                  </>
                )}

                {showLibrary && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="sticky top-0 bg-white p-1 border-b border-gray-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 px-1">Select Existing Media</span>
                      <button onClick={() => setShowLibrary(false)} className="text-gray-400 hover:text-red-500 p-0.5"><X size={10} /></button>
                    </div>
                    {libraryItems.length === 0 && <div className="p-2 text-[10px] text-gray-400 text-center">No media uploaded yet.</div>}
                    {libraryItems.map(item => (
                      <div 
                        key={item._id} 
                        className="p-1.5 text-[11px] hover:bg-blue-50 cursor-pointer flex items-center gap-2 border-b border-gray-50"
                        onClick={() => {
                          updateNode({ mediaUrl: item.mediaId, mediaType: item.type });
                          setShowLibrary(false);
                        }}
                      >
                        <FileText size={12} className="text-gray-400 shrink-0" />
                        <span className="truncate text-gray-700">{item.filename}</span>
                        <span className="ml-auto text-[9px] text-gray-400 uppercase">{item.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <textarea 
          value={data.message} 
          onChange={(e) => handleMsgChange(e.target.value)} 
          placeholder="Type auto-reply message..." 
          rows={3} 
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all resize-none" 
        />
        
        <div className="space-y-2 relative">
          {data.buttons.map((btn: Button) => (
            <div key={btn.id} className="bg-blue-50/50 border border-blue-200 rounded-xl p-2.5 space-y-1 group/btn relative">
              <Handle 
                type="source" 
                position={Position.Right} 
                id={btn.id} 
                style={{ top: '50%', right: '-12px' }} 
                className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white" 
              />
              <div className="flex items-center gap-2">
                <MousePointerClick size={14} className="text-blue-500 shrink-0" />
                <input 
                  value={btn.label} 
                  onChange={(e) => handleButtonLabelChange(btn.id, e.target.value)} 
                  placeholder="Button Text" 
                  className="flex-1 min-w-0 bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 shadow-sm" 
                />
                <button onClick={() => removeButton(btn.id)} className="opacity-0 group-hover/btn:opacity-100 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
          <button 
            onClick={addButton} 
            className="w-full py-2 border border-dashed border-blue-300 rounded-xl text-xs font-semibold text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 bg-blue-50/30"
          >
            <Plus size={12} /> Add Interactive Button (Unlimited)
          </button>
        </div>
      </div>
    </div>
  );
};

const URLActionNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
    );
  };

  return (
    <div className="w-72 bg-white border border-purple-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white" />
      
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center gap-2 text-purple-700">
          <LinkIcon size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">URL Action</span>
        </div>
        <button onClick={() => deleteElements({ nodes: [{ id }] })} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="p-3 space-y-3">
        <textarea 
          value={data.message} 
          onChange={(e) => updateNode({ message: e.target.value })} 
          placeholder="Message to show above the button..." 
          rows={2} 
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all resize-none" 
        />
        
        <div className="space-y-2">
          <div className="relative">
            <MousePointerClick size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-500" />
            <input 
              value={data.urlLabel || ""} 
              onChange={(e) => updateNode({ urlLabel: e.target.value })} 
              placeholder="Button Text (e.g. Visit Site)" 
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-purple-200 rounded-lg focus:outline-none focus:border-purple-400 shadow-sm bg-white text-gray-800" 
            />
          </div>
          <div className="relative">
            <LinkIcon size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-500" />
            <input 
              value={data.url || ""} 
              onChange={(e) => updateNode({ url: e.target.value })} 
              placeholder="https://example.com" 
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-purple-200 rounded-lg focus:outline-none focus:border-purple-400 shadow-sm bg-white text-gray-800" 
            />
          </div>
        </div>
        <p className="text-[9px] text-gray-500 leading-tight px-1">
          🔗 Clicking this button on WhatsApp will automatically open the URL in the user&apos;s browser.
        </p>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// CALL ACTION NODE
// ────────────────────────────────────────────
const CallActionNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
    );
  };

  return (
    <div className="w-72 bg-white border border-rose-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle type="target" position={Position.Left} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white" />
      
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-rose-50 to-white">
        <div className="flex items-center gap-2 text-rose-700">
          <PhoneCall size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">Call Action</span>
        </div>
        <button onClick={() => deleteElements({ nodes: [{ id }] })} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="p-3 space-y-3">
        <textarea 
          value={data.message} 
          onChange={(e) => updateNode({ message: e.target.value })} 
          placeholder="Message to show above the button..." 
          rows={2} 
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all resize-none" 
        />
        
        <div className="space-y-2">
          {/* Button Text Input */}
          <div className="relative">
            <MousePointerClick size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500" />
            <input 
              value={data.urlLabel || ""} 
              onChange={(e) => updateNode({ urlLabel: e.target.value })} 
              placeholder="Button Text (e.g. Call Support)" 
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-rose-200 rounded-lg focus:outline-none focus:border-rose-400 shadow-sm bg-white text-gray-800" 
            />
          </div>
          
          {/* Phone Number Input */}
          <div className="relative">
            <PhoneCall size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500" />
            <input 
              value={data.phoneNumber || ""} 
              onChange={(e) => updateNode({ phoneNumber: e.target.value })} 
              placeholder="Format: +1234567890 (with code)" 
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-rose-200 rounded-lg focus:outline-none focus:border-rose-400 shadow-sm bg-white text-gray-800" 
            />
          </div>
        </div>
        <p className="text-[9px] text-gray-500 leading-tight px-1">
          📞 Sends a clean WhatsApp button. Clicking it instantly opens the phone&apos;s native dialer with the number filled in.
        </p>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────
   TAG NODE (NEW)
   ──────────────────────────────────────────── */
const TagNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => (n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
    );
  };

  return (
    <div className="w-64 bg-white border border-indigo-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle type="target" position={Position.Left} className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-white" />
      
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex items-center gap-2 text-indigo-700">
          <Tag size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">Add Tag</span>
        </div>
        <button onClick={() => deleteElements({ nodes: [{ id }] })} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="p-3 space-y-3">
        <p className="text-[10px] text-gray-500 leading-tight px-1">
          Connect a button to this node to add the user to the selected tag.
        </p>

        <div className="space-y-2">
          <div className="relative">
            <select 
              value={data.tagName || ""} 
              onChange={(e) => updateNode({ tagName: e.target.value })} 
              className="w-full pl-3 pr-8 py-2.5 bg-white border border-indigo-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 shadow-sm appearance-none cursor-pointer"
            >
              <option value="" disabled>Select a Tag...</option>
              {EXISTING_TAGS.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <Tag size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
          </div>
        </div>
        
        {data.tagName && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            <span className="text-xs font-semibold text-indigo-700">User will be added to:</span>
            <span className="text-xs font-bold text-indigo-900 bg-white px-2 py-0.5 rounded shadow-sm border border-indigo-200">{data.tagName}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const nodeTypes = { 
  trigger: TriggerNode, 
  message: MessageNode, 
  url_action: URLActionNode, 
  call_action: CallActionNode,
  tag_node: TagNode 
};

/* ────────────────────────────────────────────
   FLOW CANVAS
   ──────────────────────────────────────────── */
function FlowCanvas({ initialData, editId, onSave, onCancel }: { 
  initialData: Workflow; 
  editId: string | null; 
  onSave: (wf: any) => void; 
  onCancel: () => void;
}) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const initNodes: Node[] = [];
    const initEdges: Edge[] = [];

    initNodes.push({
      id: "trigger-node",
      type: "trigger",
      position: { x: -250, y: 100 },
      data: { triggers: initialData.triggers || [{ keyword: "", matchMode: "contains" }] },
      draggable: true,
    });

    Object.values(initialData.steps || {}).forEach((step) => {
      initNodes.push({
        id: step.id,
        type: step.stepType || "message",
        position: step.position || { x: Math.random() * 400, y: Math.random() * 400 },
        data: { 
          message: step.message, 
          buttons: step.buttons,
          mediaUrl: step.mediaUrl || null,
          mediaType: step.mediaType || null,
          urlLabel: step.urlLabel,
          url: step.url,
          phoneNumber: step.phoneNumber,
          tagName: step.tagName || null
        },
        draggable: true,
      });
    });

    if (initialData.rootStepId) {
      initEdges.push({ 
        id: "e-trigger-root", 
        source: "trigger-node", 
        target: initialData.rootStepId, 
        animated: true, type: "default", 
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
        style: { stroke: '#10b981', strokeWidth: 2 }
      });
    }

    Object.values(initialData.steps || {}).forEach((step) => {
      step.buttons.forEach((btn) => {
        if (btn.nextStepId) {
          initEdges.push({
            id: `e-${step.id}-${btn.id}`,
            source: step.id, sourceHandle: btn.id, target: btn.nextStepId,
            animated: true, type: "default", 
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
            style: { stroke: '#3b82f6', strokeWidth: 2 }
          });
        }
      });
    });

    setNodes(initNodes);
    setEdges(initEdges);
  }, [initialData]);

  const onConnect = useCallback((params: Connection) => {
    if (params.source === "trigger-node") {
      setEdges((eds) => eds.filter((e) => e.source !== "trigger-node").concat(addEdge({ ...params, animated: true, type: "default", style: { stroke: '#10b981', strokeWidth: 2 } }, eds)));
    } else {
      // Connection Logic: Check if target is a Tag Node
      const targetNode = nodes.find(n => n.id === params.target);
      const isTagTarget = targetNode?.type === 'tag_node';

      setEdges((eds) => {
        let filtered = eds;
        
        if (!isTagTarget) {
          // Standard Node: Replace existing connection (1-to-1 flow)
          filtered = eds.filter((e) => !(e.source === params.source && e.sourceHandle === params.sourceHandle));
        } else {
          // Tag Node: Do NOT filter existing connections (Add to tag + Continue flow)
          // But prevent duplicate exact edges
          const exists = eds.some(e => 
            e.source === params.source && 
            e.sourceHandle === params.sourceHandle && 
            e.target === params.target
          );
          if (exists) return eds;
        }

        return addEdge({ ...params, animated: true, type: "default", style: { stroke: '#3b82f6', strokeWidth: 2 } }, filtered);
      });
    }
  }, [setEdges, nodes]);

  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEdges((eds) => eds.filter((e) => e.id !== edge.id));
  }, [setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow");
    if (!type) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    
    let newData: any = { message: "" };
    if (type === "message") newData = { message: "", buttons: [], mediaUrl: null, mediaType: null };
    if (type === "url_action") newData = { message: "", urlLabel: "", url: "" };
    if (type === "call_action") newData = { message: "", urlLabel: "", phoneNumber: "" };
    if (type === "tag_node") newData = { tagName: "" }; // Initialize Tag Node

    const newNode = { id: uid(), type, position, data: newData };
    setNodes((nds) => nds.concat(newNode));
  }, [screenToFlowPosition, setNodes]);

  const formatLayout = () => {
    const newNodes = [...nodes];
    const triggerNode = newNodes.find(n => n.id === "trigger-node");
    if (triggerNode) triggerNode.position = { x: 0, y: 0 };

    const rootEdge = edges.find(e => e.source === "trigger-node");
    if (!rootEdge) return;

    const visited = new Set<string>();
    const layoutStep = (nodeId: string, x: number, y: number, depth: number = 0) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = newNodes.find(n => n.id === nodeId);
      if (!node) return;
      node.position = { x, y };

      const childEdges = edges.filter(e => e.source === nodeId);
      const spacingY = 300;
      const startY = y - ((childEdges.length - 1) * spacingY) / 2;

      childEdges.forEach((edge, i) => layoutStep(edge.target, x + 350, startY + i * spacingY, depth + 1));
    };

    layoutStep(rootEdge.target, 350, 0);
    setNodes(newNodes);
  };

  const handleSave = () => {
    const triggers = nodes.find(n => n.id === "trigger-node")?.data?.triggers || [];
    const cleanTriggers = triggers.filter((t: Trigger) => t.keyword.trim());
    
    const steps: Record<string, Step> = {};
    nodes.filter(n => n.type === "message" || n.type === "url_action" || n.type === "call_action" || n.type === "tag_node").forEach(n => {
      const buttonsWithLinks = n.data.buttons ? n.data.buttons.map((btn: Button) => {
        const btnEdges = edges.filter(e => e.source === n.id && e.sourceHandle === btn.id);
        const flowEdge = btnEdges.find(e => {
           const target = nodes.find(node => node.id === e.target);
           return target?.type !== 'tag_node';
        });
        return { 
          ...btn, 
          nextStepId: flowEdge ? flowEdge.target : null 
        };
      }) : [];

      const stepType = n.type as "message" | "url_action" | "call_action" | "tag_node" | undefined;

      steps[n.id] = {
        id: n.id,
        stepType,
        message: n.data.message, 
        buttons: buttonsWithLinks, 
        position: n.position,
        mediaUrl: n.data.mediaUrl,
        mediaType: n.data.mediaType,
        urlLabel: n.data.urlLabel,
        url: n.data.url,
        phoneNumber: n.data.phoneNumber,
        tagName: n.data.tagName
      };
    });

    const rootEdge = edges.find(e => e.source === "trigger-node");
    const rootStepId = rootEdge ? rootEdge.target : null;

    if (cleanTriggers.length === 0 || !rootStepId || !steps[rootStepId]?.message.trim()) {
      alert("Need at least one trigger and a valid root message.");
      return;
    }

    onSave({ _id: editId || "", triggers: cleanTriggers, steps, rootStepId });
  };

  return (
    <div className={`overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
        isFullScreen ? 'fixed inset-0 z-50 bg-white h-screen w-screen' : 'bg-white rounded-2xl border border-gray-200 shadow-sm relative h-[80vh]'
      }`}
    >
      <div className="p-3 border-b border-gray-100 bg-white z-30 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${editId ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
            <WorkflowIcon size={16} />
          </div>
          <h2 className="text-sm font-bold text-gray-900">{editId ? "Edit Workflow" : "New Workflow"}</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={formatLayout} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
            <Layout size={14} /> Format
          </button>
          {editId && (
            <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors hidden sm:block">
              Cancel
            </button>
          )}
          <button onClick={() => setIsFullScreen(!isFullScreen)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-gray-200">
            {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* MOBILE TOP BAR (Horizontal Scroll) */}
      <div className="md:hidden w-full border-b border-gray-200 bg-white p-2 flex gap-2 overflow-x-auto whitespace-nowrap shrink-0 z-20 shadow-sm no-scrollbar">
        <div 
          onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "message")} 
          draggable 
          className="min-w-[120px] flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:border-emerald-400 hover:shadow-sm transition-all"
        >
          <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <MessageSquare size={12} />
          </div>
          <span className="text-xs font-medium text-gray-700">Message</span>
        </div>

        <div 
          onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "url_action")} 
          draggable 
          className="min-w-[120px] flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:border-purple-400 hover:shadow-sm transition-all"
        >
          <div className="w-6 h-6 rounded bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
            <LinkIcon size={12} />
          </div>
          <span className="text-xs font-medium text-gray-700">URL</span>
        </div>

        <div 
          onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "call_action")} 
          draggable 
          className="min-w-[120px] flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:border-rose-400 hover:shadow-sm transition-all"
        >
          <div className="w-6 h-6 rounded bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <PhoneCall size={12} />
          </div>
          <span className="text-xs font-medium text-gray-700">Call</span>
        </div>

        <div 
          onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "tag_node")} 
          draggable 
          className="min-w-[120px] flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-grab active:cursor-grabbing hover:border-indigo-400 hover:shadow-sm transition-all"
        >
          <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Tag size={12} />
          </div>
          <span className="text-xs font-medium text-gray-700">Tag</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:flex flex-col w-48 border-r border-gray-200 bg-gray-50 p-3 space-y-3 overflow-y-auto shrink-0">
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nodes</h3>
            
            <div 
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "message")} 
              draggable 
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-emerald-400 hover:shadow-sm transition-all mb-2"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <MessageSquare size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Message</p>
                <p className="text-[10px] text-gray-400">Send text/media</p>
              </div>
            </div>
            
            <div 
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "url_action")} 
              draggable 
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-purple-400 hover:shadow-sm transition-all mb-2"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <LinkIcon size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">URL Button</p>
                <p className="text-[10px] text-gray-400">Open link on click</p>
              </div>
            </div>

            <div 
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "call_action")} 
              draggable 
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-rose-400 hover:shadow-sm transition-all mb-2"
            >
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                <PhoneCall size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Call Action</p>
                <p className="text-[10px] text-gray-400">Click to call number</p>
              </div>
            </div>

            <div 
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "tag_node")} 
              draggable 
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-indigo-400 hover:shadow-sm transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Tag size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Add Tag</p>
                <p className="text-[10px] text-gray-400">Label user</p>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-gray-400 leading-relaxed pt-2 border-t border-gray-200">
            <p>💡 <strong>Tip:</strong> Drag nodes onto the canvas. Draw wires by dragging from the dots.</p>
            <p className="mt-2">🗑️ <strong>Delete wire:</strong> Double-click the wire.</p>
            <p className="mt-2">🔗 <strong>Links:</strong> Select &quot;Link&quot; in the media dropdown to send URLs (Insta, YT, etc.).</p>
          </div>
        </div>

        {/* Canvas Area */}
        <div ref={reactFlowWrapper} className="flex-1 h-full w-full bg-gray-50/80 bg-dots">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={nodeTypes} onEdgeDoubleClick={onEdgeDoubleClick}
            fitView deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background gap={16} size={1} color="#e5e7eb" />
            <Controls className="!bg-white !border !border-gray-200 !shadow-lg !rounded-lg" />
            <MiniMap className="!bg-white !border !border-gray-200" nodeColor={(n) => (n.type === 'trigger' ? '#f59e0b' : n.type === 'url_action' ? '#a855f7' : n.type === 'call_action' ? '#f43f5e' : n.type === 'tag_node' ? '#6366f1' : '#10b981')} />
          </ReactFlow>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-30">
        <button onClick={handleSave} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 hover:shadow-xl hover:scale-105">
          {editId ? "Update Workflow" : "Create Workflow"}
        </button>
      </div>
    </div>
  );
}

function WorkflowForm({ editId, initialData, onSave, onCancel }: { editId: string | null; initialData: Workflow; onSave: (wf: Workflow) => void; onCancel: () => void }) {
  return (
    <ReactFlowProvider>
      <FlowCanvas initialData={initialData} editId={editId} onSave={onSave} onCancel={onCancel} />
    </ReactFlowProvider>
  );
}

function WorkflowCard({ wf, onEdit, onDelete }: { wf: Workflow; onEdit: (wf: Workflow) => void; onDelete: (id: string) => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rootStep = wf.steps[wf.rootStepId];

  return (
    <div className="group bg-white rounded-2xl border border-gray-200 hover:border-emerald-200 hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer" onClick={() => onEdit(wf)}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[11px] text-amber-700 font-bold uppercase tracking-wider mr-1">Triggers:</span>
              {wf.triggers.map((t, i) => (
                <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                  t.matchMode === "exact" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-amber-50 border-amber-200 text-amber-700"
                }`}>
                  {t.matchMode === "exact" ? <Crosshair size={10} /> : <Zap size={10} />} 
                  {t.keyword}
                </span>
              ))}
            </div>
            {rootStep && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <MessageSquare size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">{rootStep.message || "No message set"}</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {rootStep.mediaUrl && (
                    <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-[10px] font-semibold text-gray-600 flex items-center gap-1 capitalize">
                      {rootStep.mediaType === "link" ? <LinkIcon size={8} /> : <FileText size={8} />} {rootStep.mediaType}
                    </span>
                  )}
                  {rootStep.buttons.map(b => (
                    <span key={b.id} className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-[10px] font-semibold text-blue-700 flex items-center gap-1">
                      <MousePointerClick size={8} /> {b.label || "Button"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={() => { onDelete(wf._id); setConfirmDelete(false); }} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600">Confirm</button>
                <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Workflow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => setToast({ message, type });

  const getEmptyWorkflow = useCallback((): Workflow => {
    const rootId = uid();
    return {
      _id: "new",
      triggers: [{ keyword: "", matchMode: "contains" }],
      steps: { [rootId]: { id: rootId, stepType: "message", message: "", buttons: [], mediaUrl: null, mediaType: null } },
      rootStepId: rootId,
    };
  }, []);

  const normalizeWorkflow = (wf: any): Workflow => {
    if (wf.steps && wf.rootStepId) {
      return {
        ...wf,
        triggers: wf.triggers.map((t: any) => typeof t === 'string' 
          ? { keyword: t, matchMode: "contains" } 
          : { keyword: t.keyword, matchMode: t.matchMode || "contains" }
        )
      };
    }
    const rootId = uid();
    const actions = wf.actions || [];
    return {
      ...wf,
      triggers: (wf.triggers || [{ keyword: wf.trigger?.keyword || "" }]).map((t: any) => typeof t === 'string' ? { keyword: t, matchMode: "contains" } : { keyword: t.keyword, matchMode: t.matchMode || "contains" }),
      steps: { [rootId]: { id: rootId, stepType: "message", message: actions[0]?.message || "", buttons: [], mediaUrl: null, mediaType: null } },
      rootStepId: rootId,
    };
  };

  const load = async () => {
    try {
      const res = await fetch("/api/workflow");
      if (res.status === 401) { window.location.href = "/signin"; return; }
      const data = await res.json();
      setWorkflows((data.workflows || []).map(normalizeWorkflow));
    } catch { showToast("Failed to load workflows", "error"); }
  };

  useEffect(() => {
    if (status === "authenticated") load();
    else if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  const startCreating = () => {
    setEditId("new");
    setEditData(getEmptyWorkflow());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (wfData: Workflow) => {
    try {
      const payload = { triggers: wfData.triggers, steps: wfData.steps, rootStepId: wfData.rootStepId };
      if (editId && editId !== "new") {
        await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, ...payload }) });
        showToast("Workflow updated!");
      } else {
        await fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        showToast("Workflow created!");
      }
      setEditId(null); setEditData(null); load();
    } catch { showToast("Something went wrong", "error"); }
  };

  const remove = async (id: string) => {
    try { await fetch(`/api/workflow/${id}`, { method: "DELETE" }); setWorkflows(prev => prev.filter(wf => wf._id !== id)); showToast("Deleted"); } catch { showToast("Delete failed", "error"); }
  };

  const edit = (wf: Workflow) => {
    setEditId(wf._id); setEditData(wf);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => { setEditId(null); setEditData(null); };

  const filteredWorkflows = workflows.filter(wf => wf.triggers.some(t => t.keyword.toLowerCase().includes(searchQuery.toLowerCase())) || Object.values(wf.steps).some(s => s.message.toLowerCase().includes(searchQuery.toLowerCase())));

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  return (
    <>
    <Sidebar/>
    <main className="min-h-screen bg-slate-50 pb-20 ml-50">
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your automated WhatsApp sequences</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <input 
                type="text" 
                placeholder="Search workflows..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>
            <button 
              onClick={startCreating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95"
            >
              <Plus size={18} /> New Workflow
            </button>
          </div>
        </div>

        {/* Editor Area */}
        {editId && editData ? (
          <WorkflowForm editId={editId} initialData={editData} onSave={save} onCancel={cancelEdit} />
        ) : (
          /* Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.length === 0 ? (
              <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-gray-200 rounded-3xl">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                  <WorkflowIcon size={32} className="text-gray-300" />
                </div>
                <h3 className="text-gray-900 font-semibold text-lg">No workflows found</h3>
                <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">Get started by creating your first automated response flow.</p>
                <button onClick={startCreating} className="mt-6 px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors">
                  Create Workflow
                </button>
              </div>
            ) : (
              filteredWorkflows.map((wf) => (
                <WorkflowCard key={wf._id} wf={wf} onEdit={edit} onDelete={remove} />
              ))
            )}
          </div>
        )}
      </div>
    </main>
    </>
  );
}
