/* eslint-disable react-hooks/set-state-in-effect */

/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Sidebar from "@/components/Sidebar";

import AddFollowUpReminder from "@/components/AddFollowUpReminder";

import ContactActivityHistory from "@/components/ContactActivityHistory";

import {

  Plus,
  Play,
  Pause,

  Search,

  Users,

  Phone,

  Pencil,

  Trash2,

  ArrowRight,

  X,

  Tag,

  Settings,

  Loader2,

  Flame,

  Snowflake,

  Heart,

  Sparkles,

  Target,

  CalendarDays,

  Trophy,

  Leaf,

  FileText,

  PhoneCall,

  Tag as TagIcon,

  Download,

  FileSpreadsheet,

  CheckCircle2,

  AlertCircle,

  RefreshCw,

} from "lucide-react";

import { toast } from "react-toastify";

type Contact = {

  _id: string;

  name: string;

  phone: string;

  notes?: string;

  source?: "WhatsApp" | "Instagram" | "Facebook" | "Other";

  customSource?: string;

};

type LeadType = {

  _id: string;

  name: string;

  keywords: string[];

  contacts: Contact[];

  createdAt?: string;

};

const emptyContactForm = {

  name: "",

  phone: "",

  notes: "",

  source: "WhatsApp" as "WhatsApp" | "Instagram" | "Facebook" | "Other",

  customSource: "",

};

/* Automatically select an icon according to the Lead Type name */

function getLeadIcon(name: string) {

  const value = name.toLowerCase();

  if (/hot|urgent|priority/.test(value)) {

    return { emoji: "🔥", label: "Hot Lead" };

  }

  if (/cold|not interested|inactive/.test(value)) {

    return { emoji: "❄️", label: "Cold Lead" };

  }

  if (/warm/.test(value)) {

    return { emoji: "🌤️", label: "Warm Lead" };

  }

  if (/interested|interest|engaged/.test(value)) {

    return { emoji: "❤️", label: "Interested" };

  }

  if (/new|fresh/.test(value)) {

    return { emoji: "✨", label: "New Lead" };

  }

  if (/qualified|ready|potential/.test(value)) {

    return { emoji: "🎯", label: "Qualified" };

  }

  if (/follow.?up|callback|call back/.test(value)) {

    return { emoji: "📞", label: "Follow-up" };

  }

  if (/meeting|demo|appointment/.test(value)) {

    return { emoji: "📅", label: "Meeting" };

  }

  if (/proposal|quotation|quote/.test(value)) {

    return { emoji: "📄", label: "Proposal" };

  }

  if (/won|converted|success|closed won/.test(value)) {

    return { emoji: "🏆", label: "Won" };

  }

  if (/lost|rejected|closed lost/.test(value)) {

    return { emoji: "🚫", label: "Lost" };

  }

  if (/nurture|nurturing/.test(value)) {

    return { emoji: "🌱", label: "Nurture" };

  }

  if (/customer|client/.test(value)) {

    return { emoji: "🤝", label: "Customer" };

  }

  return { emoji: "🏷️", label: "Lead Type" };

}

type LeadTypeReportExportProps = {

  leadTypeId: string;

  leadTypeName: string;

};

function LeadTypeReportExport({

  leadTypeId,

  leadTypeName,

}: LeadTypeReportExportProps) {

  const [isOpen, setIsOpen] = useState(false);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const [progress, setProgress] = useState(0);

  const [hasProgress, setHasProgress] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [fileName, setFileName] = useState("");

  const startExport = async () => {

    setStatus("loading");

    setProgress(0);

    setHasProgress(false);

    setErrorMessage("");

    setFileName("");

    try {

      const response = await fetch(

        `/api/lead-types/${encodeURIComponent(leadTypeId)}/report`,

        { method: "GET", cache: "no-store" }

      );

      if (!response.ok) {

        let message = `Report export failed (${response.status}).`;

        try {

          const payload = await response.clone().json();

          message = payload.message || payload.error || message;

        } catch {

          // Keep the HTTP status message when the response is not JSON.

        }

        throw new Error(message);

      }

      const disposition = response.headers.get("content-disposition") || "";

      const encodedName = disposition.match(/filename\\\*=UTF-8''([^;]+)/i)?.[1];

      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];

      const resolvedName = encodedName

        ? decodeURIComponent(encodedName)

        : plainName || `${leadTypeName.replace(/[^a-z0-9-_]+/gi, "_")}_report.xlsx`;

      const total = Number(response.headers.get("content-length") || 0);

      if (total > 0) setHasProgress(true);

      let blob: Blob;

      if (response.body) {

        const reader = response.body.getReader();

        const chunks: Uint8Array[] = [];

        let received = 0;

        while (true) {

          const { done, value } = await reader.read();

          if (done) break;

          if (value) {

            chunks.push(value);

            received += value.length;

            if (total > 0) setProgress(Math.min(100, Math.round((received / total) * 100)));

          }

        }

        blob = new Blob(chunks as BlobPart[], {

          type: response.headers.get("content-type") || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        });

      } else {

        blob = await response.blob();

        setProgress(100);

      }

      if (!blob.size) throw new Error("The server returned an empty report. Please try again.");

      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = objectUrl;

      anchor.download = resolvedName;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setProgress(100);

      setFileName(resolvedName);

      setStatus("success");

    } catch (error) {

      setErrorMessage(error instanceof Error ? error.message : "Unable to download the report.");

      setStatus("error");

    }

  };

  const openExport = () => {

    setIsOpen(true);

    void startExport();

  };

  return (

    <>

      <button

        type="button"

        onClick={openExport}

        title={`Export ${leadTypeName} report`}

        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"

      >

        <Download size={14} />

        <span>Export</span>

      </button>

      {isOpen && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">

          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">

              <div className="flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">

                  <FileSpreadsheet size={22} />

                </div>

                <div>

                  <h3 className="text-base font-bold text-slate-900">Export report</h3>

                  <p className="mt-0.5 max-w-[250px] truncate text-xs text-slate-500">{leadTypeName}</p>

                </div>

              </div>

              <button

                type="button"

                onClick={() => setIsOpen(false)}

                aria-label="Close export dialog"

                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"

              >

                <X size={18} />

              </button>

            </div>

            <div className="px-6 py-7 text-center">

              {status === "loading" && (

                <>

                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">

                    <Loader2 size={30} className="animate-spin text-emerald-600" />

                  </div>

                  <h4 className="mt-4 text-base font-bold text-slate-900">Preparing your Excel report</h4>

                  <p className="mt-1 text-sm text-slate-500">Please wait while we collect the data and generate your file.</p>

                  <div className="mx-auto mt-6 max-w-xs">

                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">

                      <div

                        className={`h-full rounded-full bg-emerald-500 transition-all duration-300 ${hasProgress ? "" : "w-1/3 animate-pulse"}`}

                        style={hasProgress ? { width: `${progress}%` } : undefined}

                      />

                    </div>

                    <p className="mt-2 text-xs font-medium text-slate-500">

                      {hasProgress ? `${progress}% downloaded` : "Generating report…"}

                    </p>

                  </div>

                </>

              )}

              {status === "success" && (

                <>

                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">

                    <CheckCircle2 size={34} />

                  </div>

                  <h4 className="mt-4 text-base font-bold text-slate-900">Download started successfully</h4>

                  <p className="mt-1 break-all text-sm text-slate-500">{fileName}</p>

                  <button

                    type="button"

                    onClick={() => setIsOpen(false)}

                    className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"

                  >

                    Done

                  </button>

                </>

              )}

              {status === "error" && (

                <>

                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">

                    <AlertCircle size={34} />

                  </div>

                  <h4 className="mt-4 text-base font-bold text-slate-900">Could not export report</h4>

                  <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>

                  <button

                    type="button"

                    onClick={() => void startExport()}

                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"

                  >

                    <RefreshCw size={15} /> Try again

                  </button>

                </>

              )}

            </div>

          </div>

        </div>

      )}

    </>

  );

}

export default function LeadManagementPage() {

  const [leadTypes, setLeadTypes] = useState<LeadType[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [stageSearch, setStageSearch] = useState("");

  const [contactSearches, setContactSearches] = useState<

    Record<string, string>

  >({});

  const [showStageModal, setShowStageModal] = useState(false);

  const [stageName, setStageName] = useState("");

  const [editingStage, setEditingStage] = useState<LeadType | null>(null);

  const [showContactModal, setShowContactModal] = useState(false);

  const [selectedStage, setSelectedStage] = useState<LeadType | null>(null);

  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const [contactForm, setContactForm] = useState(emptyContactForm);

  const [showKeywordModal, setShowKeywordModal] = useState(false);

  const [keywordStage, setKeywordStage] = useState<LeadType | null>(null);

  const [keywordInput, setKeywordInput] = useState("");

  const [keywords, setKeywords] = useState<string[]>([]);

  const [movingContact, setMovingContact] = useState<{

    stageId: string;

    contactId: string;

  } | null>(null);

  const [moveTarget, setMoveTarget] = useState("");

  const [transferContact, setTransferContact] = useState<{
    stageId: string;
    contact: Contact;
    stageName: string;
  } | null>(null);
  const [transferUsers, setTransferUsers] = useState<Array<{ _id: string; name: string }>>([]);
  const [transferTarget, setTransferTarget] = useState("");
  const [loadingTransferUsers, setLoadingTransferUsers] = useState(false);
  // AUTO ASSIGNMENT
const [autoAssignmentEnabled, setAutoAssignmentEnabled] = useState(false);
const [autoAssignmentLoading, setAutoAssignmentLoading] = useState(false);
const [showAutoAssignmentControls, setShowAutoAssignmentControls] = useState(false);


  /* LOAD LEAD TYPES */

  const loadLeadTypes = useCallback(async () => {

    try {

      const response = await fetch("/api/lead-types", {

        method: "GET",

        cache: "no-store",

      });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Failed to load Lead Types");

      }

      const normalized: LeadType[] = (data.leadTypes || []).map(

        (stage: any) => ({

          ...stage,

          _id: String(stage._id),

          name: stage.name || "",

          keywords: Array.isArray(stage.keywords) ? stage.keywords : [],

          contacts: Array.isArray(stage.contacts)

            ? stage.contacts.map((contact: any) => ({

                ...contact,

                _id: String(contact._id),

                name: contact.name || "",

                phone: contact.phone || "",

                notes: contact.notes || "",

                source: contact.source || "WhatsApp",

                customSource: contact.customSource || "",

              }))

            : [],

        })

      );

      setLeadTypes(normalized);

    } catch (error: any) {

      console.error("Load Lead Types Error:", error);

      toast.error(error.message || "Unable to load Lead Pipeline");

    } finally {

      setLoading(false);

    }

  }, []);

  useEffect(() => {

    loadLeadTypes();

  }, [loadLeadTypes]);

  // LOAD AUTO ASSIGNMENT STATUS
const loadAutoAssignmentStatus = useCallback(async () => {
  try {
    const response = await fetch("/api/auto-assignment", {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setShowAutoAssignmentControls(false);
      return;
    }

    setAutoAssignmentEnabled(Boolean(data.enabled));
    setShowAutoAssignmentControls(true);
  } catch (error) {
    console.error("Auto Assignment Status Error:", error);
    setShowAutoAssignmentControls(false);
  }
}, []);

useEffect(() => {
  void loadAutoAssignmentStatus();
}, [loadAutoAssignmentStatus]);

// START / STOP AUTO ASSIGNMENT
const toggleAutoAssignment = async () => {
  if (autoAssignmentLoading) return;

  const nextEnabled = !autoAssignmentEnabled;

  setAutoAssignmentLoading(true);

  try {
    const response = await fetch("/api/auto-assignment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: nextEnabled,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Unable to update Auto Assignment.");
    }

    setAutoAssignmentEnabled(nextEnabled);

    toast.success(
      nextEnabled
        ? "Auto Assignment started successfully."
        : "Auto Assignment stopped successfully."
    );
  } catch (error: any) {
    toast.error(error.message || "Unable to update Auto Assignment.");
    await loadAutoAssignmentStatus();
  } finally {
    setAutoAssignmentLoading(false);
  }
};

  /* CREATE / UPDATE LEAD TYPE */

  const openCreateStage = () => {

    setEditingStage(null);

    setStageName("");

    setShowStageModal(true);

  };

  const openEditStage = (stage: LeadType) => {

    setEditingStage(stage);

    setStageName(stage.name);

    setShowStageModal(true);

  };

  const saveStage = async () => {

    if (!stageName.trim()) {

      toast.error("Please enter a Lead Type name.");

      return;

    }

    setSaving(true);

    try {

      const response = editingStage

        ? await fetch("/api/lead-types", {

            method: "PATCH",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({

              id: editingStage._id,

              name: stageName.trim(),

            }),

          })

        : await fetch("/api/lead-types", {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({

              name: stageName.trim(),

            }),

          });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Unable to save Lead Type");

      }

      toast.success(data.message);

      setShowStageModal(false);

      setStageName("");

      setEditingStage(null);

      await loadLeadTypes();

    } catch (error: any) {

      toast.error(error.message || "Something went wrong.");

    } finally {

      setSaving(false);

    }

  };

  const deleteStage = async (stage: LeadType) => {

    const confirmed = window.confirm(

      `Delete "${stage.name}" and all its contacts? This cannot be undone.`

    );

    if (!confirmed) return;

    try {

      const response = await fetch(

        `/api/lead-types?id=${encodeURIComponent(stage._id)}`,

        { method: "DELETE" }

      );

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Unable to delete Lead Type");

      }

      toast.success(data.message);

      await loadLeadTypes();

    } catch (error: any) {

      toast.error(error.message || "Unable to delete Lead Type.");

    }

  };

  /* ADD / EDIT CONTACT */

  const openAddContact = (stage: LeadType) => {

    setSelectedStage(stage);

    setEditingContact(null);

    setContactForm(emptyContactForm);

    setShowContactModal(true);

  };

  const openEditContact = (stage: LeadType, contact: Contact) => {

    setSelectedStage(stage);

    setEditingContact(contact);

    setContactForm({

      name: contact.name,

      phone: contact.phone,

      notes: contact.notes || "",

      source: contact.source || "WhatsApp",

      customSource: contact.customSource || "",

    });

    setShowContactModal(true);

  };

  const saveContact = async () => {

    if (!selectedStage) return;

    if (!contactForm.name.trim() || !contactForm.phone.trim()) {

      toast.error("Customer name and phone number are required.");

      return;

    }

    if (contactForm.source === "Other" && !contactForm.customSource.trim()) {

      toast.error("Please enter the custom lead source.");

      return;

    }

    setSaving(true);

    try {

      const isEditing = Boolean(editingContact);

      const response = await fetch("/api/lead-types", {

        method: isEditing ? "PATCH" : "POST",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify(

          isEditing

            ? {

                action: "editContact",

                leadTypeId: selectedStage._id,

                contactId: editingContact?._id,

                name: contactForm.name.trim(),

                phone: contactForm.phone.trim(),

                notes: contactForm.notes.trim(),

                source: contactForm.source,

                customSource: contactForm.source === "Other" ? contactForm.customSource.trim() : "",

              }

            : {

                action: "addContact",

                leadTypeId: selectedStage._id,

                name: contactForm.name.trim(),

                phone: contactForm.phone.trim(),

                notes: contactForm.notes.trim(),

                source: contactForm.source,

                customSource: contactForm.source === "Other" ? contactForm.customSource.trim() : "",

              }

        ),

      });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Unable to save contact.");

      }

      toast.success(data.message);

      setShowContactModal(false);

      setSelectedStage(null);

      setEditingContact(null);

      setContactForm(emptyContactForm);

      await loadLeadTypes();

    } catch (error: any) {

      console.error("Save Contact Error:", error);

      toast.error(error.message || "Unable to save contact.");

    } finally {

      setSaving(false);

    }

  };

  /* DELETE CONTACT */

  const deleteContact = async (stage: LeadType, contact: Contact) => {

    const confirmed = window.confirm(

      `Delete ${contact.name} from ${stage.name}?`

    );

    if (!confirmed) return;

    try {

      const response = await fetch("/api/lead-types", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({

          action: "deleteContact",

          leadTypeId: stage._id,

          contactId: contact._id,

        }),

      });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Unable to delete contact.");

      }

      toast.success(data.message);

      await loadLeadTypes();

    } catch (error: any) {

      toast.error(error.message || "Unable to delete contact.");

    }

  };

  /* MOVE CONTACT */

  const openMoveContact = (stage: LeadType, contact: Contact) => {

    setMovingContact({

      stageId: stage._id,

      contactId: contact._id,

    });

    setMoveTarget("");

  };

  const moveContact = async () => {

    if (!movingContact || !moveTarget) return;

    setSaving(true);

    try {

      const response = await fetch("/api/lead-types", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({

          action: "moveContact",

          sourceLeadTypeId: movingContact.stageId,

          targetLeadTypeId: moveTarget,

          contactId: movingContact.contactId,

        }),

      });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Unable to move contact.");

      }

      toast.success(data.message);

      setMovingContact(null);

      setMoveTarget("");

      await loadLeadTypes();

    } catch (error: any) {

      toast.error(error.message || "Unable to move contact.");

    } finally {

      setSaving(false);

    }

  };

  const openTransferContact = async (stage: LeadType, contact: Contact) => {
    setTransferContact({ stageId: stage._id, contact, stageName: stage.name });
    setTransferTarget("");
    setTransferUsers([]);
    setLoadingTransferUsers(true);

    try {
      const response = await fetch("/api/tenant/users", {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load tenant users.");
      }

      const users = Array.isArray(data.users)
        ? data.users
        : Array.isArray(data.subUsers)
          ? data.subUsers
          : [];

      const normalizedUsers = users
        .filter((user: any) => user?._id)
        .map((user: any) => ({
          _id: String(user._id),
          name: String(user.name || user.email || "Team member"),
        }));

      setTransferUsers(normalizedUsers);
      if (normalizedUsers.length === 0) {
        toast.info("No sub-users are available to receive this lead.");
      }
    } catch (error: any) {
      toast.error(error.message || "Unable to load tenant users.");
      setTransferContact(null);
    } finally {
      setLoadingTransferUsers(false);
    }
  };

  const submitTransferContact = async () => {
    if (!transferContact || !transferTarget) {
      toast.error("Please select a team member.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/lead-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transferContact",
          sourceLeadTypeId: transferContact.stageId,
          contactId: transferContact.contact._id,
          targetUserId: transferTarget,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to transfer lead.");
      }

      toast.success(data.message || "Lead transferred successfully.");
      setTransferContact(null);
      setTransferTarget("");
      await loadLeadTypes();
    } catch (error: any) {
      toast.error(error.message || "Unable to transfer lead.");
    } finally {
      setSaving(false);
    }
  };

  /* KEYWORD MANAGEMENT */

  const openKeywordSettings = (stage: LeadType) => {

    setKeywordStage(stage);

    setKeywords(stage.keywords || []);

    setKeywordInput("");

    setShowKeywordModal(true);

  };

  const addKeyword = () => {

    const value = keywordInput.trim();

    if (!value) return;

    if (keywords.some((keyword) => keyword.toLowerCase() === value.toLowerCase())) {

      toast.error("This keyword already exists.");

      return;

    }

    if (keywords.length >= 100) {

      toast.error("You can add a maximum of 100 keywords.");

      return;

    }

    setKeywords((previous) => [...previous, value]);

    setKeywordInput("");

  };

  const removeKeyword = (keyword: string) => {

    setKeywords((previous) =>

      previous.filter((item) => item !== keyword)

    );

  };

  const saveKeywords = async () => {

    if (!keywordStage) return;

    setSaving(true);

    try {

      const response = await fetch("/api/lead-types", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

        },

        body: JSON.stringify({

          action: "updateKeywords",

          leadTypeId: keywordStage._id,

          keywords,

        }),

      });

      const data = await response.json();

      if (!response.ok || !data.success) {

        throw new Error(data.message || "Unable to save keywords.");

      }

      toast.success(data.message);

      setShowKeywordModal(false);

      setKeywordStage(null);

      await loadLeadTypes();

    } catch (error: any) {

      toast.error(error.message || "Unable to save keywords.");

    } finally {

      setSaving(false);

    }

  };

  /* SEARCH AND FILTER */

  const filteredLeadTypes = useMemo(() => {

    const query = stageSearch.trim().toLowerCase();

    if (!query) return leadTypes;

    return leadTypes.filter((stage) =>

      stage.name.toLowerCase().includes(query)

    );

  }, [leadTypes, stageSearch]);

  const getFilteredContacts = (stage: LeadType) => {

    const query = (contactSearches[stage._id] || "")

      .trim()

      .toLowerCase();

    if (!query) return stage.contacts;

    return stage.contacts.filter(

      (contact) =>

        contact.name.toLowerCase().includes(query) ||

        contact.phone.toLowerCase().includes(query)

    );

  };

  const updateContactSearch = (stageId: string, value: string) => {

    setContactSearches((previous) => ({

      ...previous,

      [stageId]: value,

    }));

  };

  const totalContacts = leadTypes.reduce(

    (total, stage) => total + stage.contacts.length,

    0

  );

  /* UI CLASSES */

  const primaryButtonClass =

    "inline-flex items-center justify-center gap-2 rounded-xl bg-[#0CCB66] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50";

  const secondaryButtonClass =

    "rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50";

  const modalInputClass =

    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0CCB66] focus:ring-4 focus:ring-green-500/10";

  return (

    <div className="flex min-h-screen bg-slate-50">

      <Sidebar />

      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 md:ml-[255px]">

        <div className="mx-auto w-full max-w-[1600px]">

          {/* PAGE HEADER */}

          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

            <div>

              <div className="flex items-center gap-2">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[#0CCB66]">

                  <Users size={21} />

                </div>

                <div>

                  <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">

                    Lead Management

                  </h1>

                  <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">

                    Organise contacts and manage your sales pipeline.

                  </p>

                </div>

              </div>

            </div>

<div className="flex flex-wrap items-center gap-2">
  {showAutoAssignmentControls && (
    <button
      type="button"
      onClick={toggleAutoAssignment}
      disabled={autoAssignmentLoading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        autoAssignmentEnabled
          ? "bg-red-500 hover:bg-red-600"
          : "bg-slate-800 hover:bg-slate-900"
      }`}
    >
      {autoAssignmentLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : autoAssignmentEnabled ? (
        <Pause size={16} />
      ) : (
        <Play size={16} />
      )}

      {autoAssignmentEnabled ? "Stop Auto Assignment" : "Start Auto Assignment"}
    </button>
  )}

  <button
    onClick={openCreateStage}
    className={primaryButtonClass}
  >
    <Plus size={17} />
    Create Lead Type
  </button>
</div>

          </div>

          {/* SUMMARY */}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-xs font-medium text-slate-500">

                    Total Lead Types

                  </p>

                  <p className="mt-1 text-2xl font-bold text-slate-900">

                    {leadTypes.length}

                  </p>

                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">

                  <Tag size={19} />

                </div>

              </div>

            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-xs font-medium text-slate-500">

                    Total Contacts

                  </p>

                  <p className="mt-1 text-2xl font-bold text-slate-900">

                    {totalContacts}

                  </p>

                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-[#0CCB66]">

                  <Users size={19} />

                </div>

              </div>

            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">

              <div className="flex items-center justify-between">

                <div>

                  <p className="text-xs font-medium text-slate-500">

                    Pipeline Status

                  </p>

                  <p className="mt-1 text-2xl font-bold text-slate-900">

                    Active

                  </p>

                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">

                  <Flame size={19} />

                </div>

              </div>

            </div>

          </div>

          {/* SEARCH */}

          <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">

            <div className="relative">

              <Search

                size={17}

                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"

              />

              <input

                type="text"

                value={stageSearch}

                onChange={(event) => setStageSearch(event.target.value)}

                placeholder="Search Lead Types..."

                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#0CCB66] focus:ring-4 focus:ring-green-500/10"

              />

            </div>

          </div>

          {/* LEAD TYPES */}

          {loading ? (

            <div className="flex min-h-[300px] items-center justify-center">

              <Loader2 className="h-8 w-8 animate-spin text-[#0CCB66]" />

            </div>

          ) : filteredLeadTypes.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">

                <Users size={25} />

              </div>

              <h3 className="mt-4 text-base font-bold text-slate-800">

                {stageSearch

                  ? "No matching Lead Types"

                  : "No Lead Types created yet"}

              </h3>

              <p className="mt-1 text-sm text-slate-500">

                {stageSearch

                  ? "Try another search term."

                  : "Create your first Lead Type to start organising contacts."}

              </p>

              {!stageSearch && (

                <button

                  onClick={openCreateStage}

                  className={`${primaryButtonClass} mt-5`}

                >

                  <Plus size={16} />

                  Create Lead Type

                </button>

              )}

            </div>

          ) : (

            <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">

              {filteredLeadTypes.map((stage) => {

                const icon = getLeadIcon(stage.name);

                const filteredContacts = getFilteredContacts(stage);

                return (

                  <section

                    key={stage._id}

                    className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"

                  >

                    {/* LEAD TYPE HEADER */}

                    <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-4 py-4">

                      <div className="flex items-start justify-between gap-3">

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-xl">

                            {icon.emoji}

                          </div>

                          <div className="min-w-0">

                            <h3 className="break-words text-sm font-bold text-slate-900">

                              {stage.name}

                            </h3>

                            <p className="mt-1 text-xs text-slate-500">

                              {stage.contacts.length}{" "}

                              {stage.contacts.length === 1

                                ? "contact"

                                : "contacts"}

                            </p>

                          </div>

                        </div>

                        <div className="flex shrink-0 items-center gap-1">

                          <LeadTypeReportExport

                            leadTypeId={stage._id}

                            leadTypeName={stage.name}

                          />

                          <button

                            onClick={() => openKeywordSettings(stage)}

                            title="Configure keywords"

                            className="rounded-lg p-2 text-slate-400 transition hover:bg-green-50 hover:text-[#0CCB66]"

                          >

                            <Settings size={15} />

                          </button>

                          <button

                            onClick={() => openEditStage(stage)}

                            title="Edit Lead Type"

                            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"

                          >

                            <Pencil size={15} />

                          </button>

                          <button

                            onClick={() => deleteStage(stage)}

                            title="Delete Lead Type"

                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"

                          >

                            <Trash2 size={15} />

                          </button>

                        </div>

                      </div>

                      {/* KEYWORDS */}

                      {stage.keywords.length > 0 && (

                        <div className="mt-3 flex flex-wrap gap-1.5">

                          {stage.keywords.slice(0, 5).map((keyword) => (

                            <span

                              key={keyword}

                              className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-medium text-green-700"

                            >

                              {keyword}

                            </span>

                          ))}

                          {stage.keywords.length > 5 && (

                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-500">

                              +{stage.keywords.length - 5} more

                            </span>

                          )}

                        </div>

                      )}

                    </div>

                    {/* CONTACT SECTION */}

                    <div className="flex flex-1 flex-col p-4">

                      <div className="mb-3 flex items-center justify-between gap-2">

                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">

                          Contacts

                        </h4>

                        <button

                          onClick={() => openAddContact(stage)}

                          className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100"

                        >

                          <Plus size={13} />

                          Add Contact

                        </button>

                      </div>

                      {/* CONTACT SEARCH */}

                      {stage.contacts.length > 0 && (

                        <div className="relative mb-3">

                          <Search

                            size={14}

                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"

                          />

                          <input

                            type="text"

                            value={contactSearches[stage._id] || ""}

                            onChange={(event) =>

                              updateContactSearch(

                                stage._id,

                                event.target.value

                              )

                            }

                            placeholder="Search contacts..."

                            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none transition focus:border-[#0CCB66]"

                          />

                        </div>

                      )}

                      {/* CONTACT LIST */}

                      <div className="min-w-0 space-y-2">

                        {stage.contacts.length === 0 ? (

                          <div className="flex min-h-[155px] flex-col items-center justify-center text-center">

                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">

                              <Users size={22} />

                            </div>

                            <p className="text-sm font-semibold text-slate-600">

                              No contacts yet

                            </p>

                            <p className="mt-1 text-xs text-slate-400">

                              Add a contact to this Lead Type.

                            </p>

                          </div>

                        ) : filteredContacts.length === 0 ? (

                          <div className="flex min-h-[155px] flex-col items-center justify-center text-center">

                            <Search

                              size={23}

                              className="mb-2 text-slate-300"

                            />

                            <p className="text-sm font-medium text-slate-500">

                              No matching contacts

                            </p>

                            <p className="mt-1 text-xs text-slate-400">

                              Try another name or number.

                            </p>

                          </div>

                        ) : (

                          filteredContacts.map((contact) => (

                            <div

                              key={contact._id}

                              className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-slate-200 hover:bg-white"

                            >

                              {/* FIXED CONTACT CARD LAYOUT */}

                              <div className="flex min-w-0 flex-col gap-3">

                                {/* CONTACT DETAILS */}

                                <div className="min-w-0 w-full">

                                  <div className="flex min-w-0 flex-wrap items-center gap-2">

                                    <h4 className="min-w-0 break-words text-sm font-semibold leading-5 text-slate-900">

                                      {contact.name}

                                    </h4>

                                    <span className="inline-flex max-w-full items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold leading-4 text-emerald-700">

                                      {contact.source === "Other"
                                        ? `Other: ${contact.customSource?.trim() || "Custom"}`
                                        : contact.source || "WhatsApp"}

                                    </span>

                                  </div>

                                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-slate-500">

                                    <Phone

                                      size={13}

                                      className="shrink-0"

                                    />

                                    <span className="min-w-0 whitespace-nowrap">

                                      {contact.phone}

                                    </span>

                                  </div>

                                  {contact.notes && (

                                    <p className="mt-2 break-words text-xs leading-relaxed text-slate-500">

                                      {contact.notes}

                                    </p>

                                  )}

                                </div>

                                {/* ACTION BUTTONS: SEPARATE ROW */}

                                <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">

                                  <AddFollowUpReminder

                                    leadTypeId={stage._id}

                                    contactId={contact._id}

                                    contactName={contact.name}

                                    phone={contact.phone}

                                  />

                                  <ContactActivityHistory

                                    leadTypeId={stage._id}

                                    contactId={contact._id}

                                    contactName={contact.name}

                                    phone={contact.phone}

                                  />

                                  <button

                                    onClick={() =>

                                      openEditContact(stage, contact)

                                    }

                                    title="Edit contact"

                                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"

                                  >

                                    <Pencil size={14} />

                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => void openTransferContact(stage, contact)}
                                    title="Transfer lead to another user"
                                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-green-50 hover:text-[#0CCB66]"
                                  >
                                    <Users size={14} />
                                  </button>

                                  <button

                                    onClick={() =>

                                      deleteContact(stage, contact)

                                    }

                                    title="Delete contact"

                                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"

                                  >

                                    <Trash2 size={14} />

                                  </button>

                                </div>

                              </div>

                              {/* MOVE CONTACT */}

                              {leadTypes.length > 1 && (

                                <button

                                  onClick={() =>

                                    openMoveContact(stage, contact)

                                  }

                                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 transition hover:border-[#0CCB66] hover:text-[#0CCB66]"

                                >

                                  <ArrowRight size={13} />

                                  Move to another stage

                                </button>

                              )}

                            </div>

                          ))

                        )}

                      </div>

                    </div>

                    {/* CARD FOOTER */}

                    <div className="mt-auto border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">

                      <p className="text-center text-[11px] text-slate-400">

                        {icon.label} · {stage.contacts.length} total contacts

                      </p>

                    </div>

                  </section>

                );

              })}

            </div>

          )}

        </div>

      </main>

      {/* ADD / EDIT LEAD TYPE MODAL */}

      {showStageModal && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4">

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">

            <div className="mb-5 flex items-center justify-between">

              <div>

                <h2 className="text-lg font-bold text-slate-900">

                  {editingStage ? "Edit Lead Type" : "Create Lead Type"}

                </h2>

                <p className="mt-1 text-xs text-slate-500">

                  Organise your contacts into pipeline stages.

                </p>

              </div>

              <button

                onClick={() => setShowStageModal(false)}

                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"

              >

                <X size={20} />

              </button>

            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">

              Lead Type Name

            </label>

            <input

              type="text"

              value={stageName}

              onChange={(event) => setStageName(event.target.value)}

              onKeyDown={(event) => {

                if (event.key === "Enter") {

                  event.preventDefault();

                  saveStage();

                }

              }}

              placeholder="e.g. Hot Lead, Interested, Follow-up"

              className={modalInputClass}

            />

            <div className="mt-6 flex justify-end gap-3">

              <button

                onClick={() => setShowStageModal(false)}

                className={secondaryButtonClass}

              >

                Cancel

              </button>

              <button

                onClick={saveStage}

                disabled={saving}

                className={primaryButtonClass}

              >

                {saving && <Loader2 size={16} className="animate-spin" />}

                {editingStage ? "Save Changes" : "Create Lead Type"}

              </button>

            </div>

          </div>

        </div>

      )}

      {/* ADD / EDIT CONTACT MODAL */}

      {showContactModal && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4">

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">

            <div className="mb-1 flex items-center justify-between">

              <div>

                <h2 className="text-lg font-bold text-slate-900">

                  {editingContact ? "Edit Contact" : "Add Contact"}

                </h2>

                <p className="mt-1 text-xs text-slate-500">

                  Add customer details to your pipeline.

                </p>

              </div>

              <button

                onClick={() => setShowContactModal(false)}

                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"

              >

                <X size={20} />

              </button>

            </div>

            <p className="mb-5 mt-3 text-sm text-slate-500">

              Adding contact to{" "}

              <span className="font-semibold text-[#0CCB66]">

                {selectedStage?.name}

              </span>

            </p>

            <div className="space-y-4">

              <div>

                <label className="mb-1.5 block text-sm font-semibold text-slate-700">

                  Customer Name \*

                </label>

                <input

                  type="text"

                  value={contactForm.name}

                  onChange={(event) =>

                    setContactForm((previous) => ({

                      ...previous,

                      name: event.target.value,

                    }))

                  }

                  placeholder="Enter customer name"

                  className={modalInputClass}

                />

              </div>

              <div>

                <label className="mb-1.5 block text-sm font-semibold text-slate-700">

                  Phone Number \*

                </label>

                <input

                  type="tel"

                  value={contactForm.phone}

                  onChange={(event) =>

                    setContactForm((previous) => ({

                      ...previous,

                      phone: event.target.value,

                    }))

                  }

                  placeholder="Enter phone number"

                  className={modalInputClass}

                />

                <p className="mt-1.5 text-xs text-slate-400">

                  Include the country code if required.

                </p>

              </div>

              <>

                  <div>

                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">

                      Lead Source *

                    </label>

                    <select

                      value={contactForm.source}

                      onChange={(event) =>

                        setContactForm((previous) => ({

                          ...previous,

                          source: event.target.value as typeof previous.source,

                          customSource: event.target.value === "Other" ? previous.customSource : "",

                        }))

                      }

                      className={modalInputClass}

                    >

                      <option value="WhatsApp">WhatsApp</option>

                      <option value="Instagram">Instagram</option>

                      <option value="Facebook">Facebook</option>

                      <option value="Other">Other</option>

                    </select>

                  </div>

                  {contactForm.source === "Other" && (

                    <div>

                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">

                        Enter Lead Source *

                      </label>

                      <input

                        type="text"

                        value={contactForm.customSource}

                        onChange={(event) =>

                          setContactForm((previous) => ({

                            ...previous,

                            customSource: event.target.value,

                          }))

                        }

                        placeholder="e.g. Website, Google Ads, Referral"

                        className={modalInputClass}

                      />

                    </div>

                  )}

              </>

              <div>

                <label className="mb-1.5 block text-sm font-semibold text-slate-700">

                  Notes (Optional)

                </label>

                <textarea

                  value={contactForm.notes}

                  onChange={(event) =>

                    setContactForm((previous) => ({

                      ...previous,

                      notes: event.target.value,

                    }))

                  }

                  placeholder="Add notes about this contact..."

                  rows={3}

                  className={`${modalInputClass} resize-none`}

                />

              </div>

            </div>

            <div className="mt-6 flex justify-end gap-3">

              <button

                onClick={() => setShowContactModal(false)}

                className={secondaryButtonClass}

              >

                Cancel

              </button>

              <button

                onClick={saveContact}

                disabled={saving}

                className={primaryButtonClass}

              >

                {saving && <Loader2 size={16} className="animate-spin" />}

                {editingContact ? "Save Changes" : "Add Contact"}

              </button>

            </div>

          </div>

        </div>

      )}

      {/* MOVE CONTACT MODAL */}

      {movingContact && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4">

          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">

            <div className="mb-5 flex items-center justify-between">

              <div>

                <h2 className="text-lg font-bold text-slate-900">

                  Move Contact

                </h2>

                <p className="mt-1 text-xs text-slate-500">

                  Select the destination Lead Type.

                </p>

              </div>

              <button

                onClick={() => setMovingContact(null)}

                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"

              >

                <X size={20} />

              </button>

            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">

              Destination Lead Type

            </label>

            <select

              value={moveTarget}

              onChange={(event) => setMoveTarget(event.target.value)}

              className={modalInputClass}

            >

              <option value="">Choose a Lead Type</option>

              {leadTypes

                .filter((stage) => stage._id !== movingContact.stageId)

                .map((stage) => (

                  <option key={stage._id} value={stage._id}>

                    {getLeadIcon(stage.name).emoji} {stage.name}

                  </option>

                ))}

            </select>

            <div className="mt-6 flex justify-end gap-3">

              <button

                onClick={() => setMovingContact(null)}

                className={secondaryButtonClass}

              >

                Cancel

              </button>

              <button

                onClick={moveContact}

                disabled={!moveTarget || saving}

                className={primaryButtonClass}

              >

                <ArrowRight size={16} />

                Move Contact

              </button>

            </div>

          </div>

        </div>

      )}

      {/* TRANSFER LEAD MODAL */}
      {transferContact && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Transfer Lead</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Transfer this contact to another team member.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferContact(null)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"
                aria-label="Close transfer dialog"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{transferContact.contact.name}</p>
              <p className="mt-1 text-xs text-slate-500">{transferContact.contact.phone}</p>
              <p className="mt-1 text-xs text-slate-500">
                Current Lead Type: <span className="font-semibold">{transferContact.stageName}</span>
              </p>
            </div>

            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Transfer to
            </label>
            {loadingTransferUsers ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" />
                Loading team members...
              </div>
            ) : (
              <select
                value={transferTarget}
                onChange={(event) => setTransferTarget(event.target.value)}
                className={modalInputClass}
                disabled={transferUsers.length === 0}
              >
                <option value="">Select a team member</option>
                {transferUsers.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </select>
            )}

            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              The lead will be removed from your list and added to the selected user under the same Lead Type name. If that Lead Type does not exist for them, it will be created automatically.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTransferContact(null)}
                className={secondaryButtonClass}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransferContact}
                disabled={!transferTarget || saving || loadingTransferUsers}
                className={primaryButtonClass}
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                Transfer Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KEYWORD CONFIGURATION MODAL */}

      {showKeywordModal && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4">

          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">

            <div className="mb-1 flex items-center justify-between">

              <div>

                <h2 className="text-lg font-bold text-slate-900">

                  Configure Keywords

                </h2>

                <p className="mt-1 text-xs text-slate-500">

                  Set keywords to automatically identify matching replies.

                </p>

              </div>

              <button

                onClick={() => setShowKeywordModal(false)}

                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"

              >

                <X size={20} />

              </button>

            </div>

            <p className="mb-5 mt-3 text-sm text-slate-500">

              Managing keywords for{" "}

              <span className="font-semibold text-[#0CCB66]">

                {keywordStage?.name}

              </span>

            </p>

            <div className="flex gap-2">

              <input

                type="text"

                value={keywordInput}

                onChange={(event) => setKeywordInput(event.target.value)}

                onKeyDown={(event) => {

                  if (event.key === "Enter") {

                    event.preventDefault();

                    addKeyword();

                  }

                }}

                placeholder="Enter a keyword"

                className={`min-w-0 flex-1 ${modalInputClass}`}

              />

              <button

                onClick={addKeyword}

                className="rounded-xl bg-[#0CCB66] px-5 text-sm font-semibold text-white transition hover:bg-green-600"

              >

                Add

              </button>

            </div>

            <div className="mt-5">

              <div className="mb-2 flex items-center justify-between">

                <p className="text-sm font-semibold text-slate-700">

                  Added Keywords

                </p>

                <span className="text-xs text-slate-400">

                  {keywords.length}/100

                </span>

              </div>

              {keywords.length === 0 ? (

                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">

                  No keywords added yet.

                </div>

              ) : (

                <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-100 p-3">

                  {keywords.map((keyword) => (

                    <span

                      key={keyword}

                      className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-sm text-green-700"

                    >

                      {keyword}

                      <button

                        onClick={() => removeKeyword(keyword)}

                        className="text-green-700 transition hover:text-red-600"

                        title="Remove keyword"

                      >

                        <X size={14} />

                      </button>

                    </span>

                  ))}

                </div>

              )}

            </div>

            <div className="mt-6 flex justify-end gap-3">

              <button

                onClick={() => setShowKeywordModal(false)}

                className={secondaryButtonClass}

              >

                Cancel

              </button>

              <button

                onClick={saveKeywords}

                disabled={saving}

                className={primaryButtonClass}

              >

                {saving && <Loader2 size={16} className="animate-spin" />}

                Save Keywords

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}
