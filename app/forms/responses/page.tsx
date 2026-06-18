/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { Loader2, FileText, Phone, ArrowLeft, ClipboardList, User } from "lucide-react";

export default function FormResponsesPage() {
  const { status } = useSession();
  const [forms, setForms] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/forms").then(r => r.json()),
        fetch("/api/forms/responses").then(r => r.json())
      ]).then(([formsData, resData]) => {
        setForms(formsData.forms || []);
        setResponses(resData.responses || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
    if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-emerald-600" /></div>;

  const filteredResponses = responses.filter(r => r.formId === selectedFormId);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="md:ml-64 p-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><ClipboardList className="text-teal-600" /> Form Responses</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: List of Forms */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Your Forms</h2>
            {forms.length === 0 ? <p className="text-sm text-gray-400">No forms created yet.</p> : (
              <div className="space-y-2">
                {forms.map(f => {
                  const count = responses.filter(r => r.formId === f._id).length;
                  return (
                    <div 
                      key={f._id} 
                      onClick={() => { setSelectedFormId(f._id); setSelectedResponse(null); }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedFormId === f._id ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="text-teal-500" size={16} />
                        <p className="font-semibold text-sm text-gray-800 flex-1">{f.name}</p>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Column 2: List of Phone Numbers for selected form */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Submissions</h2>
            {!selectedFormId ? <p className="text-sm text-gray-400">Select a form to view submissions.</p> : 
             filteredResponses.length === 0 ? <p className="text-sm text-gray-400">No submissions yet for this form.</p> : (
              <div className="space-y-2">
                {filteredResponses.map(res => (
                  <div 
                    key={res._id} 
                    onClick={() => setSelectedResponse(res)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedResponse?._id === res._id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="text-gray-400" size={16} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800 truncate">{res.phone}</p>
                        <p className="text-[10px] text-gray-400">{new Date(res.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: Details of selected response */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Details</h2>
            {!selectedResponse ? <p className="text-sm text-gray-400">Select a submission to view details.</p> : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                  <Phone className="text-gray-400" size={16} />
                  <p className="font-bold text-gray-900">{selectedResponse.phone}</p>
                </div>
                {Object.entries(selectedResponse.data).map(([key, value]: any) => (
                  <div key={key} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{key}</p>
                    <p className="text-sm text-gray-800 font-medium">{String(value)}</p>
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
