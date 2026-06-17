/* eslint-disable react-hooks/immutability */
/* eslint-disable react-hooks/preserve-manual-memoization */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback, useRef, DragEvent, MouseEvent } from "react";
import Sidebar from "@/components/Sidebar"; 
import ReactFlow, {
  ReactFlowProvider, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  Handle, Position, Connection, Node, Edge, useReactFlow, getBezierPath, EdgeLabelRenderer,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Zap, MessageSquare, Plus, Trash2, X, Workflow, Check, Maximize, Minimize,
  Type, Crosshair, PhoneCall, Globe, Clock, HelpCircle, Loader2, Lock, Unlock,
  Wand2, Shrink, Image as ImageIcon, Upload, MousePointerClick, LayoutTemplate,
  Share2, ClipboardList, FileText, Eraser,
} from "lucide-react";
import { useSession } from "next-auth/react";

type Trigger = { keyword: string; matchMode: "exact" | "contains" };
type Button = { id: string; label: string; nextStepId: string | null; phoneNumber?: string; url?: string; isHidden?: boolean };
type Step = { id: string; message: string; buttons: Button[]; waitType?: "wait" | "none"; nodeType?: string; metadata?: any };
type Workflow = { _id: string; triggers: Trigger[]; steps: Record<string, Step>; rootStepId: string };
const uid = () => Math.random().toString(36).substr(2, 9);

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-medium animate-slide-in ${type === "success" ? "bg-white border-emerald-200 text-emerald-700" : "bg-white border-red-200 text-red-700"}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${type === "success" ? "bg-emerald-100" : "bg-red-100"}`}>
        {type === "success" ? <Check size={14} /> : <X size={14} />}
      </span>
      {message}
    </div>
  );
}

const DeletableEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }: any) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const onDelete = (event: MouseEvent) => {
    event.stopPropagation();
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };
  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button onClick={onDelete} className="absolute bg-white border border-gray-300 rounded-full w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-400 shadow-sm transition-colors pointer-events-auto" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
          <X size={12} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
};
const edgeTypes = { deletable: DeletableEdge };

const CustomNode = ({ id, data, type }: any) => {
  const handleDataChange = (key: string, value: any) => data.onChange(id, { ...data, [key]: value });
  const handleKeywordChange = (index: number, value: string) => {
    const newKeywords = [...(data.keywords || [])];
    newKeywords[index] = value;
    handleDataChange("keywords", newKeywords);
  };
  const addKeyword = () => handleDataChange("keywords", [...(data.keywords || []), ""]);
  const removeKeyword = (index: number) => handleDataChange("keywords", (data.keywords || []).filter((_: any, i: number) => i !== index));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("File size exceeds 5MB limit!"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      let mType = "image";
      if (file.type.startsWith("video")) mType = "video";
      else if (file.type.includes("pdf")) mType = "pdf";
      handleDataChange("mediaUrl", url);
      handleDataChange("mediaType", mType);
    };
    reader.readAsDataURL(file);
  };

  const addButton = () => handleDataChange("buttons", [...(data.buttons || []), { id: uid(), label: "" }]);
  const removeButton = (btnId: string) => handleDataChange("buttons", (data.buttons || []).filter((b: any) => b.id !== btnId));
  const handleButtonLabelChange = (btnId: string, label: string) => handleDataChange("buttons", (data.buttons || []).map((b: any) => b.id === btnId ? { ...b, label } : b));

  const addFormField = () => handleDataChange("formFields", [...(data.formFields || []), { id: uid(), label: "", type: "text" }]);
  const removeFormField = (fId: string) => handleDataChange("formFields", (data.formFields || []).filter((f: any) => f.id !== fId));
  const handleFieldChange = (fId: string, key: string, val: string) => handleDataChange("formFields", (data.formFields || []).map((f: any) => f.id === fId ? { ...f, [key]: val } : f));

  const inputCls = (color: string) => `w-full px-3 py-2 bg-gray-50 border rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all resize-none ${color}`;
  const canHaveButtons = type === "message" || type === "mediaNode";
  const hasDynButtons = canHaveButtons && data.buttons?.length > 0;
  const isTerminal = type === "delay" || type === "linkWorkflowNode";

  return (
    <div className="w-72 bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden group relative pb-4">
      {type !== "trigger" && <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />}
      
      <div className={`p-3 flex items-center gap-2 border-b border-gray-100 ${
        type === "trigger" ? "bg-amber-50 text-amber-700" :
        type === "callButton" ? "bg-blue-50 text-blue-700" :
        type === "websiteButton" ? "bg-purple-50 text-purple-700" :
        type === "question" ? "bg-pink-50 text-pink-700" :
        type === "delay" ? "bg-gray-100 text-gray-700" :
        type === "mediaNode" ? "bg-indigo-50 text-indigo-700" :
        type === "templateNode" ? "bg-teal-50 text-teal-700" :
        type === "linkWorkflowNode" ? "bg-orange-50 text-orange-700" :
        type === "formNode" ? "bg-fuchsia-50 text-fuchsia-700" :
        "bg-emerald-50 text-emerald-700"
      }`}>
        {type === "trigger" && <Zap size={14} />}
        {type === "message" && <MessageSquare size={14} />}
        {type === "callButton" && <PhoneCall size={14} />}
        {type === "websiteButton" && <Globe size={14} />}
        {type === "question" && <HelpCircle size={14} />}
        {type === "delay" && <Clock size={14} />}
        {type === "mediaNode" && <ImageIcon size={14} />}
        {type === "templateNode" && <LayoutTemplate size={14} />}
        {type === "linkWorkflowNode" && <Share2 size={14} />}
        {type === "formNode" && <ClipboardList size={14} />}
        
        <span className="text-xs font-bold uppercase tracking-wider">
          {type === "trigger" ? "Trigger" : type === "callButton" ? "Call Action" : type === "websiteButton" ? "Website Link" : type === "question" ? "Capture Reply" : type === "delay" ? "Delay Wait" : type === "mediaNode" ? "Media Message" : type === "templateNode" ? "WhatsApp Template" : type === "linkWorkflowNode" ? "Link to Workflow" : type === "formNode" ? "Create Form" : "Message Step"}
        </span>
        
        {type !== "trigger" && (
          <button onClick={() => data.onDelete(id)} className="ml-auto opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {type === "trigger" && (
          <>
            <div className="space-y-2">
              {data.keywords?.map((kw: string, i: number) => (
                <div key={i} className="flex items-center gap-2 group/kw">
                  <input value={kw} onChange={(e) => handleKeywordChange(i, e.target.value)} placeholder={`Keyword ${i + 1}`} className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm text-gray-900 placeholder:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm" />
                  {data.keywords.length > 1 && (
                    <button onClick={() => removeKeyword(i)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/kw:opacity-100"><X size={14} /></button>
                  )}
                </div>
              ))}
              <button onClick={addKeyword} className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors"><Plus size={12} /> Add another keyword</button>
            </div>
            <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5">
              <button onClick={() => handleDataChange("matchMode", "contains")} className={`flex-1 p-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 ${data.matchMode === "contains" ? "bg-blue-500 text-white" : "text-gray-400"}`}><Type size={12} /> Contains</button>
              <button onClick={() => handleDataChange("matchMode", "exact")} className={`flex-1 p-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 ${data.matchMode === "exact" ? "bg-purple-500 text-white" : "text-gray-400"}`}><Crosshair size={12} /> Exact</button>
            </div>
          </>
        )}

        {type === "message" && <textarea value={data.message} onChange={(e) => handleDataChange("message", e.target.value)} placeholder="Type auto-reply message..." rows={3} className={inputCls("border-gray-200 focus:ring-emerald-500/20 focus:border-emerald-400")} />}

        {type === "mediaNode" && (
          <>
            <div className="space-y-2">
              {data.mediaUrl && (
                <div className="relative w-full h-32 rounded-lg overflow-hidden border border-indigo-100 mb-2 bg-gray-50 flex items-center justify-center">
                  {data.mediaType === 'image' && <img src={data.mediaUrl} alt="Preview" className="w-full h-full object-cover" />}
                  {data.mediaType === 'video' && <video src={data.mediaUrl} className="w-full h-full object-cover" controls />}
                  {data.mediaType === 'pdf' && <div className="flex flex-col items-center text-gray-500"><FileText size={32} /><span className="text-xs mt-1">PDF Preview</span></div>}
                  <button onClick={() => handleDataChange("mediaUrl", "")} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"><X size={12} /></button>
                </div>
              )}
              <input value={data.mediaUrl && data.mediaUrl.startsWith('data:') ? "" : data.mediaUrl} onChange={(e) => handleDataChange("mediaUrl", e.target.value)} placeholder="Paste Image/Video/PDF URL" className={inputCls("border-indigo-200 focus:ring-indigo-500/20 focus:border-indigo-400")} />
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-indigo-200 border-dashed rounded-lg cursor-pointer bg-indigo-50 hover:bg-indigo-100 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-2">
                    <Upload size={16} className="text-indigo-500 mb-1" />
                    <p className="text-xs text-indigo-600">Upload (Max 5MB)</p>
                  </div>
                  <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*,application/pdf" />
                </label>
              </div>
            </div>
            <textarea value={data.message} onChange={(e) => handleDataChange("message", e.target.value)} placeholder="Caption (optional)..." rows={2} className={inputCls("border-indigo-200 focus:ring-indigo-500/20 focus:border-indigo-400")} />
          </>
        )}

        {type === "templateNode" && (
          <>
            <select value={data.templateName} onChange={(e) => handleDataChange("templateName", e.target.value)} className={inputCls("border-teal-200 focus:ring-teal-500/20 focus:border-teal-400")}>
              <option value="">Select Template...</option>
              {data.allTemplates?.map((t: any) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <p className="text-[11px] text-teal-600 font-medium bg-teal-50 p-2 rounded-lg">Sends an official Meta-approved template.</p>
          </>
        )}

        {type === "linkWorkflowNode" && (
          <>
            <select value={data.targetWorkflowId} onChange={(e) => handleDataChange("targetWorkflowId", e.target.value)} className={inputCls("border-orange-200 focus:ring-orange-500/20 focus:border-orange-400")}>
              <option value="">Select Workflow to Link...</option>
              {data.allWorkflows?.map((w: any) => <option key={w._id} value={w._id}>{w.name || `Workflow ${w._id.substring(0, 5)}`}</option>)}
            </select>
            <p className="text-[11px] text-orange-600 font-medium bg-orange-50 p-2 rounded-lg">Ends current flow and starts another.</p>
          </>
        )}

        {type === "formNode" && (
          <>
            <input value={data.formTitle} onChange={(e) => handleDataChange("formTitle", e.target.value)} placeholder="Form Title" className={inputCls("border-fuchsia-200 focus:ring-fuchsia-500/20 focus:border-fuchsia-400")} />
            <div className="space-y-2 border-t pt-2">
              <p className="text-[11px] font-bold text-gray-500 uppercase">Form Fields</p>
              {data.formFields?.map((field: any) => (
                <div key={field.id} className="flex gap-1 items-center group/ff">
                  <input value={field.label} onChange={(e) => handleFieldChange(field.id, "label", e.target.value)} placeholder="Field Label" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                  <select value={field.type} onChange={(e) => handleFieldChange(field.id, "type", e.target.value)} className="bg-gray-50 border border-gray-200 rounded-lg px-1 py-1 text-xs focus:outline-none">
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="tel">Phone</option>
                    <option value="number">Number</option>
                  </select>
                  <button onClick={() => removeFormField(field.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover/ff:opacity-100"><X size={12} /></button>
                </div>
              ))}
              <button onClick={addFormField} className="w-full text-xs font-semibold text-fuchsia-600 hover:text-fuchsia-800 border border-dashed border-fuchsia-300 rounded-md py-1 mt-1">+ Add Field</button>
            </div>
            <input value={data.submitButtonText} onChange={(e) => handleDataChange("submitButtonText", e.target.value)} placeholder="Submit Button Text" className={inputCls("border-fuchsia-200 focus:ring-fuchsia-500/20 focus:border-fuchsia-400")} />
          </>
        )}

        {type === "question" && (
          <>
            <textarea value={data.message} onChange={(e) => handleDataChange("message", e.target.value)} placeholder="Ask a question..." rows={3} className={inputCls("border-gray-200 focus:ring-pink-500/20 focus:border-pink-400")} />
            <p className="text-[11px] text-pink-600 font-medium bg-pink-50 p-2 rounded-lg">Flow waits here for user to reply.</p>
          </>
        )}

        {type === "delay" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Wait</span>
            <input type="number" value={data.delaySeconds} onChange={(e) => handleDataChange("delaySeconds", e.target.value)} className="w-16 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-gray-400 shadow-sm" />
            <span className="text-sm text-gray-600">seconds</span>
          </div>
        )}

        {(type === "callButton" || type === "websiteButton") && (
          <>
            <textarea value={data.message} onChange={(e) => handleDataChange("message", e.target.value)} placeholder="Message before button..." rows={2} className={inputCls(type === "callButton" ? "border-blue-200 focus:ring-blue-500/20 focus:border-blue-400" : "border-purple-200 focus:ring-purple-500/20 focus:border-purple-400")} />
            <input value={data.buttonText} onChange={(e) => handleDataChange("buttonText", e.target.value)} placeholder="Button Text" className={`w-full bg-white border rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none shadow-sm ${type === "callButton" ? "border-blue-200 focus:border-blue-400" : "border-purple-200 focus:border-purple-400"}`} />
            <input value={type === "callButton" ? data.phoneNumber : data.url} onChange={(e) => handleDataChange(type === "callButton" ? "phoneNumber" : "url", e.target.value)} placeholder={type === "callButton" ? "Phone (+123...)" : "https://website.com"} className={`flex-1 bg-white border rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none shadow-sm ${type === "callButton" ? "border-blue-200 focus:border-blue-400" : "border-purple-200 focus:border-purple-400"}`} />
            <a href={type === "callButton" ? `tel:${data.phoneNumber}` : (data.url?.startsWith('http') ? data.url : `https://${data.url}`)} target="_blank" rel="noreferrer" className="block text-center text-[10px] text-white bg-gray-800 hover:bg-gray-900 rounded-md py-1 mt-1">Test Action</a>
          </>
        )}

        {canHaveButtons && (
          <div className="space-y-2 border-t pt-3 mt-2">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider"><MousePointerClick size={12} /> Interactive Buttons</div>
            {data.buttons?.map((btn: any) => (
              <div key={btn.id} className="flex items-center gap-2 group/btn relative">
                <input value={btn.label} onChange={(e) => handleButtonLabelChange(btn.id, e.target.value)} placeholder="Button Text" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-emerald-400 shadow-sm" />
                <button onClick={() => removeButton(btn.id)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/btn:opacity-100"><X size={14} /></button>
                <Handle type="source" position={Position.Right} id={`btn-${btn.id}`} className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white absolute right-[-18px] top-1/2 -translate-y-1/2" />
              </div>
            ))}
            <button onClick={addButton} className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors w-full justify-center border border-dashed border-gray-300 rounded-lg py-1.5 hover:bg-gray-50"><Plus size={12} /> Add Button</button>
          </div>
        )}
      </div>
      
      {!hasDynButtons && !isTerminal && <Handle type="source" position={Position.Bottom} id="default" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />}
      {(type === "callButton" || type === "websiteButton") && <Handle type="source" position={Position.Bottom} id="default" className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />}
    </div>
  );
};

const nodeTypes = { trigger: CustomNode, message: CustomNode, callButton: CustomNode, websiteButton: CustomNode, question: CustomNode, delay: CustomNode, mediaNode: CustomNode, templateNode: CustomNode, linkWorkflowNode: CustomNode, formNode: CustomNode };

function WorkflowCanvas({ editId, initialData, onSave, onCancel, allWorkflows, allTemplates }: any) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: rfNodes, edges: rfEdges } = convertDataToFlow(initialData, updateNodeData, deleteNode, allWorkflows, allTemplates);
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [initialData]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, type: "deletable" }, eds)), [setEdges]);
  const updateNodeData = useCallback((id: string, data: any) => setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n))), [setNodes]);
  const deleteNode = useCallback((id: string) => { setNodes((nds) => nds.filter((n) => n.id !== id)); setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id)); }, [setNodes, setEdges]);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }, []);
  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow");
    if (!type) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const defaultData: any = { onChange: updateNodeData, onDelete: deleteNode, message: "", buttons: [], allWorkflows, allTemplates };
    if (type === "trigger") { defaultData.keywords = [""]; defaultData.matchMode = "contains"; }
    if (type === "callButton") { defaultData.buttonText = "Call Now"; defaultData.phoneNumber = ""; }
    if (type === "websiteButton") { defaultData.buttonText = "Visit Website"; defaultData.url = ""; }
    if (type === "delay") defaultData.delaySeconds = 5;
    if (type === "mediaNode") defaultData.mediaUrl = "";
    if (type === "templateNode") defaultData.templateName = "";
    if (type === "linkWorkflowNode") defaultData.targetWorkflowId = "";
    if (type === "formNode") { defaultData.formTitle = ""; defaultData.submitButtonText = "Submit"; defaultData.formFields = []; }
    setNodes((nds) => nds.concat({ id: uid(), type, position, data: defaultData }));
  }, [screenToFlowPosition, setNodes, updateNodeData, deleteNode, allWorkflows, allTemplates]);

  const handleFormatLayout = useCallback(() => {
    setNodes((prevNodes) => {
      const childrenMap: Record<string, string[]> = {};
      const incomingCount: Record<string, number> = {};
      prevNodes.forEach(n => { childrenMap[n.id] = []; incomingCount[n.id] = 0; });
      edges.forEach(e => { if (childrenMap[e.source]) childrenMap[e.source].push(e.target); incomingCount[e.target] = (incomingCount[e.target] || 0) + 1; });
      
      const roots = prevNodes.filter(n => incomingCount[n.id] === 0).map(n => n.id);
      const positions: Record<string, { x: number, y: number }> = {};
      let currentX = 0;
      
      const assignPositions = (nodeId: string, depth: number) => {
        const children = childrenMap[nodeId];
        const myY = depth * 250;
        if (children.length === 0) {
          positions[nodeId] = { x: currentX, y: myY };
          currentX += 400;
          return;
        }
        children.forEach(child => assignPositions(child, depth + 1));
        const firstChildX = positions[children[0]].x;
        const lastChildX = positions[children[children.length - 1]].x;
        positions[nodeId] = { x: (firstChildX + lastChildX) / 2, y: myY };
      };
      roots.forEach(root => assignPositions(root, 0));
      return prevNodes.map(n => ({ ...n, position: positions[n.id] || { x: currentX + 100, y: 0 } }));
    });
    setTimeout(() => fitView({ padding: 0.3, duration: 800 }), 50);
  }, [edges, setNodes, fitView]);

  const handleClearCanvas = () => {
    if (window.confirm("Are you sure you want to clear the entire canvas?")) { setNodes([]); setEdges([]); }
  };

  const handleSave = () => onSave(convertFlowToData(nodes, edges));
  const isValid = nodes.some(n => n.type === "trigger" && n.data.keywords?.some((k: string) => k.trim())) && nodes.some(n => n.type !== "trigger" && n.data.message?.trim());

  return (
    <div className={`overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${isFullScreen ? "fixed inset-0 z-50 bg-white" : "bg-white rounded-2xl border border-gray-200 shadow-sm relative h-[85vh]"}`}>
      <div className="p-3 sm:p-4 border-b border-gray-100 bg-white z-30 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${editId ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}><Workflow size={16} /></div>
          <h2 className="text-sm font-bold text-gray-900">{editId ? "Edit Workflow" : "New Workflow"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleFormatLayout} title="Auto-Format Layout" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors border border-gray-200"><Wand2 size={16} /></button>
          <button onClick={() => fitView({ padding: 0.3, duration: 800 })} title="Fit View" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors border border-gray-200"><Shrink size={16} /></button>
          <button onClick={handleClearCanvas} title="Clear Canvas" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-gray-200"><Eraser size={16} /></button>
          <button onClick={() => setIsLocked(!isLocked)} title={isLocked ? "Unlock Canvas" : "Lock Canvas"} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors border ${isLocked ? "bg-red-50 text-red-600 border-red-200" : "text-gray-500 hover:bg-gray-100 border-gray-200"}`}>{isLocked ? <Lock size={16} /> : <Unlock size={16} />}</button>
          {editId && <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors hidden sm:block">Cancel</button>}
          <button onClick={() => setIsFullScreen(!isFullScreen)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-gray-200">{isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-48 sm:w-56 border-r border-gray-100 bg-gray-50 p-3 space-y-2 overflow-y-auto">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Flow Blocks</h3>
          {[
            { type: "trigger", label: "Trigger", icon: Zap, color: "text-amber-500 border-amber-200 bg-amber-50 hover:bg-amber-100" },
            { type: "message", label: "Message", icon: MessageSquare, color: "text-emerald-500 border-emerald-200 bg-emerald-50 hover:bg-emerald-100" },
            { type: "mediaNode", label: "Media / File", icon: ImageIcon, color: "text-indigo-500 border-indigo-200 bg-indigo-50 hover:bg-indigo-100" },
            { type: "templateNode", label: "WA Template", icon: LayoutTemplate, color: "text-teal-500 border-teal-200 bg-teal-50 hover:bg-teal-100" },
            { type: "question", label: "Capture Reply", icon: HelpCircle, color: "text-pink-500 border-pink-200 bg-pink-50 hover:bg-pink-100" },
            { type: "formNode", label: "Create Form", icon: ClipboardList, color: "text-fuchsia-500 border-fuchsia-200 bg-fuchsia-50 hover:bg-fuchsia-100" },
            { type: "callButton", label: "Call Action", icon: PhoneCall, color: "text-blue-500 border-blue-200 bg-blue-50 hover:bg-blue-100" },
            { type: "websiteButton", label: "Website Link", icon: Globe, color: "text-purple-500 border-purple-200 bg-purple-50 hover:bg-purple-100" },
            { type: "linkWorkflowNode", label: "Link Workflow", icon: Share2, color: "text-orange-500 border-orange-200 bg-orange-50 hover:bg-orange-100" },
            { type: "delay", label: "Delay Wait", icon: Clock, color: "text-gray-500 border-gray-200 bg-gray-100 hover:bg-gray-200" },
          ].map((block) => (
            <div key={block.type} draggable onDragStart={(event) => { event.dataTransfer.setData("application/reactflow", block.type); event.dataTransfer.effectAllowed = "move"; }} className={`flex items-center gap-2 p-3 border rounded-xl cursor-grab transition-colors ${block.color}`}>
              <block.icon size={16} /><span className="text-xs font-semibold text-gray-700">{block.label}</span>
            </div>
          ))}
        </div>

        <div ref={reactFlowWrapper} className="flex-1 h-full">
          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} deleteKeyCode={["Backspace", "Delete"]} nodesDraggable={!isLocked} nodesConnectable={!isLocked} elementsSelectable={!isLocked}
            panOnDrag={!isLocked} zoomOnScroll={!isLocked} panOnScroll={!isLocked} zoomOnDoubleClick={!isLocked} fitView
            defaultEdgeOptions={{ style: { stroke: "#9ca3af", strokeWidth: 2 }, type: "smoothstep" }}
          >
            <Background color="#ccc" gap={16} size={1} />
            <Controls className="!bg-white !border !border-gray-200 !shadow-lg !rounded-lg" showInteractive={!isLocked} />
            <MiniMap className="!bg-white !border !border-gray-200" nodeColor={(n) => n.type === "trigger" ? "#fef3c7" : n.type === "callButton" ? "#dbeafe" : n.type === "websiteButton" ? "#f3e8ff" : n.type === "mediaNode" ? "#e0e7ff" : "#d1fae5"} />
          </ReactFlow>
        </div>
      </div>

      <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30">
        <button onClick={handleSave} disabled={!isValid} className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200 hover:shadow-xl hover:scale-105">
          {editId ? "Update Workflow" : "Create Workflow"}
        </button>
      </div>
    </div>
  );
}

function convertDataToFlow(wf: Workflow, onChange: any, onDelete: any, allWorkflows: any[], allTemplates: any[]) {
  const nodes: Node[] = []; const edges: Edge[] = []; let y = 0;
  const triggersByMode: Record<string, string[]> = {};
  wf.triggers.forEach(t => { if (!triggersByMode[t.matchMode]) triggersByMode[t.matchMode] = []; triggersByMode[t.matchMode].push(t.keyword); });
  Object.keys(triggersByMode).forEach((mode, i) => {
    const id = `trigger-${i}`;
    nodes.push({ id, type: "trigger", position: { x: 100, y: y }, data: { keywords: triggersByMode[mode], matchMode: mode as any, onChange, onDelete, allWorkflows, allTemplates } });
    y += 150;
  });

  const visited = new Set();
  const placeStep = (stepId: string, x: number, yPos: number) => {
    if (visited.has(stepId)) return; visited.add(stepId);
    const step = wf.steps[stepId];
    let type = step.nodeType || "message";
    if (step.buttons.some(b => b.phoneNumber)) type = "callButton";
    else if (step.buttons.some(b => b.url)) type = "websiteButton";
    else if (step.waitType === "wait" && type === "message") type = "question";
    
    nodes.push({
      id: stepId, type, position: { x, y: yPos },
      data: {
        message: step.message,
        buttonText: type === "callButton" ? step.buttons.find(b => b.phoneNumber)?.label : type === "websiteButton" ? step.buttons.find(b => b.url)?.label : "",
        phoneNumber: type === "callButton" ? step.buttons.find(b => b.phoneNumber)?.phoneNumber : "",
        url: type === "websiteButton" ? step.buttons.find(b => b.url)?.url : "",
        mediaUrl: step.metadata?.mediaUrl || "", mediaType: step.metadata?.mediaType || "image",
        templateName: step.metadata?.templateName || "",
        targetWorkflowId: step.metadata?.targetWorkflowId || "",
        formTitle: step.metadata?.formTitle || "", submitButtonText: step.metadata?.submitButtonText || "Submit", formFields: step.metadata?.formFields || [],
        buttons: step.buttons.filter(b => !b.phoneNumber && !b.url).map(b => ({ id: b.id, label: b.label, isHidden: b.isHidden })),
        delaySeconds: step.metadata?.delaySeconds || 5, onChange, onDelete, allWorkflows, allTemplates
      }
    });

    step.buttons.forEach(btn => {
      if (btn.nextStepId) {
        const handleId = (type === "callButton" || type === "websiteButton") ? "default" : (btn.isHidden ? "default" : `btn-${btn.id}`);
        edges.push({ id: `e-${stepId}-${btn.nextStepId}`, source: stepId, target: btn.nextStepId, sourceHandle: handleId, type: "deletable" });
        placeStep(btn.nextStepId, x + 320, yPos);
      }
    });
  };
  if (wf.rootStepId) { placeStep(wf.rootStepId, 400, 0); if (nodes[0]?.id) edges.push({ id: `e-${nodes[0].id}-${wf.rootStepId}`, source: nodes[0].id, target: wf.rootStepId, type: "deletable" }); }
  return { nodes, edges };
}

function convertFlowToData(nodes: Node[], edges: Edge[]): Workflow {
  const triggers: Trigger[] = nodes.filter(n => n.type === "trigger").flatMap(n => (n.data.keywords || []).filter((k: string) => k.trim()).map((kw: string) => ({ keyword: kw, matchMode: n.data.matchMode })));
  const steps: Record<string, Step> = {}; let rootStepId = "";
  const triggerToRootEdge = edges.find(e => nodes.find(n => n.id === e.source)?.type === "trigger");
  if (triggerToRootEdge) rootStepId = triggerToRootEdge.target;
  if (!rootStepId) { const firstMsg = nodes.find(n => n.type !== "trigger" && n.type !== "delay"); if (firstMsg) rootStepId = firstMsg.id; }

  nodes.filter(n => n.type !== "trigger").forEach(n => {
    const outgoingEdges = edges.filter(e => e.source === n.id);
    const buttons: Button[] = []; const metadata: any = {};
    if (n.type === "callButton") { buttons.push({ id: uid(), label: n.data.buttonText || "Call Now", nextStepId: outgoingEdges[0]?.target || null, phoneNumber: n.data.phoneNumber || "" }); }
    else if (n.type === "websiteButton") { buttons.push({ id: uid(), label: n.data.buttonText || "Visit Website", nextStepId: outgoingEdges[0]?.target || null, url: n.data.url || "" }); }
    else {
      (n.data.buttons || []).forEach((btn: any) => {
        const edge = outgoingEdges.find(e => e.sourceHandle === `btn-${btn.id}`);
        buttons.push({ id: btn.id, label: btn.label || "Button", nextStepId: edge?.target || null });
      });
      if (buttons.length === 0) {
        const defaultEdge = outgoingEdges.find(e => !e.sourceHandle || e.sourceHandle === 'default');
        if (defaultEdge) {
          // FIX: Added isHidden flag so the backend knows NOT to render this as a WhatsApp button
          buttons.push({ id: uid(), label: "Continue", nextStepId: defaultEdge.target, isHidden: true });
        }
      }
    }

    if (n.type === "mediaNode") { metadata.mediaUrl = n.data.mediaUrl; metadata.mediaType = n.data.mediaType; }
    if (n.type === "templateNode") metadata.templateName = n.data.templateName;
    if (n.type === "linkWorkflowNode") metadata.targetWorkflowId = n.data.targetWorkflowId;
    if (n.type === "formNode") { metadata.formTitle = n.data.formTitle; metadata.submitButtonText = n.data.submitButtonText; metadata.formFields = n.data.formFields; }
    if (n.type === "delay") metadata.delaySeconds = n.data.delaySeconds;

    steps[n.id] = { id: n.id, message: n.data.message || "", buttons, waitType: n.type === "question" || n.type === "formNode" ? "wait" : "none", nodeType: n.type, metadata };
    if (n.type === "delay") steps[n.id].message = `Wait ${n.data.delaySeconds} seconds`;
    if (n.type === "templateNode") steps[n.id].message = `Template: ${n.data.templateName}`;
    if (n.type === "linkWorkflowNode") steps[n.id].message = `Link to: ${n.data.targetWorkflowId}`;
  });
  return { _id: "", triggers, steps, rootStepId };
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
                <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${t.matchMode === "exact" ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  {t.matchMode === "exact" ? <Crosshair size={10} /> : <Type size={10} />} {t.keyword}
                </span>
              ))}
            </div>
            {rootStep && <div className="flex items-start gap-2"><MessageSquare size={14} className="text-emerald-500 mt-0.5 shrink-0" /><p className="text-sm text-gray-700 leading-relaxed line-clamp-2">{rootStep.message || "No message set"}</p></div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={() => { onDelete(wf._id); setConfirmDelete(false); }} className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600">Confirm</button>
                <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">Cancel</button>
              </div>
            ) : <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Workflow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = (message: string, type: "success" | "error" = "success") => setToast({ message, type });

  const getEmptyWorkflow = useCallback((): Workflow => {
    const rootId = uid();
    return { _id: "new", triggers: [{ keyword: "", matchMode: "contains" }], steps: { [rootId]: { id: rootId, message: "", buttons: [] } }, rootStepId: rootId };
  }, []);

  const normalizeWorkflow = (wf: any): Workflow => {
    if (wf.steps && wf.rootStepId) {
      const normalizedSteps: Record<string, Step> = {};
      // Mongoose Map to plain object
      const rawSteps = wf.steps instanceof Map ? Object.fromEntries(wf.steps) : wf.steps;
      for (const stepId in rawSteps) {
        normalizedSteps[stepId] = rawSteps[stepId];
      }
      return { ...wf, steps: normalizedSteps, triggers: wf.triggers.map((t: any) => typeof t === 'string' ? { keyword: t, matchMode: "contains" } : { keyword: t.keyword, matchMode: t.matchMode || "contains" }) };
    }
    const rootId = uid(); const actions = wf.actions || [];
    return { ...wf, triggers: (wf.triggers || [{ keyword: wf.trigger?.keyword || "" }]).map((t: any) => typeof t === 'string' ? { keyword: t, matchMode: "contains" } : { keyword: t.keyword, matchMode: t.matchMode || "contains" }), steps: { [rootId]: { id: rootId, message: actions[0]?.message || "", buttons: [] } }, rootStepId: rootId };
  };

  const load = async () => {
    try {
      const res = await fetch("/api/workflow");
      if (res.status === 401) { window.location.href = "/signin"; return; }
      const data = await res.json();
      setWorkflows((data.workflows || []).map(normalizeWorkflow));
      setTemplates([{ id: "1", name: "welcome_message" }, { id: "2", name: "order_confirmation" }]); // Mock
    } catch { showToast("Failed to load data", "error"); }
  };

  useEffect(() => { if (status === "authenticated") load(); else if (status === "unauthenticated") window.location.href = "/signin"; }, [status]);

  const startCreating = () => { setEditId("new"); setEditData(getEmptyWorkflow()); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const save = async (wfData: Workflow) => {
    const cleanTriggers = wfData.triggers.filter(t => t.keyword.trim());
    if (cleanTriggers.length === 0 || !wfData.steps[wfData.rootStepId]?.message.trim()) { showToast("Need at least one trigger and a root message", "error"); return; }
    try {
      const payload = { triggers: cleanTriggers, steps: wfData.steps, rootStepId: wfData.rootStepId };
      if (editId && editId !== "new") { await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, ...payload }) }); showToast("Workflow updated!"); }
      else { await fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); showToast("Workflow created!"); }
      setEditId(null); setEditData(null); load();
    } catch { showToast("Something went wrong", "error"); }
  };
  const remove = async (id: string) => { try { await fetch(`/api/workflow/${id}`, { method: "DELETE" }); setWorkflows(prev => prev.filter(wf => wf._id !== id)); showToast("Deleted"); } catch { showToast("Delete failed", "error"); } };
  const edit = (wf: Workflow) => { setEditId(wf._id); setEditData(wf); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditId(null); setEditData(null); };
  const filteredWorkflows = workflows.filter(wf => wf.triggers.some(t => t.keyword.toLowerCase().includes(searchQuery.toLowerCase())) || Object.values(wf.steps).some(s => s.message.toLowerCase().includes(searchQuery.toLowerCase())));

  if (status === "loading") return <div className="flex min-h-screen bg-slate-50 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx global>{`
        @keyframes slide-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        .react-flow__handle { width: 10px; height: 10px; background: #9ca3af; border: 2px solid white; }
        .react-flow__handle:hover { background: #10b981; }
      `}</style>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Sidebar />

      <main className="ml-0 md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Workflows</h1>
                <p className="text-sm text-gray-400 mt-0.5">Visual builder for WhatsApp automations</p>
              </div>
              <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3">
                <div className="relative flex-1 sm:flex-none">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></span>
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search workflows…" className="w-full sm:w-64 pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all" />
                </div>
                <button onClick={startCreating} className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"><Plus size={16} /> Create Workflow</button>
              </div>
            </div>
          </header>

          {editId !== null && (
            <ReactFlowProvider>
              <WorkflowCanvas key={editId} editId={editId === "new" ? null : editId} initialData={editData || getEmptyWorkflow()} onSave={save} onCancel={cancelEdit} allWorkflows={workflows} allTemplates={templates} />
            </ReactFlowProvider>
          )}
          
          {workflows.length > 0 && editId === null && (
            <div className="flex items-center gap-6 px-1">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs font-semibold text-gray-500">{workflows.length} active workflow{workflows.length !== 1 ? "s" : ""}</span></div>
            </div>
          )}

          <div className="grid gap-4">
            {filteredWorkflows.map(wf => <WorkflowCard key={wf._id} wf={wf} onEdit={edit} onDelete={remove} />)}
          </div>
          
          {workflows.length === 0 && editId === null && (
             <div className="flex flex-col items-center justify-center py-20 text-center">
               <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-300 mb-4"><Workflow size={24} /></div>
               <h3 className="text-lg font-bold text-gray-900 mb-1">No workflows yet</h3>
               <p className="text-sm text-gray-400 max-w-xs">Create your first workflow to start auto-replying to WhatsApp messages.</p>
             </div>
          )}
        </div>
      </main>
    </div>
  );
}
