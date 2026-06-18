/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/immutability */
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { Loader2, Plus, Trash2, FileText, Save } from "lucide-react";
import { toast } from "react-toastify";

export default function FormsPage() {
  const { status } = useSession();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<any[]>([]);

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

  const handleSave = async () => {
    if (!name || fields.length === 0) return toast.error("Add name and at least one field");
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fields })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Form created!");
        setForms([data.form, ...forms]);
        setName("");
        setFields([]);
      }
    } catch (err) { toast.error("Failed to save form"); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="md:ml-64 p-8">
        <h1 className="text-2xl font-bold mb-6">Form Builder</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Builder */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Form Name (e.g. Lead Gen Form)" className="w-full p-3 mb-4 border rounded-lg" />
            
            {fields.map((field) => (
              <div key={field.id} className="border p-4 rounded-lg mb-4 bg-gray-50">
                <div className="flex justify-between mb-2">
                  <input type="text" value={field.label} onChange={(e) => updateField(field.id, "label", e.target.value)} placeholder="Field Label (e.g. What is your name?)" className="flex-1 p-2 border rounded mr-2" />
                  <button onClick={() => removeField(field.id)} className="text-red-500"><Trash2 size={18} /></button>
                </div>
                <div className="flex gap-2">
                  <select value={field.type} onChange={(e) => updateField(field.id, "type", e.target.value)} className="p-2 border rounded">
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                    <option value="textarea">Long Text</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={field.required} onChange={(e) => updateField(field.id, "required", e.target.checked)} /> Required
                  </label>
                </div>
              </div>
            ))}

            <button onClick={addField} className="w-full p-3 border-2 border-dashed rounded-lg text-gray-600 hover:bg-gray-100 mb-4 flex items-center justify-center gap-2"><Plus size={16} /> Add Field</button>
            <button onClick={handleSave} className="w-full p-3 bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-600"><Save size={16} /> Save Form</button>
          </div>

          {/* List */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h2 className="text-lg font-bold mb-4">Your Forms</h2>
            {forms.length === 0 ? <p className="text-gray-500 text-sm">No forms created yet.</p> : (
              <div className="space-y-3">
                {forms.map(f => (
                  <div key={f._id} className="p-4 border rounded-lg flex items-center gap-3">
                    <FileText className="text-blue-500" />
                    <div>
                      <p className="font-semibold text-sm">{f.name}</p>
                      <p className="text-xs text-gray-500">{f.fields.length} fields</p>
                    </div>
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
