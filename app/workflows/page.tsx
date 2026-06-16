/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar"; 
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Zap,
  MessageSquare,
  Plus,
  Trash2,
  GripVertical,
  X,
  Workflow,
  Check,
  MousePointerClick,
  ArrowDown,
  Maximize,
  Minimize,
  Crosshair,
  Type,
  Loader2,
} from "lucide-react";
import { useSession } from "next-auth/react";

/* ────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────── */
type Trigger = { keyword: string; matchMode: "exact" | "contains" };
type Button = { id: string; label: string; nextStepId: string | null };
type Step = { id: string; message: string; buttons: Button[] };
type Workflow = {
  _id: string;
  triggers: Trigger[];
  steps: Record<string, Step>;
  rootStepId: string;
};

const uid = () => Math.random().toString(36).substr(2, 9);

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
   DRAGGABLE TRIGGER ITEM (WITH MATCH MODE)
   ──────────────────────────────────────────── */
function TriggerItem({ trigger, index, onChange, onRemove }: { trigger: Trigger; index: number; onChange: (i: number, v: string, mode?: "exact" | "contains") => void; onRemove: (i: number) => void }) {
  return (
    <Draggable draggableId={`trigger-${index}`} index={index}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 group">
          <div {...provided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab shrink-0"><GripVertical size={18} /></div>
          <div className="flex-1 relative min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500"><Zap size={14} /></span>
            <input 
              value={trigger.keyword} 
              onChange={(e) => onChange(index, e.target.value)} 
              placeholder="e.g. price" 
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm text-gray-900 placeholder:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm" 
            />
          </div>
          
          {/* MATCH MODE TOGGLE */}
          <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 p-0.5 shrink-0">
            <button
              onClick={() => onChange(index, trigger.keyword, "contains")}
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${trigger.matchMode === "contains" ? "bg-blue-500 text-white shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              title="Contains (e.g. 'price' matches 'what is the price?')"
            >
              <Type size={12} />
            </button>
            <button
              onClick={() => onChange(index, trigger.keyword, "exact")}
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${trigger.matchMode === "exact" ? "bg-purple-500 text-white shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
              title="Exact Match (e.g. 'price' ONLY matches 'price')"
            >
              <Crosshair size={12} />
            </button>
          </div>

          <button onClick={() => onRemove(index)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"><Trash2 size={14} /></button>
        </div>
      )}
    </Draggable>
  );
}

/* ────────────────────────────────────────────
   VISUAL FLOW NODE (RECURSIVE BRANCHING)
   ──────────────────────────────────────────── */
function FlowNode({ 
  step, 
  allSteps, 
  onUpdateStep, 
  onAddStep, 
  onDeleteStep 
}: { 
  step: Step; 
  allSteps: Record<string, Step>; 
  onUpdateStep: (id: string, data: Step) => void; 
  onAddStep: (parentStepId: string, buttonId: string) => void; 
  onDeleteStep: (id: string) => void;
}) {
  const handleMsgChange = (msg: string) => {
    onUpdateStep(step.id, { ...step, message: msg });
  };

  const handleButtonLabelChange = (btnId: string, label: string) => {
    const updatedButtons = step.buttons.map(b => b.id === btnId ? { ...b, label } : b);
    onUpdateStep(step.id, { ...step, buttons: updatedButtons });
  };

  const handleButtonLinkChange = (btnId: string, nextId: string | null) => {
    if (nextId === "NEW") {
      onAddStep(step.id, btnId);
    } else {
      const updatedButtons = step.buttons.map(b => b.id === btnId ? { ...b, nextStepId: nextId } : b);
      onUpdateStep(step.id, { ...step, buttons: updatedButtons });
    }
  };

  const addButton = () => {
    if (step.buttons.length >= 3) return;
    const newBtn: Button = { id: uid(), label: "", nextStepId: null };
    onUpdateStep(step.id, { ...step, buttons: [...step.buttons, newBtn] });
  };

  const removeButton = (btnId: string) => {
    onUpdateStep(step.id, { ...step, buttons: step.buttons.filter(b => b.id !== btnId) });
  };

  return (
    <div className="flex flex-col items-center relative">
      {/* The Step Card */}
      <div className="w-72 sm:w-80 bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden z-10 hover:shadow-xl transition-all duration-200 group">
        <div className="p-3 sm:p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2 text-emerald-700">
            <MessageSquare size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">Message Step</span>
          </div>
          <button onClick={() => onDeleteStep(step.id)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
        </div>
        
        <div className="p-3 sm:p-4 space-y-3">
          <textarea value={step.message} onChange={(e) => handleMsgChange(e.target.value)} placeholder="Type auto-reply message..." rows={3} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all resize-none" />
          
          {/* Buttons Section */}
          <div className="space-y-2">
            {step.buttons.map(btn => (
              <div key={btn.id} className="bg-blue-50/50 border border-blue-200 rounded-xl p-2.5 space-y-2 group/btn hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-2">
                  <MousePointerClick size={14} className="text-blue-500 shrink-0" />
                  <input value={btn.label} onChange={(e) => handleButtonLabelChange(btn.id, e.target.value)} placeholder="Button Text" className="flex-1 min-w-0 bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 shadow-sm" />
                  <button onClick={() => removeButton(btn.id)} className="opacity-0 group-hover/btn:opacity-100 text-gray-400 hover:text-red-500 transition-colors shrink-0"><X size={14} /></button>
                </div>
                <select value={btn.nextStepId || ""} onChange={(e) => handleButtonLinkChange(btn.id, e.target.value || null)} className="w-full bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-[11px] text-gray-600 focus:outline-none focus:border-blue-400 shadow-sm">
                  <option value="">✋ End Flow Here</option>
                  <option value="NEW">➕ Create Next Step</option>
                  {Object.values(allSteps).map(s => s.id !== step.id && (
                    <option key={s.id} value={s.id}>🔗 Link to: &quot;{s.message.substring(0, 15)}...&quot;</option>
                  ))}
                </select>
              </div>
            ))}
            {step.buttons.length < 3 && (
              <button onClick={addButton} className="w-full py-2 border border-dashed border-blue-300 rounded-xl text-xs font-semibold text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 bg-blue-50/30">
                <Plus size={12} /> Add Interactive Button
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The Branches below the card */}
      {step.buttons.length > 0 && (
        <div className="flex justify-center gap-6 sm:gap-12 pt-4 relative">
          <div className="absolute top-0 left-1/2 w-px h-4 bg-gray-300 transform -translate-x-1/2"></div>
          {step.buttons.length > 1 && (
            <div className="absolute top-4 left-1/4 w-1/2 h-px bg-gray-300 transform -translate-y-1/2"></div>
          )}

          {step.buttons.map(btn => (
            <div key={btn.id} className="flex flex-col items-center relative pt-4">
              <div className="absolute top-0 left-1/2 w-px h-4 bg-gray-300 transform -translate-x-1/2"></div>
              <div className="px-3 sm:px-4 py-1.5 bg-blue-600 text-white rounded-full text-[11px] font-bold shadow-md border border-blue-700 mb-3 max-w-[100px] sm:max-w-[180px] truncate text-center">
                {btn.label || "Unnamed"}
              </div>
              <div className="w-px h-4 bg-blue-300"></div>
              {btn.nextStepId && allSteps[btn.nextStepId] ? (
                <FlowNode step={allSteps[btn.nextStepId]} allSteps={allSteps} onUpdateStep={onUpdateStep} onAddStep={onAddStep} onDeleteStep={onDeleteStep} />
              ) : (
                <div className="w-36 sm:w-48 h-28 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-400 bg-white/50 backdrop-blur-sm mt-2 p-2">
                  <span className="text-2xl mb-1">🛑</span>
                  <span className="text-[11px] font-semibold text-gray-500 text-center">End of Flow</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────
   WORKFLOW BUILDER FORM (INFINITE CANVAS + FULLSCREEN)
   ──────────────────────────────────────────── */
function WorkflowForm({ editId, initialData, onSave, onCancel }: { editId: string | null; initialData: Workflow; onSave: (wf: Workflow) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  const [triggers, setTriggers] = useState<Trigger[]>(initialData.triggers);
  const [steps, setSteps] = useState<Record<string, Step>>(initialData.steps);
  const [rootStepId, setRootStepId] = useState<string>(initialData.rootStepId);

  const handleTriggerChange = (index: number, val: string, mode?: "exact" | "contains") => {
    const newTriggers = [...triggers];
    newTriggers[index] = { 
      keyword: val, 
      matchMode: mode || newTriggers[index].matchMode || "contains" 
    };
    setTriggers(newTriggers);
  };

  const addTrigger = () => setTriggers([...triggers, { keyword: "", matchMode: "contains" }]);
  const removeTrigger = (index: number) => setTriggers(triggers.filter((_, i) => i !== index));

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    const newTriggers = Array.from(triggers);
    const [moved] = newTriggers.splice(source.index, 1);
    newTriggers.splice(destination.index, 0, moved);
    setTriggers(newTriggers);
  };

  const updateStep = (id: string, data: Step) => {
    setSteps(prev => ({ ...prev, [id]: data }));
  };

  const addStep = (parentStepId: string, buttonId: string) => {
    const newStepId = uid();
    const newStep: Step = { id: newStepId, message: "", buttons: [] };
    setSteps(prev => {
      const parentStep = { ...prev[parentStepId] };
      parentStep.buttons = parentStep.buttons.map(b => b.id === buttonId ? { ...b, nextStepId: newStepId } : b);
      return { ...prev, [parentStepId]: parentStep, [newStepId]: newStep };
    });
  };

  const deleteStep = (id: string) => {
    if (id === rootStepId) return;
    setSteps(prev => {
      const newSteps = { ...prev };
      delete newSteps[id];
      Object.keys(newSteps).forEach(stepId => {
        newSteps[stepId] = { ...newSteps[stepId], buttons: newSteps[stepId].buttons.map(b => b.nextStepId === id ? { ...b, nextStepId: null } : b) };
      });
      return newSteps;
    });
  };

  const isValid = triggers.some(t => t.keyword.trim()) && steps[rootStepId]?.message.trim();

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className={`overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
          isFullScreen 
            ? 'fixed inset-0 z-50 bg-white' 
            : 'bg-white rounded-2xl border border-gray-200 shadow-sm relative h-[80vh]'
        }`}
      >
        
        {/* Floating Top Header */}
        <div className="p-3 sm:p-4 border-b border-gray-100 bg-white z-30 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${editId ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}><Workflow size={16} /></div>
            <h2 className="text-sm font-bold text-gray-900">{editId ? "Edit Workflow" : "New Workflow"}</h2>
          </div>
          
          <div className="flex items-center gap-2">
            {editId && (
              <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors hidden sm:block">
                Cancel
              </button>
            )}
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)} 
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-gray-200"
              title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            >
              {isFullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>

        {/* Infinite Canvas Container */}
        <div ref={canvasRef} className="flex-1 overflow-auto bg-gray-50/80 bg-dots p-4 sm:p-8">
          <div className="inline-flex flex-col items-center min-w-full py-4 px-4 sm:px-12">
            
            {/* Triggers Section */}
            <div className="border border-amber-200/50 bg-white rounded-2xl p-4 sm:p-5 w-full max-w-md shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2"><Zap size={14} /> Triggers</h3>
                <button onClick={addTrigger} className="text-xs font-semibold text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors"><Plus size={12} /> Add</button>
              </div>
              
              {/* Legend for Match Modes */}
              <div className="flex gap-4 mb-3 px-1">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <div className="w-4 h-4 rounded bg-blue-500 text-white flex items-center justify-center"><Type size={8} /></div>
                  Contains
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <div className="w-4 h-4 rounded bg-purple-500 text-white flex items-center justify-center"><Crosshair size={8} /></div>
                  Exact Match
                </div>
              </div>

              <Droppable droppableId="triggers" type="TRIGGERS">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 min-h-[40px]">
                    {triggers.map((trigger, index) => <TriggerItem key={`trigger-${index}`} trigger={trigger} index={index} onChange={handleTriggerChange} onRemove={removeTrigger} />)}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>

            {/* Arrow Down */}
            <div className="flex flex-col items-center py-2 text-gray-300">
              <div className="w-px h-8 bg-gray-300"></div>
              <ArrowDown size={16} className="text-gray-400" />
            </div>

            {/* Flow Steps Section */}
            {rootStepId && steps[rootStepId] ? (
              <FlowNode step={steps[rootStepId]} allSteps={steps} onUpdateStep={updateStep} onAddStep={addStep} onDeleteStep={deleteStep} />
            ) : (
              <div className="text-red-400 text-sm bg-white px-4 py-2 rounded-lg shadow">Error: Root step missing</div>
            )}

          </div>
        </div>

        {/* Floating Save Button */}
        <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30">
          <button onClick={() => onSave({ _id: editId || "", triggers, steps, rootStepId })} disabled={!isValid} className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200 hover:shadow-xl hover:scale-105">
            {editId ? "Update Workflow" : "Create Workflow"}
          </button>
        </div>
      </div>
    </DragDropContext>
  );
}

/* ────────────────────────────────────────────
   WORKFLOW CARD (LIST)
   ──────────────────────────────────────────── */
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
                  t.matchMode === "exact" 
                    ? "bg-purple-50 border-purple-200 text-purple-700" 
                    : "bg-amber-50 border-amber-200 text-amber-700"
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
                {rootStep.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {rootStep.buttons.map(b => (
                      <span key={b.id} className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-[10px] font-semibold text-blue-700 flex items-center gap-1">
                        <MousePointerClick size={8} /> {b.label || "Button"}
                      </span>
                    ))}
                  </div>
                )}
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

/* ────────────────────────────────────────────
   MAIN HOME PAGE
   ──────────────────────────────────────────── */
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
      steps: { [rootId]: { id: rootId, message: "", buttons: [] } },
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
      steps: { [rootId]: { id: rootId, message: actions[0]?.message || "", buttons: [] } },
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
    } catch { showToast("Failed to load workflows", "error"); }
  };

  useEffect(() => {
    if (status === "authenticated") {
      load();
    } else if (status === "unauthenticated") {
      window.location.href = "/signin";
    }
  }, [status]);

  const startCreating = () => {
    setEditId("new");
    setEditData(getEmptyWorkflow());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (wfData: Workflow) => {
    const cleanTriggers = wfData.triggers.filter(t => t.keyword.trim());
    if (cleanTriggers.length === 0 || !wfData.steps[wfData.rootStepId]?.message.trim()) {
      showToast("Need at least one trigger and a root message", "error"); return;
    }
    try {
      const payload = { triggers: cleanTriggers, steps: wfData.steps, rootStepId: wfData.rootStepId };

      if (editId && editId !== "new") {
        await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, ...payload }) });
        showToast("Workflow updated!");
      } else {
        await fetch("/api/workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        showToast("Workflow created!");
      }
      setEditId(null);
      setEditData(null);
      load();
    } catch { showToast("Something went wrong", "error"); }
  };

  const remove = async (id: string) => {
    try { await fetch(`/api/workflow/${id}`, { method: "DELETE" }); setWorkflows(prev => prev.filter(wf => wf._id !== id)); showToast("Deleted"); } catch { showToast("Delete failed", "error"); }
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

  const filteredWorkflows = workflows.filter(wf => wf.triggers.some(t => t.keyword.toLowerCase().includes(searchQuery.toLowerCase())) || Object.values(wf.steps).some(s => s.message.toLowerCase().includes(searchQuery.toLowerCase())));

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
        @keyframes slide-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        .bg-dots { background-image: radial-gradient(#d1d5db 1px, transparent 1px); background-size: 24px 24px; }
      `}</style>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <Sidebar />

      <main className="ml-0 md:ml-64 min-h-screen flex flex-col">
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          
          {/* Responsive Header */}
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
                <button onClick={startCreating} className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-sm whitespace-nowrap">
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
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-xs font-semibold text-gray-500">{workflows.length} active workflow{workflows.length !== 1 ? "s" : ""}</span></div>
              {searchQuery && <span className="text-xs text-gray-400">{filteredWorkflows.length} results for &quot;{searchQuery}&ldquo;</span>}
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