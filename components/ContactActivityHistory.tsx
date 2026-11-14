/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Clock3,
  Edit3,
  History,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import FollowUpActivityForm from "@/components/FollowUpActivityForm";

type Activity = {
  _id: string;
  personContacted: string;
  occurredAt: string;
  interactionType: string;
  summary: string;
  outcome: string;
  agentName?: string;
  nextFollowUpAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Props = {
  leadTypeId: string;
  contactId: string;
  contactName: string;
  phone: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function IconForType({ type }: { type: string }) {
  const common = "h-4 w-4";

  if (type === "Call") return <Phone className={common} />;
  if (type === "WhatsApp") return <MessageCircle className={common} />;
  if (type === "Meeting") return <Users className={common} />;
  if (type === "Email") return <Mail className={common} />;

  return <MessageSquareText className={common} />;
}

export default function ContactActivityHistory({
  leadTypeId,
  contactId,
  contactName,
  phone,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("All outcomes");
  const [deletingId, setDeletingId] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        leadTypeId,
        contactId,
      });

      const response = await fetch(
        `/api/follow-up-activities?${params.toString()}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load interaction history."
        );
      }

      setActivities(data.activities || []);
    } catch (error: any) {
      toast.error(
        error.message || "Unable to load interaction history."
      );
    } finally {
      setLoading(false);
    }
  }, [leadTypeId, contactId]);

  useEffect(() => {
    if (historyOpen) {
      loadHistory();
    }
  }, [historyOpen, loadHistory]);

  useEffect(() => {
    if (!historyOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !formOpen) {
        setHistoryOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [historyOpen, formOpen]);

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      const term = search.trim().toLowerCase();

      const matchesSearch =
        !term ||
        [
          item.personContacted,
          item.summary,
          item.interactionType,
          item.outcome,
          item.agentName,
        ].some((value) =>
          String(value || "").toLowerCase().includes(term)
        );

      const matchesOutcome =
        outcomeFilter === "All outcomes" ||
        item.outcome === outcomeFilter;

      return matchesSearch && matchesOutcome;
    });
  }, [activities, search, outcomeFilter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: Activity) {
    setEditing(item);
    setFormOpen(true);
  }

  async function deleteActivity(item: Activity) {
    const confirmed = window.confirm(
      `Delete this ${item.interactionType.toLowerCase()} activity? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(item._id);

    try {
      const response = await fetch(
        `/api/follow-up-activities?id=${encodeURIComponent(item._id)}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to delete activity."
        );
      }

      setActivities((current) =>
        current.filter((entry) => entry._id !== item._id)
      );

      toast.success("Activity deleted successfully.");
    } catch (error: any) {
      toast.error(error.message || "Unable to delete activity.");
    } finally {
      setDeletingId("");
    }
  }

  const positiveSignals = activities.filter(
    (activity) =>
      activity.outcome === "Interested" ||
      activity.outcome === "Negotiation in Progress"
  ).length;

  return (
    <>
      {/* Contact card actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={openCreate}
          title="Log a customer interaction"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
        >
          <Plus size={14} />
          Add Log
        </button>

        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          title="View customer interaction history"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <History size={14} />
          Logs
          {/* <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums">
            {activities.length}
          </span> */}
        </button>
      </div>

      {/* Interaction history modal */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !formOpen) {
              setHistoryOpen(false);
            }
          }}
        >
          <div className="my-2 flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-slate-50 shadow-[0_25px_80px_-20px_rgba(15,23,42,0.5)] sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">

            {/* HEADER - fixed, never scrolls */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 px-4 py-4 text-white sm:px-7 sm:py-5">
              <div className="pointer-events-none absolute -right-8 -top-16 h-48 w-48 rounded-full border-[26px] border-white/5" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/20 sm:h-12 sm:w-12 sm:rounded-2xl">
                    <History size={22} />
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300 sm:text-[11px]">
                      Customer timeline
                    </p>

                    <h2 className="mt-1 text-base font-bold sm:text-xl">
                      Interaction history
                    </h2>

                    <p className="mt-1 break-words text-xs text-slate-300">
                      {contactName}
                      <span className="mx-1 text-slate-500">·</span>
                      {phone}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close interaction history"
                  className="shrink-0 rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
                <div className="min-w-[100px] rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                  <p className="text-lg font-bold tabular-nums">
                    {activities.length}
                  </p>
                  <p className="text-[10px] text-slate-300">
                    Total activities
                  </p>
                </div>

                <div className="min-w-[100px] rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                  <p className="text-lg font-bold tabular-nums">
                    {positiveSignals}
                  </p>
                  <p className="text-[10px] text-slate-300">
                    Positive signals
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openCreate}
                  className="ml-auto inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400 sm:px-4"
                >
                  <Plus size={15} />
                  Add Log
                </button>
              </div>
            </div>

            {/* SEARCH AND FILTER - fixed */}
            <div className="shrink-0 border-b border-slate-200 bg-white p-3 sm:p-4 sm:px-6">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
                <div className="relative min-w-0">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search notes, person, agent or outcome..."
                    className="w-full min-w-0 rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>

                <select
                  value={outcomeFilter}
                  onChange={(event) =>
                    setOutcomeFilter(event.target.value)
                  }
                  className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-400"
                >
                  <option>All outcomes</option>

                  {[
                    "Interested",
                    "Not Interested",
                    "No Answer",
                    "Call Back Requested",
                    "Negotiation in Progress",
                    "Meeting Scheduled",
                    "Converted",
                    "Other",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* TIMELINE - only this section scrolls */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center sm:py-14">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <History size={25} />
                  </div>

                  <h3 className="mt-4 text-sm font-bold text-slate-800">
                    {activities.length
                      ? "No matching activities"
                      : "No interactions logged yet"}
                  </h3>

                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    {activities.length
                      ? "Try changing your search or outcome filter."
                      : "Log calls, WhatsApp conversations, meetings and other customer touchpoints to build this timeline."}
                  </p>

                  {!activities.length && (
                    <button
                      type="button"
                      onClick={openCreate}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <Plus size={14} />
                      Log first activity
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative space-y-4 before:absolute before:bottom-5 before:left-[17px] before:top-4 before:w-px before:bg-slate-200">
                  {filteredActivities.map((item) => (
                    <article
                      key={item._id}
                      className="relative min-w-0 pl-11"
                    >
                      <div className="absolute left-0 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-600 shadow-sm">
                        <IconForType type={item.interactionType} />
                      </div>

                      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-5">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">
                                {item.interactionType}
                              </span>

                              <span className="max-w-full rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                {item.outcome}
                              </span>
                            </div>

                            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <Clock3 size={12} />
                              {formatDate(item.occurredAt)}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <Edit3 size={13} />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteActivity(item)}
                              disabled={deletingId === item._id}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                            >
                              {deletingId === item._id ? (
                                <Loader2
                                  size={13}
                                  className="animate-spin"
                                />
                              ) : (
                                <Trash2 size={13} />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Person contacted
                            </p>

                            <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                              {item.personContacted}
                            </p>
                          </div>

                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Logged by
                            </p>

                            <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                              {item.agentName || "Team member"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Conversation summary
                          </p>

                          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                            {item.summary}
                          </p>
                        </div>

                        {item.nextFollowUpAt && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            <CalendarClock size={14} />
                            Next follow-up:{" "}
                            {formatDate(item.nextFollowUpAt)}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* FOOTER - fixed and always visible */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <p className="text-[10px] text-slate-400 sm:text-[11px]">
                Newest interactions appear first.
              </p>

              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT ACTIVITY FORM */}
      <FollowUpActivityForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setFormOpen(false);
          setEditing(null);
          await loadHistory();
        }}
        leadTypeId={leadTypeId}
        contactId={contactId}
        contactName={contactName}
        phone={phone}
        activity={editing}
      />
    </>
  );
}
