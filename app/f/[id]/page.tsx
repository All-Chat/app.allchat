/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";

export default function PublicForm() {
  const { id } = useParams();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/forms`)
      .then(res => res.json())
      .then(data => {
        const foundForm = data.forms?.find((f: any) => f._id === id);
        if (foundForm) setForm(foundForm);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: id, data: responses })
      });
      setSubmitted(true);
    } catch (err) {
      alert("Submission failed");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!form) return <div className="min-h-screen flex items-center justify-center">Form not found.</div>;
  if (submitted) return <div className="min-h-screen flex items-center justify-center flex-col gap-2"><h1 className="text-2xl font-bold text-emerald-600">Thank You!</h1><p>Your response has been recorded.</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold mb-6">{form.name}</h1>
        {form.fields.map((field: any) => (
          <div key={field.id}>
            <label className="block text-sm font-semibold mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
            {field.type === "textarea" ? (
              <textarea required={field.required} onChange={(e) => setResponses({ ...responses, [field.label]: e.target.value })} className="w-full p-3 border rounded-lg" rows={4} />
            ) : (
              <input type={field.type} required={field.required} onChange={(e) => setResponses({ ...responses, [field.label]: e.target.value })} className="w-full p-3 border rounded-lg" />
            )}
          </div>
        ))}
        <button type="submit" disabled={submitting} className="w-full p-3 bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-600">
          {submitting ? <Loader2 className="animate-spin" /> : <Send size={16} />} Submit Form
        </button>
      </form>
    </div>
  );
}
