/* ============================================================================
   WORKFLOW BUILDER - FRONTEND
   ----------------------------------------------------------------------------
   Visual canvas for building WhatsApp auto-reply workflows.
   
   Key Features:
   - Message Nodes, URL/Call Actions, Tags, Opt-in, Forms.
   - Delay Node: Pauses workflow execution.
   - Inactivity Node (NEW): Ambient timer that triggers a reminder message 
     if the user doesn't click a button within X seconds. No connection 
     points needed; works globally on the canvas.
   ============================================================================ */

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

// UI Icons
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
  Tag as TagIcon,
  UserPlus,
  ClipboardList,
  List,
  Clock,
  Hourglass, // Added for Inactivity Node
} from "lucide-react";

// Authentication
import { useSession } from "next-auth/react";

/* ============================================================================
   1. TYPES & INTERFACES
   ============================================================================ */
type Trigger = {
  keyword: string;
  matchMode: "exact" | "contains";
};

type Button = {
  id: string;
  label: string;
  nextStepId: string | null;
  tagNodeId?: string | null;
  applyTagId?: string | null;
  optInNodeId?: string | null;
};

type Step = {
  id: string;
  stepType?:
    | "message"
    | "url_action"
    | "call_action"
    | "tag_node"
    | "opt_in_node"
    | "form_node"
    | "delay_node"
    | "inactivity_node"; // Added inactivity_node
  message: string;
  buttons: Button[];
  position?: { x: number; y: number };
  mediaType?: "image" | "video" | "document" | "audio" | "link" | null;
  mediaUrl?: string | null;
  urlLabel?: string;
  url?: string;
  phoneNumber?: string;
  selectedTag?: string | null;
  selectedForm?: string | null;
  listButtonText?: string;
  delaySeconds?: number;
  nextStepId?: string | null;
  repeatCount?: number; // Added for Inactivity Node
};

type Workflow = {
  _id: string;
  triggers: Trigger[];
  steps: Record<string, Step>;
  rootStepId: string;
};

/* ============================================================================
   2. UTILITY FUNCTIONS
   ============================================================================ */

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
      if (urlObj.pathname.includes("/embed/")) return url;
    }
  } catch (e) {
    return null;
  }
  return null;
};

/* ============================================================================
   3. TOAST NOTIFICATION COMPONENT
   ============================================================================ */
function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${
        type === "success"
          ? "bg-white border-emerald-200 text-emerald-700"
          : "bg-white border-red-200 text-red-700"
      }`}
    >
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center ${
          type === "success" ? "bg-emerald-100" : "bg-red-100"
        }`}
      >
        {type === "success" ? <Check size={14} /> : <X size={14} />}
      </span>
      {message}
    </div>
  );
}

/* ============================================================================
   4. REACT FLOW CUSTOM NODE COMPONENTS
   ============================================================================ */

/* --- Trigger Node (Starting Point) --- */
const TriggerNode = ({ data, id }: any) => {
  const { setNodes } = useReactFlow();

  const isAnyMessage =
    data.triggerMode === "any" ||
    (data.triggers?.length === 1 && data.triggers[0]?.keyword === "*");

  const handleModeChange = (mode: "keywords" | "any") => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id) {
          if (mode === "any") {
            return {
              ...n,
              data: {
                ...n.data,
                triggerMode: "any",
                triggers: [{ keyword: "*", matchMode: "exact" }],
              },
            };
          } else {
            return {
              ...n,
              data: {
                ...n.data,
                triggerMode: "keywords",
                triggers:
                  n.data.triggers[0]?.keyword === "*"
                    ? [{ keyword: "", matchMode: "contains" }]
                    : n.data.triggers,
              },
            };
          }
        }
        return n;
      })
    );
  };

  const handleTriggerChange = (
    index: number,
    val: string,
    mode?: "exact" | "contains"
  ) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id) {
          const newTriggers = [...data.triggers];
          newTriggers[index] = {
            keyword: val,
            matchMode: mode || newTriggers[index].matchMode || "contains",
          };
          return { ...n, data: { ...n.data, triggers: newTriggers } };
        }
        return n;
      })
    );
  };

  const addTrigger = () => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id)
          return {
            ...n,
            data: {
              ...n.data,
              triggers: [
                ...n.data.triggers,
                { keyword: "", matchMode: "contains" },
              ],
            },
          };
        return n;
      })
    );
  };

  const removeTrigger = (index: number) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) => {
        if (n.id === id)
          return {
            ...n,
            data: {
              ...n.data,
              triggers: n.data.triggers.filter(
                (_: any, i: number) => i !== index
              ),
            },
          };
        return n;
      })
    );
  };

  return (
    <div className="w-72 bg-white border border-amber-200 shadow-lg rounded-2xl overflow-hidden">
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-amber-50 to-white">
        <div className="flex items-center gap-2 text-amber-700">
          <Zap size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Triggers
          </span>
        </div>

        <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5 shrink-0">
          <button
            onClick={() => handleModeChange("keywords")}
            className={`p-1.5 rounded-md text-[10px] font-bold transition-all ${
              !isAnyMessage
                ? "bg-amber-500 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Keywords
          </button>
          <button
            onClick={() => handleModeChange("any")}
            className={`p-1.5 rounded-md text-[10px] font-bold transition-all ${
              isAnyMessage
                ? "bg-amber-500 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Any Msg
          </button>
        </div>
      </div>

      {isAnyMessage ? (
        <div className="p-4 text-center">
          <p className="text-xs text-amber-700 font-semibold bg-amber-50 p-3 rounded-lg border border-amber-100 flex items-center justify-center gap-2">
            <Zap size={12} /> Workflow will trigger on{" "}
            <strong>ANY</strong> incoming message.
          </p>
        </div>
      ) : (
        <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
          {data.triggers.map((trigger: Trigger, index: number) => (
            <div key={index} className="flex items-center gap-2 group">
              <div className="flex-1 relative min-w-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500">
                  <Zap size={14} />
                </span>
                <input
                  value={trigger.keyword}
                  onChange={(e) =>
                    handleTriggerChange(index, e.target.value)
                  }
                  placeholder="e.g. price"
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm text-gray-900 placeholder:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm"
                />
              </div>

              <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5 shrink-0">
                <button
                  onClick={() =>
                    handleTriggerChange(index, trigger.keyword, "contains")
                  }
                  className={`p-1.5 rounded-md ${
                    trigger.matchMode === "contains"
                      ? "bg-blue-500 text-white"
                      : "text-gray-400"
                  }`}
                >
                  <Type size={12} />
                </button>
                <button
                  onClick={() =>
                    handleTriggerChange(index, trigger.keyword, "exact")
                  }
                  className={`p-1.5 rounded-md ${
                    trigger.matchMode === "exact"
                      ? "bg-purple-500 text-white"
                      : "text-gray-400"
                  }`}
                >
                  <Crosshair size={12} />
                </button>
              </div>

              <button
                onClick={() => removeTrigger(index)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          <button
            onClick={addTrigger}
            className="w-full mt-2 py-1.5 border border-dashed border-amber-300 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1"
          >
            <Plus size={12} /> Add Trigger
          </button>
        </div>
      )}
    </div>
  );
};

/* --- Tag Action Node --- */
const TagNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tags")
      .then((res) => res.json())
      .then((data) => {
        setTags(data.tags || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateTag = (tagId: string) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id ? { ...n, data: { ...n.data, selectedTag: tagId } } : n
      )
    );
  };

  return (
    <div className="w-72 bg-white border border-indigo-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex items-center gap-2 text-indigo-700">
          <TagIcon size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Tag Action
          </span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[9px] text-gray-500 leading-tight">
          🏷️ Applies a tag to the user instantly when they click the connected
          button.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Loading tags from
            DB...
          </div>
        ) : (
          <select
            value={data.selectedTag || ""}
            onChange={(e) => updateTag(e.target.value)}
            className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          >
            <option value="">Select a tag...</option>
            {tags.map((tag: any) => (
              <option key={tag._id} value={tag._id}>
                {tag.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

/* --- Opt-In Action Node --- */
const OptInNode = ({ id }: any) => {
  const { deleteElements } = useReactFlow();

  return (
    <div className="w-72 bg-white border border-orange-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-orange-50 to-white">
        <div className="flex items-center gap-2 text-orange-700">
          <UserPlus size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Opt-in Action
          </span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[9px] text-gray-500 leading-tight">
          📝 Adds the user&apos;s phone number to the &quot;Opt-in
          Numbers&quot; list instantly when they click the connected button.
        </p>
      </div>
    </div>
  );
};

/* --- Form Action Node --- */
const FormNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forms")
      .then((res) => res.json())
      .then((data) => {
        setForms(data.forms || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateForm = (formId: string) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id
          ? { ...n, data: { ...n.data, selectedForm: formId } }
          : n
      )
    );
  };

  return (
    <div className="w-72 bg-white border border-teal-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-teal-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-teal-50 to-white">
        <div className="flex items-center gap-2 text-teal-700">
          <ClipboardList size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Form Action
          </span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[9px] text-gray-500 leading-tight">
          📝 Sends a link to a custom form for the user to fill out.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Loading forms...
          </div>
        ) : (
          <select
            value={data.selectedForm || ""}
            onChange={(e) => updateForm(e.target.value)}
            className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">Select a form...</option>
            {forms.map((f: any) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   DELAY NODE
   ============================================================================ */
const DelayNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateDelay = (val: string) => {
    const num = parseInt(val, 10);
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id ? { ...n, data: { ...n.data, delaySeconds: isNaN(num) ? 0 : num } } : n
      )
    );
  };

  return (
    <div className="w-72 bg-white border border-sky-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-sky-500 !w-3 !h-3 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="delay-out"
        className="!bg-sky-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-sky-50 to-white">
        <div className="flex items-center gap-2 text-sky-700">
          <Clock size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Delay Action
          </span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <p className="text-[9px] text-gray-500 leading-tight">
          ⏱️ Pauses the workflow for the specified duration before sending the next connected node.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            value={data.delaySeconds || 10}
            onChange={(e) => updateDelay(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
          />
          <span className="text-xs font-semibold text-gray-600">seconds</span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   INACTIVITY NODE (NEW)
   ----------------------------------------------------------------------------
   Acts as a global timer for the workflow. If the user receives a message 
   with buttons and doesn't reply within the set time, this node sends a 
   reminder message. It repeats based on the repeat count.
   ============================================================================ */
const InactivityNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
      )
    );
  };

  return (
    <div className="w-72 bg-white border border-fuchsia-200 shadow-lg rounded-2xl overflow-hidden group">
      {/* NO Handles! This is an ambient workflow rule, not a connected step */}
      
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-fuchsia-50 to-white">
        <div className="flex items-center gap-2 text-fuchsia-700">
          <Hourglass size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Inactivity Timer
          </span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <p className="text-[9px] text-gray-500 leading-tight bg-fuchsia-50 p-2 rounded-md border border-fuchsia-100">
          ⚠️ <strong>Auto-pilot:</strong> Do NOT connect this node. 
          If added to the canvas, it activates automatically when the user 
          doesn&apos;t click a button for the set time.
        </p>

        <textarea
          value={data.message}
          onChange={(e) => updateNode({ message: e.target.value })}
          placeholder="Message to send if user is inactive..."
          rows={3}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 focus:border-fuchsia-400 transition-all resize-none"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Time (Sec)
            </label>
            <input
              type="number"
              min="1"
              value={data.delaySeconds || 30}
              onChange={(e) => updateNode({ delaySeconds: parseInt(e.target.value, 10) || 30 })}
              className="w-full px-3 py-1.5 mt-1 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Repeat Count
            </label>
            <input
              type="number"
              min="1"
              max="5"
              value={data.repeatCount || 1}
              onChange={(e) => updateNode({ repeatCount: parseInt(e.target.value, 10) || 1 })}
              className="w-full px-3 py-1.5 mt-1 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   Message Node (Core Communication Step)
   ============================================================================ */
const MessageNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
      )
    );
  };

  const handleMsgChange = (msg: string) => updateNode({ message: msg });

  const addButton = () => {
    const newBtn: Button = { id: uid(), label: "", nextStepId: null };
    updateNode({ buttons: [...data.buttons, newBtn] });
  };

  const removeButton = (btnId: string) => {
    updateNode({
      buttons: data.buttons.filter((b: Button) => b.id !== btnId),
    });
  };

  const handleButtonLabelChange = (btnId: string, label: string) => {
    updateNode({
      buttons: data.buttons.map((b: Button) =>
        b.id === btnId ? { ...b, label } : b
      ),
    });
  };

  const isListMode = data.buttons && data.buttons.length > 3;
  const charLimit = isListMode ? 24 : 20;

  const maxSizes: Record<string, number> = {
    image: 2 * 1024 * 1024,
    video: 10 * 1024 * 1024,
    audio: 10 * 1024 * 1024,
    document: 20 * 1024 * 1024,
  };

  const allowedTypes: Record<string, string[]> = {
    image: ["image/jpeg", "image/png", "image/webp"],
    video: ["video/mp4", "video/3gpp"],
    audio: ["audio/mpeg", "audio/aac", "audio/ogg", "audio/amr"],
    document: [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
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
      alert(
        `File is too large. Max size for ${mediaType} is ${maxSizes[mediaType] / (1024 * 1024)}MB.`
      );
      return;
    }

    updateNode({ mediaUrl: "UPLOADING...", mediaType });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
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

  const ytEmbedUrl =
    data.mediaType === "link" && data.mediaUrl
      ? getYouTubeEmbedUrl(data.mediaUrl)
      : null;

  return (
    <div className="w-72 bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-white">
        <div className="flex items-center gap-2 text-emerald-700">
          <MessageSquare size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Message Step
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isListMode && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 border border-purple-300 rounded-full text-[9px] font-bold text-purple-700">
              <List size={9} /> List Mode
            </span>
          )}
          <button
            onClick={() => deleteElements({ nodes: [{ id }] })}
            className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isListMode && (
        <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
          <p className="text-[9px] text-purple-700 leading-tight flex items-start gap-1.5">
            <List size={10} className="shrink-0 mt-0.5" />
            <span>
              <strong>{data.buttons.length} buttons</strong> will be sent as a{" "}
              <strong>List Menu</strong> on WhatsApp. Users tap &quot;{data.listButtonText || "Options"}&quot; to see all options.
              Row titles limited to <strong>24 chars</strong>.
            </span>
          </p>
        </div>
      )}

      {data.mediaUrl && (
        <div
          className="relative border-b border-gray-100 cursor-pointer group/media bg-gray-50 p-2"
          onClick={() => updateNode({ mediaUrl: null, mediaType: null })}
          title="Click to remove media"
        >
          {data.mediaUrl.startsWith("http") || data.mediaType === "link" ? (
            <>
              {data.mediaType === "image" && (
                <img src={data.mediaUrl} alt="Media" className="w-full h-32 object-cover" />
              )}
              {data.mediaType === "video" && (
                <video src={data.mediaUrl} className="w-full h-32 object-cover" controls />
              )}
              {data.mediaType === "audio" && (
                <audio src={data.mediaUrl} controls className="w-full mt-2" />
              )}
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
                      <span className="absolute top-1 right-1 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                        YouTube Preview (Click to remove)
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full p-2 border border-gray-200 rounded-lg bg-white shadow-sm">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${data.mediaUrl}&sz=64`}
                        alt="favicon"
                        className="w-10 h-10 rounded-md bg-gray-50 border border-gray-200 object-contain p-1"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://placehold.co/40x40/e5e7eb/9ca3af?text=Link`;
                        }}
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
                {data.mediaUrl === "UPLOADING..."
                  ? "Uploading to WhatsApp..."
                  : `${data.mediaType?.toUpperCase()} Uploaded (Click to remove)`}
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
                  <LinkIcon
                    size={12}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder={
                      data.mediaType === "link"
                        ? "Paste URL (YouTube, Insta, FB)"
                        : "Paste Public URL (Recommended)"
                    }
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
                    🔗 WhatsApp will automatically generate a rich preview
                    (thumbnail/video) for valid social media links.
                  </p>
                ) : (
                  <>
                    <p className="text-[9px] text-emerald-600 leading-tight mt-1 px-1">
                      ✅ URL is recommended (never expires).
                    </p>
                    <p className="text-[9px] text-amber-600 leading-tight px-1">
                      ⚠️ Uploaded files expire on WhatsApp servers after 30 days
                      and must be re-uploaded.
                    </p>
                  </>
                )}

                {showLibrary && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="sticky top-0 bg-white p-1 border-b border-gray-100 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 px-1">
                        Select Existing Media
                      </span>
                      <button
                        onClick={() => setShowLibrary(false)}
                        className="text-gray-400 hover:text-red-500 p-0.5"
                      >
                        <X size={10} />
                      </button>
                    </div>
                    {libraryItems.length === 0 && (
                      <div className="p-2 text-[10px] text-gray-400 text-center">
                        No media uploaded yet.
                      </div>
                    )}
                    {libraryItems.map((item) => (
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

        {isListMode && (
          <div className="space-y-1">
            <div className="relative">
              <List
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500"
              />
              <input
                value={data.listButtonText || ""}
                onChange={(e) => updateNode({ listButtonText: e.target.value })}
                placeholder='List button text (e.g. "Select an option")'
                maxLength={20}
                className="w-full pl-8 pr-2 py-2 text-xs border border-purple-200 rounded-lg focus:outline-none focus:border-purple-400 shadow-sm bg-purple-50/50 text-gray-800 placeholder:text-purple-300"
              />
            </div>
            <p className="text-[9px] text-purple-500 px-1">
              This is the button text users tap to open the list. Max 20 chars.
              Defaults to &quot;Options&quot;.
            </p>
          </div>
        )}

        <div className="space-y-2 relative">
          {data.buttons.map((btn: Button) => (
            <div
              key={btn.id}
              className={`border rounded-xl p-2.5 space-y-1 group/btn relative ${
                isListMode ? "bg-purple-50/50 border-purple-200" : "bg-blue-50/50 border-blue-200"
              }`}
            >
              <Handle
                type="source"
                position={Position.Right}
                id={btn.id}
                style={{ top: "50%", right: "-12px" }}
                className={`!w-3 !h-3 !border-2 !border-white ${
                  isListMode ? "!bg-purple-500" : "!bg-blue-500"
                }`}
              />
              <div className="flex items-center gap-2">
                <MousePointerClick
                  size={14}
                  className={isListMode ? "text-purple-500" : "text-blue-500"}
                  style={{ flexShrink: 0 }}
                />
                <input
                  value={btn.label}
                  onChange={(e) => handleButtonLabelChange(btn.id, e.target.value)}
                  placeholder={isListMode ? "List item text" : "Button Text"}
                  maxLength={charLimit}
                  className={`flex-1 min-w-0 bg-white border rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none shadow-sm ${
                    isListMode ? "border-purple-200 focus:border-purple-400" : "border-blue-200 focus:border-blue-400"
                  }`}
                />
                <span
                  className={`text-[9px] font-mono shrink-0 ${
                    btn.label.length > charLimit ? "text-red-500" : "text-gray-300"
                  }`}
                >
                  {btn.label.length}/{charLimit}
                </span>
                <button
                  onClick={() => removeButton(btn.id)}
                  className="opacity-0 group-hover/btn:opacity-100 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addButton}
            className={`w-full py-2 border border-dashed rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              isListMode
                ? "border-purple-300 text-purple-500 hover:bg-purple-50 bg-purple-50/30"
                : "border-blue-300 text-blue-500 hover:bg-blue-50 bg-blue-50/30"
            }`}
          >
            <Plus size={12} /> Add Button
            {isListMode ? " (List Item)" : ""}
          </button>

          <p className="text-[9px] text-gray-400 leading-tight px-1">
            {isListMode ? (
              <>
                📋 <strong>List Mode active:</strong> These will appear as
                selectable items in a WhatsApp list menu.
              </>
            ) : (
              <>
                💡 Add more than 3 buttons to automatically switch to WhatsApp
                List Mode.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

/* --- URL Action Node --- */
const URLActionNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
      )
    );
  };

  return (
    <div className="w-72 bg-white border border-purple-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-purple-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center gap-2 text-purple-700">
          <LinkIcon size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">URL Action</span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
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
            <MousePointerClick
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-500"
            />
            <input
              value={data.urlLabel || ""}
              onChange={(e) => updateNode({ urlLabel: e.target.value })}
              placeholder="Button Text (e.g. Visit Site)"
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-purple-200 rounded-lg focus:outline-none focus:border-purple-400 shadow-sm bg-white text-gray-800"
            />
          </div>
          <div className="relative">
            <LinkIcon
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-500"
            />
            <input
              value={data.url || ""}
              onChange={(e) => updateNode({ url: e.target.value })}
              placeholder="https://example.com"
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-purple-200 rounded-lg focus:outline-none focus:border-purple-400 shadow-sm bg-white text-gray-800"
            />
          </div>
        </div>

        <p className="text-[9px] text-gray-500 leading-tight px-1">
          🔗 Clicking this button on WhatsApp will automatically open the URL in
          the user&apos;s browser.
        </p>
      </div>
    </div>
  );
};

/* --- Call Action Node --- */
const CallActionNode = ({ data, id }: any) => {
  const { setNodes, deleteElements } = useReactFlow();

  const updateNode = (newData: any) => {
    setNodes((nds: Node[]) =>
      nds.map((n: Node) =>
        n.id === id ? { ...n, data: { ...n.data, ...newData } } : n
      )
    );
  };

  return (
    <div className="w-72 bg-white border border-rose-200 shadow-lg rounded-2xl overflow-hidden group">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
      />

      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-rose-50 to-white">
        <div className="flex items-center gap-2 text-rose-700">
          <PhoneCall size={14} />
          <span className="text-xs font-bold uppercase tracking-wider">Call Action</span>
        </div>
        <button
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
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
          <div className="relative">
            <MousePointerClick
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500"
            />
            <input
              value={data.urlLabel || ""}
              onChange={(e) => updateNode({ urlLabel: e.target.value })}
              placeholder="Button Text (e.g. Call Support)"
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-rose-200 rounded-lg focus:outline-none focus:border-rose-400 shadow-sm bg-white text-gray-800"
            />
          </div>

          <div className="relative">
            <PhoneCall
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-500"
            />
            <input
              value={data.phoneNumber || ""}
              onChange={(e) => updateNode({ phoneNumber: e.target.value })}
              placeholder="Format: +1234567890 (with code)"
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-rose-200 rounded-lg focus:outline-none focus:border-rose-400 shadow-sm bg-white text-gray-800"
            />
          </div>
        </div>

        <p className="text-[9px] text-gray-500 leading-tight px-1">
          📞 Sends a clean WhatsApp button. Clicking it instantly opens the
          phone&apos;s native dialer with the number filled in.
        </p>
      </div>
    </div>
  );
};

// Registry of all custom node types for React Flow
const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  url_action: URLActionNode,
  call_action: CallActionNode,
  tag_node: TagNode,
  opt_in_node: OptInNode,
  form_node: FormNode,
  delay_node: DelayNode,
  inactivity_node: InactivityNode, // Registered new Inactivity Node
};

/* ============================================================================
   5. FLOW CANVAS COMPONENT
   ============================================================================ */
function FlowCanvas({
  initialData,
  editId,
  onSave,
  onCancel,
}: {
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

  // Initialize nodes and edges when workflow data changes
  useEffect(() => {
    const initNodes: Node[] = [];
    const initEdges: Edge[] = [];

    const initTriggers = initialData.triggers || [
      { keyword: "", matchMode: "contains" },
    ];
    const isAnyMessage =
      initTriggers.length === 1 && initTriggers[0].keyword === "*";

    initNodes.push({
      id: "trigger-node",
      type: "trigger",
      position: { x: -250, y: 100 },
      data: {
        triggers: initTriggers,
        triggerMode: isAnyMessage ? "any" : "keywords",
      },
      draggable: true,
    });

    Object.values(initialData.steps || {}).forEach((step) => {
      initNodes.push({
        id: step.id,
        type: step.stepType || "message",
        position: step.position || {
          x: Math.random() * 400,
          y: Math.random() * 400,
        },
        data: {
          message: step.message,
          buttons: step.buttons,
          mediaUrl: step.mediaUrl || null,
          mediaType: step.mediaType || null,
          urlLabel: step.urlLabel,
          url: step.url,
          phoneNumber: step.phoneNumber,
          selectedTag: step.selectedTag || null,
          selectedForm: step.selectedForm || null,
          listButtonText: step.listButtonText || "",
          delaySeconds: step.delaySeconds || (step.stepType === "inactivity_node" ? 30 : 10),
          repeatCount: step.repeatCount || 1, // Load repeat count
        },
        draggable: true,
      });
    });

    if (initialData.rootStepId) {
      initEdges.push({
        id: "e-trigger-root",
        source: "trigger-node",
        target: initialData.rootStepId,
        animated: true,
        type: "default",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
        style: { stroke: "#10b981", strokeWidth: 2 },
      });
    }

    Object.values(initialData.steps || {}).forEach((step) => {
      step.buttons.forEach((btn) => {
        if (btn.nextStepId) {
          initEdges.push({
            id: `e-${step.id}-${btn.id}`,
            source: step.id,
            sourceHandle: btn.id,
            target: btn.nextStepId,
            animated: true,
            type: "default",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
            style: { stroke: "#3b82f6", strokeWidth: 2 },
          });
        }
        if (btn.tagNodeId) {
          initEdges.push({
            id: `e-${step.id}-${btn.id}-tag`,
            source: step.id,
            sourceHandle: btn.id,
            target: btn.tagNodeId,
            animated: true,
            type: "default",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
            style: { stroke: "#6366f1", strokeWidth: 2 },
          });
        }
        if (btn.optInNodeId) {
          initEdges.push({
            id: `e-${step.id}-${btn.id}-optin`,
            source: step.id,
            sourceHandle: btn.id,
            target: btn.optInNodeId,
            animated: true,
            type: "default",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#f97316" },
            style: { stroke: "#f97316", strokeWidth: 2 },
          });
        }
      });

      if (step.stepType === "delay_node" && step.nextStepId) {
        initEdges.push({
          id: `e-${step.id}-delay-out`,
          source: step.id,
          sourceHandle: "delay-out",
          target: step.nextStepId,
          animated: true,
          type: "default",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#0ea5e9" },
          style: { stroke: "#0ea5e9", strokeWidth: 2 },
        });
      }
    });

    setNodes(initNodes);
    setEdges(initEdges);
  }, [initialData]);

  const onConnect = useCallback(
    (params: Connection) => {
      const getEdgeCategory = (type: string | undefined) => {
        if (type === "tag_node") return "tag";
        if (type === "opt_in_node") return "opt_in";
        if (type === "form_node") return "flow";
        return "flow";
      };

      const targetNode = nodes.find((n) => n.id === params.target);
      const targetCategory = getEdgeCategory(targetNode?.type);

      if (params.source === "trigger-node") {
        setEdges((eds) =>
          eds
            .filter((e) => e.source !== "trigger-node")
            .concat(
              addEdge(
                {
                  ...params,
                  animated: true,
                  type: "default",
                  style: { stroke: "#10b981", strokeWidth: 2 },
                },
                eds
              )
            )
        );
      } else {
        setEdges((eds) => {
          const filtered = eds.filter((e) => {
            if (e.source === params.source && e.sourceHandle === params.sourceHandle) {
              const existingTarget = nodes.find((n) => n.id === e.target);
              const existingCategory = getEdgeCategory(existingTarget?.type);
              return existingCategory !== targetCategory;
            }
            return true;
          });

          let strokeColor = "#3b82f6";
          if (targetCategory === "tag") strokeColor = "#6366f1";
          if (targetCategory === "opt_in") strokeColor = "#f97316";
          if (targetCategory === "flow" && targetNode?.type === "form_node")
            strokeColor = "#14b8a6";
          if (targetCategory === "flow" && targetNode?.type === "delay_node")
            strokeColor = "#0ea5e9";

          return addEdge(
            {
              ...params,
              animated: true,
              type: "default",
              style: { stroke: strokeColor, strokeWidth: 2 },
            },
            filtered
          );
        });
      }
    },
    [nodes, setEdges]
  );

  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let newData: any = { message: "" };
      if (type === "message")
        newData = {
          message: "",
          buttons: [],
          mediaUrl: null,
          mediaType: null,
          listButtonText: "",
        };
      if (type === "url_action")
        newData = { message: "", urlLabel: "", url: "" };
      if (type === "call_action")
        newData = { message: "", urlLabel: "", phoneNumber: "" };
      if (type === "tag_node") newData = { selectedTag: "" };
      if (type === "opt_in_node") newData = {};
      if (type === "form_node") newData = { selectedForm: "" };
      if (type === "delay_node") newData = { delaySeconds: 10 };
      
      // Default data for Inactivity Node
      if (type === "inactivity_node") {
        newData = {
          message: "Hey! We noticed you haven't responded. Are you still there? Let us know if you need any help! 🙂",
          delaySeconds: 30,
          repeatCount: 1,
        };
      }

      const newNode = { id: uid(), type, position, data: newData };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const handleQuickAdd = (type: string) => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const position = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });

    let newData: any = { message: "" };
    if (type === "message")
      newData = {
        message: "",
        buttons: [],
        mediaUrl: null,
        mediaType: null,
        listButtonText: "",
      };
    if (type === "url_action")
      newData = { message: "", urlLabel: "", url: "" };
    if (type === "call_action")
      newData = { message: "", urlLabel: "", phoneNumber: "" };
    if (type === "tag_node") newData = { selectedTag: "" };
    if (type === "opt_in_node") newData = {};
    if (type === "form_node") newData = { selectedForm: "" };
    if (type === "delay_node") newData = { delaySeconds: 10 };
    
    if (type === "inactivity_node") {
      newData = {
        message: "Hey! We noticed you haven't responded. Are you still there? Let us know if you need any help! 🙂",
        delaySeconds: 30,
        repeatCount: 1,
      };
    }

    const newNode = { id: uid(), type, position, data: newData };
    setNodes((nds) => nds.concat(newNode));
  };

  const formatLayout = () => {
    const newNodes = [...nodes];
    const triggerNode = newNodes.find((n) => n.id === "trigger-node");
    if (triggerNode) triggerNode.position = { x: 0, y: 0 };

    const rootEdge = edges.find((e) => e.source === "trigger-node");
    if (!rootEdge) return;

    const visited = new Set<string>();
    const layoutStep = (
      nodeId: string,
      x: number,
      y: number,
      depth: number = 0
    ) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = newNodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.position = { x, y };

      const childEdges = edges.filter((e) => e.source === nodeId);
      const spacingY = 300;
      const startY = y - ((childEdges.length - 1) * spacingY) / 2;

      childEdges.forEach((edge, i) =>
        layoutStep(edge.target, x + 350, startY + i * spacingY, depth + 1)
      );
    };

    layoutStep(rootEdge.target, 350, 0);
    setNodes(newNodes);
  };

  const handleSave = () => {
    const triggers =
      nodes.find((n) => n.id === "trigger-node")?.data?.triggers || [];
    const cleanTriggers = triggers.filter((t: Trigger) => t.keyword.trim());

    const steps: Record<string, Step> = {};

    nodes
      .filter(
        (n) =>
          n.type === "message" ||
          n.type === "url_action" ||
          n.type === "call_action" ||
          n.type === "tag_node" ||
          n.type === "opt_in_node" ||
          n.type === "form_node" ||
          n.type === "delay_node" ||
          n.type === "inactivity_node" // Save inactivity node config
      )
      .forEach((n) => {
        const buttonsWithLinks = n.data.buttons
          ? n.data.buttons.map((btn: Button) => {
              const targetEdge = edges.find((e) => {
                if (e.source !== n.id || e.sourceHandle !== btn.id) return false;
                const targetNode = nodes.find((node) => node.id === e.target);
                return targetNode && targetNode.type !== "tag_node" && targetNode.type !== "opt_in_node";
              });

              const tagEdge = edges.find((e) => {
                if (e.source !== n.id || e.sourceHandle !== btn.id) return false;
                const targetNode = nodes.find((node) => node.id === e.target);
                return targetNode && targetNode.type === "tag_node";
              });

              const optInEdge = edges.find((e) => {
                if (e.source !== n.id || e.sourceHandle !== btn.id) return false;
                const targetNode = nodes.find((node) => node.id === e.target);
                return targetNode && targetNode.type === "opt_in_node";
              });

              const tagNode = tagEdge ? nodes.find((node) => node.id === tagEdge.target) : null;

              return {
                ...btn,
                nextStepId: targetEdge ? targetEdge.target : null,
                tagNodeId: tagNode ? tagNode.id : null,
                applyTagId: tagNode ? tagNode.data.selectedTag : null,
                optInNodeId: optInEdge ? optInEdge.target : null,
              };
            })
          : [];

        const stepType = n.type as any;

        const stepData: any = {
          id: n.id,
          stepType,
          message: n.data.message || "",
          buttons: buttonsWithLinks,
          position: n.position,
          mediaUrl: n.data.mediaUrl || null,
          mediaType: n.data.mediaType || null,
          urlLabel: n.data.urlLabel || "",
          url: n.data.url || "",
          phoneNumber: n.data.phoneNumber || "",
          selectedTag: n.data.selectedTag || null,
          selectedForm: n.data.selectedForm || null,
          listButtonText: n.data.listButtonText || "",
        };

        if (stepType === "delay_node") {
          const delayTargetEdge = edges.find(
            (e) => e.source === n.id && e.sourceHandle === "delay-out"
          );
          const targetNode = delayTargetEdge
            ? nodes.find((node) => node.id === delayTargetEdge.target)
            : null;

          const validTarget =
            targetNode && targetNode.type !== "tag_node" && targetNode.type !== "opt_in_node"
              ? delayTargetEdge?.target || null
              : null;

          stepData.nextStepId = validTarget;
          stepData.delaySeconds = n.data.delaySeconds || 10;
        }

        // Save Inactivity Node specific data
        if (stepType === "inactivity_node") {
          stepData.message = n.data.message || "Are you still there?";
          stepData.delaySeconds = n.data.delaySeconds || 30;
          stepData.repeatCount = n.data.repeatCount || 1;
        }

        steps[n.id] = stepData;
      });

    const rootEdge = edges.find((e) => e.source === "trigger-node");
    const rootStepId = rootEdge ? rootEdge.target : null;

    if (cleanTriggers.length === 0 || !rootStepId || !steps[rootStepId]?.message.trim()) {
      alert("Need at least one trigger and a valid root message.");
      return;
    }

    onSave({ _id: editId || "", triggers: cleanTriggers, steps, rootStepId });
  };

  return (
    <div
      className={`overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
        isFullScreen
          ? "fixed inset-0 z-50 bg-white h-screen w-screen"
          : "bg-white rounded-2xl border border-gray-200 shadow-sm relative h-[80vh]"
      }`}
    >
      <div className="p-3 border-b border-gray-100 bg-white z-30 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              editId ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
            }`}
          >
            <WorkflowIcon size={16} />
          </div>
          <h2 className="text-sm font-bold text-gray-900">
            {editId ? "Edit Workflow" : "New Workflow"}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={formatLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <Layout size={14} /> Format
          </button>
          {editId && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors hidden sm:block"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-gray-200"
          >
            {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50 p-3 flex md:block space-x-2 md:space-x-0 md:space-y-3 overflow-x-auto md:overflow-y-auto shrink-0">
          <div className="flex md:flex-col gap-2 pb-2 md:pb-0 w-full md:w-auto">
            <h3 className="hidden md:block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Nodes
            </h3>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "message")}
              onClick={() => handleQuickAdd("message")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-emerald-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageSquare size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Message</p>
                <p className="text-[10px] text-gray-400">Send text/media</p>
              </div>
            </div>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "url_action")}
              onClick={() => handleQuickAdd("url_action")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-purple-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                <LinkIcon size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">URL Button</p>
                <p className="text-[10px] text-gray-400">Open link on click</p>
              </div>
            </div>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "call_action")}
              onClick={() => handleQuickAdd("call_action")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-rose-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <PhoneCall size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Call Action</p>
                <p className="text-[10px] text-gray-400">Click to call number</p>
              </div>
            </div>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "delay_node")}
              onClick={() => handleQuickAdd("delay_node")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-sky-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <Clock size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Delay</p>
                <p className="text-[10px] text-gray-400">Wait X seconds</p>
              </div>
            </div>

            {/* NEW: Inactivity Node Sidebar Item */}
            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "inactivity_node")}
              onClick={() => handleQuickAdd("inactivity_node")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-fuchsia-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center shrink-0">
                <Hourglass size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Inactivity</p>
                <p className="text-[10px] text-gray-400">No-reply timer</p>
              </div>
            </div>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "tag_node")}
              onClick={() => handleQuickAdd("tag_node")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-indigo-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <TagIcon size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Tag Action</p>
                <p className="text-[10px] text-gray-400">Apply tag to user</p>
              </div>
            </div>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "opt_in_node")}
              onClick={() => handleQuickAdd("opt_in_node")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-orange-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <UserPlus size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Opt-in Action</p>
                <p className="text-[10px] text-gray-400">Save user&apos;s number</p>
              </div>
            </div>

            <div
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", "form_node")}
              onClick={() => handleQuickAdd("form_node")}
              draggable
              className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-xl cursor-grab hover:border-teal-400 hover:shadow-sm transition-all shrink-0 w-40 md:w-full active:scale-95"
            >
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                <ClipboardList size={14} />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">Form Action</p>
                <p className="text-[10px] text-gray-400">Send custom form</p>
              </div>
            </div>
          </div>

          <div className="hidden md:block text-[10px] text-gray-400 leading-relaxed pt-2 border-t border-gray-200">
            <p>
              💡 <strong>Tip:</strong> Drag nodes onto the canvas, or tap to add
              on mobile.
            </p>
            <p className="mt-2">
              🗑️ <strong>Delete wire:</strong> Double-click the wire.
            </p>
            <p className="mt-2">
              🗑️ <strong>Delete node:</strong> Click the trash icon on the node.
            </p>
            <p className="mt-2">
              📋 <strong>List Mode:</strong> Add more than 3 buttons to a
              Message node and they&apos;ll auto-convert to a WhatsApp List.
            </p>
            <p className="mt-2">
              ⏱️ <strong>Delay Node:</strong> Connect buttons to a delay node
              to pause before sending the next message.
            </p>
            <p className="mt-2 text-fuchsia-600">
              ⌛ <strong>Inactivity Node:</strong> Place anywhere on canvas. If 
              user doesn&apos;t click a button in time, sends a reminder.
            </p>
          </div>
        </div>

        <div ref={reactFlowWrapper} className="flex-1 h-full w-full bg-gray-50/80 bg-dots">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            onEdgeDoubleClick={onEdgeDoubleClick}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background gap={16} size={1} color="#e5e7eb" />
            <Controls className="!bg-white !border !border-gray-200 !shadow-lg !rounded-lg" />
            <MiniMap
              className="!bg-white !border !border-gray-200"
              nodeColor={(n) =>
                n.type === "trigger"
                  ? "#f59e0b"
                  : n.type === "url_action"
                  ? "#a855f7"
                  : n.type === "call_action"
                  ? "#f43f5e"
                  : n.type === "tag_node"
                  ? "#6366f1"
                  : n.type === "opt_in_node"
                  ? "#f97316"
                  : n.type === "form_node"
                  ? "#14b8a6"
                  : n.type === "delay_node"
                  ? "#0ea5e9"
                  : n.type === "inactivity_node"
                  ? "#d946ef" // Color for Inactivity Node
                  : "#10b981"
              }
            />
          </ReactFlow>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-30">
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 hover:shadow-xl hover:scale-105"
        >
          {editId ? "Update Workflow" : "Create Workflow"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
   6. WRAPPER & CARD COMPONENTS
   ============================================================================ */

function WorkflowForm({
  editId,
  initialData,
  onSave,
  onCancel,
}: {
  editId: string | null;
  initialData: Workflow;
  onSave: (wf: Workflow) => void;
  onCancel: () => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvas
        initialData={initialData}
        editId={editId}
        onSave={onSave}
        onCancel={onCancel}
      />
    </ReactFlowProvider>
  );
}

function WorkflowCard({
  wf,
  onEdit,
  onDelete,
}: {
  wf: Workflow;
  onEdit: (wf: Workflow) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rootStep = wf.steps[wf.rootStepId];

  const hasListMode = Object.values(wf.steps).some(
    (s) => s.buttons && s.buttons.length > 3
  );

  return (
    <div
      className="group bg-white rounded-2xl border border-gray-200 hover:border-emerald-200 hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer"
      onClick={() => onEdit(wf)}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[11px] text-amber-700 font-bold uppercase tracking-wider mr-1">
                Triggers:
              </span>
              {wf.triggers.map((t, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                    t.matchMode === "exact"
                      ? "bg-purple-50 border-purple-200 text-purple-700"
                      : "bg-amber-50 border-amber-200 text-amber-700"
                  }`}
                >
                  {t.matchMode === "exact" ? <Crosshair size={10} /> : <Zap size={10} />}
                  {t.keyword === "*" ? "Any Message" : t.keyword}
                </span>
              ))}
            </div>

            {rootStep && (
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <MessageSquare
                    size={14}
                    className="text-emerald-500 mt-0.5 shrink-0"
                  />
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                    {rootStep.message || "No message set"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {rootStep.mediaUrl && (
                    <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-[10px] font-semibold text-gray-600 flex items-center gap-1 capitalize">
                      {rootStep.mediaType === "link" ? <LinkIcon size={8} /> : <FileText size={8} />}{" "}
                      {rootStep.mediaType}
                    </span>
                  )}
                  {rootStep.buttons.length > 3 && (
                    <span className="px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-full text-[10px] font-semibold text-purple-700 flex items-center gap-1">
                      <List size={8} /> List ({rootStep.buttons.length} items)
                    </span>
                  )}
                  {rootStep.buttons.length <= 3 &&
                    rootStep.buttons.map((b) => (
                      <span
                        key={b.id}
                        className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-[10px] font-semibold text-blue-700 flex items-center gap-1"
                      >
                        <MousePointerClick size={8} /> {b.label || "Button"}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {hasListMode && (
              <p className="text-[10px] text-purple-600 mt-2 flex items-center gap-1">
                <List size={10} /> Contains List Menu steps
              </p>
            )}
          </div>

          <div
            className="flex items-center gap-1.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    onDelete(wf._id);
                    setConfirmDelete(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   7. MAIN HOME PAGE COMPONENT
   ============================================================================ */
export default function Home() {
  const { data: session, status } = useSession();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Workflow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") =>
    setToast({ message, type });

  const getEmptyWorkflow = useCallback((): Workflow => {
    const rootId = uid();
    return {
      _id: "new",
      triggers: [{ keyword: "", matchMode: "contains" }],
      steps: {
        [rootId]: {
          id: rootId,
          stepType: "message",
          message: "",
          buttons: [],
          mediaUrl: null,
          mediaType: null,
          listButtonText: "",
        },
      },
      rootStepId: rootId,
    };
  }, []);

  const normalizeWorkflow = (wf: any): Workflow => {
    if (wf.steps && wf.rootStepId) {
      return {
        ...wf,
        triggers: wf.triggers.map((t: any) =>
          typeof t === "string"
            ? { keyword: t, matchMode: "contains" }
            : { keyword: t.keyword, matchMode: t.matchMode || "contains" }
        ),
      };
    }
    const rootId = uid();
    const actions = wf.actions || [];
    return {
      ...wf,
      triggers: (
        wf.triggers || [{ keyword: wf.trigger?.keyword || "" }]
      ).map((t: any) =>
        typeof t === "string"
          ? { keyword: t, matchMode: "contains" }
          : { keyword: t.keyword, matchMode: t.matchMode || "contains" }
      ),
      steps: {
        [rootId]: {
          id: rootId,
          stepType: "message",
          message: actions[0]?.message || "",
          buttons: [],
          mediaUrl: null,
          mediaType: null,
          listButtonText: "",
        },
      },
      rootStepId: rootId,
    };
  };

  const load = async () => {
    try {
      const res = await fetch("/api/workflow");
      if (res.status === 401) {
        window.location.href = "/signin";
        return;
      }
      const data = await res.json();
      setWorkflows((data.workflows || []).map(normalizeWorkflow));
    } catch {
      showToast("Failed to load workflows", "error");
    }
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
      const payload = {
        triggers: wfData.triggers,
        steps: wfData.steps,
        rootStepId: wfData.rootStepId,
      };

      if (editId && editId !== "new") {
        await fetch("/api/workflow", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editId, ...payload }),
        });
        showToast("Workflow updated!");
      } else {
        await fetch("/api/workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        showToast("Workflow created!");
      }
      setEditId(null);
      setEditData(null);
      load();
    } catch {
      showToast("Something went wrong", "error");
    }
  };

  const remove = async (id: string) => {
    try {
      await fetch(`/api/workflow/${id}`, { method: "DELETE" });
      setWorkflows((prev) => prev.filter((wf) => wf._id !== id));
      showToast("Deleted");
    } catch {
      showToast("Delete failed", "error");
    }
  };

  const edit = (wf: Workflow) => {
    setEditId(wf._id);
    setEditData(wf);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditData(null);
  };

  const filteredWorkflows = workflows.filter(
    (wf) =>
      wf.triggers.some((t) =>
        t.keyword?.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      Object.values(wf.steps).some((s) =>
        s.message?.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  if (status === "loading") {
    return (
      <div className="flex min-h-screen bg-slate-50 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        .bg-dots {
          background-image: radial-gradient(#d1d5db 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .react-flow__handle { transition: all 0.2s; }
        .react-flow__handle:hover { transform: scale(1.2); }
      `}</style>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <Sidebar />

      <main className="ml-0 md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Workflows</h1>
                <p className="text-sm text-gray-400 mt-0.5">
                  Drag, drop, and connect nodes like n8n
                </p>
              </div>
              <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3">
                <div className="relative flex-1 sm:flex-none">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search workflows…"
                    className="w-full sm:w-64 pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                  />
                </div>
                <button
                  onClick={startCreating}
                  className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                >
                  <Plus size={16} /> Create Workflow
                </button>
              </div>
            </div>
          </header>

          {editId !== null && (
            <WorkflowForm
              key={editId}
              editId={editId === "new" ? null : editId}
              initialData={editData || getEmptyWorkflow()}
              onSave={save}
              onCancel={cancelEdit}
            />
          )}

          {workflows.length > 0 && editId === null && (
            <div className="flex items-center gap-6 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-gray-500">
                  {workflows.length} active workflow{workflows.length !== 1 ? "s" : ""}
                </span>
              </div>
              {searchQuery && (
                <span className="text-xs text-gray-400">
                  {filteredWorkflows.length} results for &quot;{searchQuery}&ldquo;
                </span>
              )}
            </div>
          )}

          <div className="grid gap-4">
            {filteredWorkflows.map((wf) => (
              <WorkflowCard key={wf._id} wf={wf} onEdit={edit} onDelete={remove} />
            ))}
          </div>

          {workflows.length === 0 && editId === null && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300 mb-4">
                <WorkflowIcon size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">No workflows yet</h3>
              <p className="text-sm text-gray-400 max-w-xs">
                Create your first workflow to start auto-replying to WhatsApp messages.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
