/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { 
  Loader2, FileText, Phone, ClipboardList, User, 
  Download, FileSpreadsheet, CheckCircle2, Square 
} from "lucide-react";
import { toast } from "react-toastify";

export default function FormResponsesPage() {
  const { status } = useSession();
  const [forms, setForms] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<any | null>(null);
  const [selectedResponseIds, setSelectedResponseIds] = useState<string[]>([]);

  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/forms").then(r => r.json()),
        fetch("/api/forms/responses").then(r => r.json())
      ]).then(([formsData, resData]) => {
        setForms(formsData.forms || []);
        // FILTER OUT INCOMPLETE FORMS
        setResponses((resData.responses || []).filter((r: any) => r.status === "complete"));
        setLoading(false);
      }).catch(() => setLoading(false));
    }
    if (status === "unauthenticated") window.location.href = "/signin";
  }, [status]);

  if (loading) return (
    <div className="flex min-h-screen bg-slate-50 items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
    </div>
  );

  const filteredResponses = responses.filter(r => r.formId === selectedFormId);

  // ==========================================
  // EXCEL/CSV DOWNLOAD LOGIC
  // ==========================================
  const downloadCSV = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const escapeCsvCell = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportFullReport = () => {
    if (responses.length === 0) return toast.error("No responses to export");
    
    const allFieldLabels = new Set<string>();
    forms.forEach(f => f.fields.forEach((field: any) => allFieldLabels.add(field.label)));
    const headers = ["Form Name", "Phone Number", "Submission Date", ...Array.from(allFieldLabels)];
    
    const rows = responses.map(res => {
      const formName = forms.find(f => f._id === res.formId)?.name || "Unknown";
      const row = [formName, res.phone, new Date(res.createdAt).toLocaleString()];
      allFieldLabels.forEach(label => {
        row.push(res.data[label] || "");
      });
      return row.map(escapeCsvCell).join(",");
    });

    downloadCSV([headers.map(escapeCsvCell).join(","), ...rows].join("\n"), "Full_Form_Report.csv");
    toast.success("Full report downloaded!");
  };

  const exportFormReport = () => {
    if (!selectedFormId || filteredResponses.length === 0) return toast.error("No responses for this form");
    const form = forms.find(f => f._id === selectedFormId);
    const headers = ["Phone Number", "Submission Date", ...form.fields.map((f: any) => f.label)];
    
    const rows = filteredResponses.map(res => {
      const row = [res.phone, new Date(res.createdAt).toLocaleString()];
      form.fields.forEach((field: any) => {
        row.push(res.data[field.label] || "");
      });
      return row.map(escapeCsvCell).join(",");
    });

    downloadCSV([headers.map(escapeCsvCell).join(","), ...rows].join("\n"), `${form.name}_Report.csv`);
    toast.success(`${form.name} report downloaded!`);
  };

  const exportSelectedSubmissions = () => {
    if (selectedResponseIds.length === 0) return toast.error("Select at least one submission to export");
    if (!selectedFormId) return;
    
    const form = forms.find(f => f._id === selectedFormId);
    const headers = ["Phone Number", "Submission Date", ...form.fields.map((f: any) => f.label)];
    
    const selectedResps = filteredResponses.filter(r => selectedResponseIds.includes(r._id));
    const rows = selectedResps.map(res => {
      const row = [res.phone, new Date(res.createdAt).toLocaleString()];
      form.fields.forEach((field: any) => {
        row.push(res.data[field.label] || "");
      });
      return row.map(escapeCsvCell).join(",");
    });

    downloadCSV([headers.map(escapeCsvCell).join(","), ...rows].join("\n"), `Selected_Submissions.csv`);
    toast.success("Selected submissions downloaded!");
  };

  const exportSingleSubmission = (res: any) => {
    const formName = forms.find(f => f._id === res.formId)?.name || "Form";
    const headers = ["Field", "Response", "Phone", "Date"];
    const rows = [
      ["Form Name", formName, "", ""],
      ["Phone Number", res.phone, "", ""],
      ["Submission Date", new Date(res.createdAt).toLocaleString(), "", ""],
      ...Object.entries(res.data).map(([key, value]: any) => [key, String(value), "", ""])
    ];

    downloadCSV([headers.map(escapeCsvCell).join(","), ...rows.map(r => r.map(escapeCsvCell).join(",")).join("\n")].join("\n"), `Submission_${res.phone}.csv`);
    toast.success("Submission details downloaded!");
  };

  const toggleSelection = (id: string) => {
    setSelectedResponseIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <Sidebar />
      
      <div className="md:ml-64 p-4 sm:p-6 lg:p-10 overflow-y-auto min-h-screen">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Gradient Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1] rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-teal-100 shadow-lg shadow-teal-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#5EEAD4]/30 rounded-full blur-3xl"></div>
            <div className="relative flex items-center gap-3 z-10">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white flex items-center justify-center shadow-md">
                <ClipboardList className="text-teal-600" size={20} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-teal-900">Form Responses</h1>
                <p className="text-teal-700/80 text-xs sm:text-sm mt-1 font-medium">View and download all user submissions.</p>
              </div>
            </div>
            
            <button 
              onClick={exportFullReport}
              className="relative z-10 bg-white text-teal-700 px-5 py-3 rounded-xl font-bold text-sm hover:bg-teal-50 transition-all shadow-sm border border-teal-100 flex items-center gap-2"
            >
              <FileSpreadsheet size={16} /> Download Full Report
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1: List of Forms */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm h-fit">
              <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FileText size={12} className="text-teal-500" /> Your Forms
              </h2>
              {forms.length === 0 ? <p className="text-sm text-slate-400">No forms created yet.</p> : (
                <div className="space-y-2">
                  {forms.map(f => {
                    const count = responses.filter(r => r.formId === f._id).length;
                    return (
                      <div 
                        key={f._id} 
                        onClick={() => { setSelectedFormId(f._id); setSelectedResponse(null); setSelectedResponseIds([]); }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedFormId === f._id ? 'bg-teal-50 border-teal-200 shadow-sm' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className={selectedFormId === f._id ? "text-teal-600" : "text-slate-400"} size={16} />
                          <p className="font-semibold text-sm text-slate-800 flex-1 truncate">{f.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${selectedFormId === f._id ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Column 2: List of Submissions */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm h-fit">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <User size={12} className="text-blue-500" /> Submissions
                </h2>
                {selectedFormId && filteredResponses.length > 0 && (
                  <div className="flex gap-2">
                    {selectedResponseIds.length > 0 && (
                      <button onClick={exportSelectedSubmissions} className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 hover:bg-blue-100 transition-colors flex items-center gap-1">
                        <Download size={10} /> Export Selected ({selectedResponseIds.length})
                      </button>
                    )}
                    <button onClick={exportFormReport} className="text-[10px] font-bold bg-slate-50 text-slate-600 px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-100 transition-colors flex items-center gap-1">
                      <FileSpreadsheet size={10} /> Export All
                    </button>
                  </div>
                )}
              </div>

              {!selectedFormId ? <p className="text-sm text-slate-400 py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">Select a form to view submissions.</p> : 
               filteredResponses.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">No submissions yet for this form.</p> : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {filteredResponses.map(res => (
                    <div 
                      key={res._id} 
                      className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${selectedResponse?._id === res._id ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                    >
                      <div onClick={() => toggleSelection(res._id)} className="cursor-pointer p-1">
                        {selectedResponseIds.includes(res._id) ? 
                          <CheckCircle2 className="text-blue-500" size={18} /> : 
                          <Square className="text-slate-300" size={18} />
                        }
                      </div>
                      <div 
                        className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
                        onClick={() => setSelectedResponse(res)}
                      >
                        <User className="text-slate-400" size={16} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800 truncate">{res.phone}</p>
                          <p className="text-[10px] text-slate-400">{new Date(res.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Column 3: Details of selected response */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm h-fit lg:sticky lg:top-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <ClipboardList size={12} className="text-indigo-500" /> Details
                </h2>
                {selectedResponse && (
                  <button 
                    onClick={() => exportSingleSubmission(selectedResponse)}
                    className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                  >
                    <Download size={10} /> Export
                  </button>
                )}
              </div>

              {!selectedResponse ? <p className="text-sm text-slate-400 py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">Select a submission to view details.</p> : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                      {selectedResponse.phone.slice(-2)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{selectedResponse.phone}</p>
                      <p className="text-[10px] text-slate-400">{new Date(selectedResponse.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  {Object.entries(selectedResponse.data).map(([key, value]: any) => (
                    <div key={key} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{key}</p>
                      <p className="text-sm text-slate-800 font-medium break-words">{String(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
