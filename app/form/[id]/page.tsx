/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Check, Loader2, ClipboardList, Send } from "lucide-react";

export default function DynamicFormPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const stepId = params.id as string;
  const phone = searchParams.get("phone") || "";

  const [stepData, setStepData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!stepId) return;

    // Fetch the form configuration from the database
    fetch(`/api/form/${stepId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.step) {
          setStepData(data.step);
          // Initialize empty state for each field
          const initialData: Record<string, string> = {};
          data.step.metadata?.formFields?.forEach((field: any) => {
            initialData[field.id] = "";
          });
          setFormData(initialData);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [stepId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await fetch(`/api/form/${stepId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, formData }),
      });
      
      setSuccess(true);
    } catch (error) {
      console.error("Submission failed", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md w-full border border-gray-100">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Success!</h1>
          <p className="text-gray-500">Thank you. Your details have been securely submitted. You can close this window and return to WhatsApp.</p>
        </div>
      </div>
    );
  }

  if (!stepData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md w-full">
          <h1 className="text-xl font-bold text-red-600">Form Not Found</h1>
          <p className="text-gray-500 mt-2">This form may have been deleted or the link is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="p-3 bg-fuchsia-50 rounded-xl mb-3">
            <ClipboardList className="w-6 h-6 text-fuchsia-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{stepData.metadata?.formTitle || "Form"}</h1>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {stepData.metadata?.formFields?.map((field: any) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label || "Field"}
              </label>
              <input
                type={field.type || "text"}
                required
                value={formData[field.id] || ""}
                onChange={(e) => setFormData({ ...formData, [field.id]: e.target.value })}
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none transition-all"
              />
            </div>
          ))}
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white p-3.5 rounded-xl font-semibold hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-6"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {stepData.metadata?.submitButtonText || "Submit"}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
