/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/immutability */
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { 
  Loader2, Plus, Trash2, FileText, Save, Sparkles, Type, Mail, Hash, AlignLeft, 
  Eye, Pencil, X, AlertCircle 
} from "lucide-react";
import { toast } from "react-toastify";

export default function FormsPage() {
  const { status } = useSession();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<any[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingForm, setViewingForm] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") fetchForms();
    if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  const fetchForms = async () => {
    try {
      const res = await fetch("/api/forms");
      const data = await res.json();
      setForms(data.forms || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const addField = () => {
    setFields([...fields, { id: Math.random().toString(36).substr(2, 9), label: "", type: "text", required: false, options: [] }]);
  };

  const updateField = (id: string, key: string, value: any) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName("");
    setFields([]);
  };

  const handleEdit = (form: any) => {
    setEditingId(form._id);
    setName(form.name);
    setFields(form.fields);
    setViewingForm(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setForms(forms.filter(f => f._id !== id));
        toast.success("Form deleted successfully");
        setDeleteConfirm(null);
      }
    } catch (err) {
      toast.error("Failed to delete form");
    }
  };

  const handleSave = async () => {
    if (!name || fields.length === 0) return toast.error("Add a name and at least one field");
    try {
      if (editingId) {
        // Update existing form
        const res = await fetch(`/api/forms/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, fields })
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Form updated successfully!");
          setForms(forms.map(f => f._id === editingId ? data.form : f));
          handleCancelEdit();
        } else {
          toast.error(data.error || "Failed to update form");
        }
      } else {
        // Create new form
        const res = await fetch("/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, fields })
        });
        const data = await res.json();
        if (data.success) {
          toast.success("Form created successfully!");
          setForms([data.form, ...forms]);
          setName("");
          setFields([]);
        } else {
          toast.error(data.error || "Failed to save form");
        }
      }
    } catch (err) { 
      toast.error("Failed to save form"); 
    }
  };

  const getFieldIcon = (type: string) => {
    switch (type) {
      case "email": return <Mail size={14} className="text-slate-400" />;
      case "number": return <Hash size={14} className="text-slate-400" />;
      case "textarea": return <AlignLeft size={14} className="text-slate-400" />;
      default: return <Type size={14} className="text-slate-400" />;
    }
  };

  if (loading) return (
    <div className="flex min-h-screen bg-slate-50 items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />
      
      <div className="md:ml-64 p-4 sm:p-6 lg:p-10 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Gradient Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#ECFDF5] to-[#D1FAE5] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-lg shadow-emerald-100/50">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#6EE7B7]/30 rounded-full blur-3xl"></div>
            <div className="relative flex items-center gap-3 z-10">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white flex items-center justify-center shadow-md">
                <Sparkles className="text-emerald-600" size={20} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-emerald-900">Form Builder</h1>
                <p className="text-emerald-700/80 text-xs sm:text-sm mt-1 font-medium">Create custom forms to collect user data directly in WhatsApp chats.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8">
            
            {/* Form Builder (Left Column) */}
            <div className="lg:col-span-3 bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm space-y-6">
              
              {editingId && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2"><Pencil size={14} /> Editing existing form</span>
                  <button onClick={handleCancelEdit} className="bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded-lg transition-colors">Cancel Edit</button>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest">Form Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. Lead Generation Form" 
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 focus:bg-white transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)]" 
                />
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <Type size={12} className="text-indigo-500" /> Form Fields
                </label>
                
                {fields.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    <p className="text-sm text-slate-400 font-medium">No fields added yet.</p>
                    <p className="text-xs text-slate-300 mt-1">Click below to start building your form.</p>
                  </div>
                )}

                {fields.map((field, index) => (
                  <div key={field.id} className="border border-slate-200 p-4 rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">FIELD {index + 1}</span>
                      <button 
                        onClick={() => removeField(field.id)} 
                        className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                          {getFieldIcon(field.type)}
                        </span>
                        <input 
                          type="text" 
                          value={field.label} 
                          onChange={(e) => updateField(field.id, "label", e.target.value)} 
                          placeholder="Field Label (e.g. What is your name?)" 
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all" 
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-3 items-center pl-1">
                      <select 
                        value={field.type} 
                        onChange={(e) => updateField(field.id, "type", e.target.value)} 
                        className="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
                      >
                        <option value="text">Short Text</option>
                        <option value="email">Email</option>
                        <option value="number">Number</option>
                        <option value="textarea">Long Text</option>
                      </select>
                      
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={field.required} 
                          onChange={(e) => updateField(field.id, "required", e.target.checked)} 
                          className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400"
                        /> 
                        Required
                      </label>
                    </div>
                  </div>
                ))}

                <button 
                  onClick={addField} 
                  className="w-full p-3.5 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:bg-indigo-50/50 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                >
                  <Plus size={16} /> Add New Field
                </button>
              </div>

              <button 
                onClick={handleSave} 
                className="w-full p-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl flex items-center justify-center gap-2 hover:from-emerald-600 hover:to-teal-600 transition-all font-bold shadow-md shadow-emerald-200 hover:shadow-lg active:scale-[0.98]"
              >
                <Save size={18} /> {editingId ? "Update Form" : "Save Form"}
              </button>
            </div>

            {/* Forms List (Right Column) */}
            <div className="lg:col-span-2 bg-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm h-fit lg:sticky lg:top-8">
              <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest mb-5 flex items-center gap-2">
                <FileText size={12} className="text-blue-500" /> Your Saved Forms
              </h2>
              
              {forms.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <FileText className="text-slate-300" size={24} />
                  </div>
                  <p className="font-bold text-slate-700 text-sm">No forms yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[200px] mx-auto">Start by creating your first form on the left.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {forms.map(f => (
                    <div key={f._id} className="p-4 border border-slate-200 rounded-xl bg-white hover:shadow-md hover:border-emerald-200 transition-all group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <FileText size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">{f.name}</p>
                          <p className="text-xs text-slate-400 font-medium">{f.fields.length} fields configured</p>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                        <button 
                          onClick={() => setViewingForm(f)} 
                          className="flex-1 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Eye size={12} /> View
                        </button>
                        <button 
                          onClick={() => handleEdit(f)} 
                          className="flex-1 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm(f._id)} 
                          className="flex-1 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>

                      {/* Delete Confirmation */}
                      {deleteConfirm === f._id && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                          <p className="text-[10px] font-bold text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> Sure?</p>
                          <div className="flex gap-1">
                            <button onClick={() => setDeleteConfirm(null)} className="text-[10px] font-bold bg-white text-slate-600 px-2 py-1 rounded border border-slate-200">No</button>
                            <button onClick={() => handleDelete(f._id)} className="text-[10px] font-bold bg-red-500 text-white px-2 py-1 rounded">Yes, Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
          </div>
        </div>
      </div>

      {/* View Form Modal */}
      {viewingForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setViewingForm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="text-blue-500" /> {viewingForm.name}
              </h3>
              <button onClick={() => setViewingForm(null)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Form Preview</p>
              {viewingForm.fields.map((f: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    {getFieldIcon(f.type)} {f.label} 
                    {f.required && <span className="text-red-500 text-[10px]">*</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{f.type}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
