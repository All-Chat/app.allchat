/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";
import { toast } from "react-toastify";

type ActivityRecord = {
  _id: string;
  personContacted: string;
  occurredAt: string;
  interactionType: string;
  summary: string;
  outcome: string;
  nextFollowUpAt?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  leadTypeId: string;
  contactId: string;
  contactName: string;
  phone: string;
  reminderId?: string;
  activity?: ActivityRecord | null;
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10";

const labelClass =
  "mb-1.5 block text-xs font-semibold tracking-wide text-slate-600";

function toLocalInput(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function nowLocalInput() {
  return toLocalInput(new Date().toISOString());
}

export default function FollowUpActivityForm({
  open,
  onClose,
  onSaved,
  leadTypeId,
  contactId,
  contactName,
  phone,
  reminderId,
  activity,
}: Props) {
  const [saving, setSaving] = useState(false);

  const [personContacted, setPersonContacted] =
    useState(contactName);

  const [occurredAt, setOccurredAt] =
    useState(nowLocalInput());

  const [interactionType, setInteractionType] =
    useState("Call");

  const [summary, setSummary] = useState("");

  const [outcome, setOutcome] =
    useState("Interested");

  const [nextFollowUpAt, setNextFollowUpAt] =
    useState("");

  useEffect(() => {
    if (!open) return;

    setPersonContacted(
      activity?.personContacted || contactName
    );

    setOccurredAt(
      activity
        ? toLocalInput(activity.occurredAt)
        : nowLocalInput()
    );

    setInteractionType(
      activity?.interactionType || "Call"
    );

    setSummary(activity?.summary || "");

    setOutcome(activity?.outcome || "Interested");

    setNextFollowUpAt(
      toLocalInput(activity?.nextFollowUpAt)
    );
  }, [open, activity, contactName]);

  if (!open) return null;

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !personContacted.trim() ||
      !summary.trim() ||
      !occurredAt
    ) {
      toast.error("Please complete all required fields.");
      return;
    }

    setSaving(true);

    try {
      const editing = Boolean(activity?._id);

      const response = await fetch(
        "/api/follow-up-activities",
        {
          method: editing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(editing ? { id: activity!._id } : {}),
            leadTypeId,
            contactId,
            ...(reminderId && !editing
              ? { reminderId }
              : {}),
            personContacted: personContacted.trim(),
            occurredAt: new Date(occurredAt).toISOString(),
            interactionType,
            summary: summary.trim(),
            outcome,
            nextFollowUpAt: nextFollowUpAt
              ? new Date(nextFollowUpAt).toISOString()
              : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to save activity."
        );
      }

      toast.success(
        data.message ||
          (editing
            ? "Activity updated."
            : "Activity saved.")
      );

      await onSaved();
      onClose();
    } catch (error: any) {
      toast.error(
        error.message || "Unable to save activity."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-[0_25px_80px_-20px_rgba(15,23,42,0.45)]">

        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-6 py-5 text-white">
          <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border-[22px] border-white/10" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <MessageSquareText size={23} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-50">
                  Customer engagement
                </p>

                <h2 className="mt-1 text-xl font-bold">
                  {activity
                    ? "Edit interaction"
                    : "Log conversation"}
                </h2>

                <p className="mt-1 text-sm text-emerald-50">
                  Keep a clear record of every customer touchpoint.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl p-2 text-white/90 transition hover:bg-white/15"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="overflow-y-auto p-5 sm:p-6"
        >
          {/* Customer details */}
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Customer
              </p>

              <p className="mt-1 truncate text-sm font-bold text-slate-900">
                {contactName}
              </p>

              <p className="mt-0.5 text-xs text-slate-500">
                {phone}
              </p>
            </div>

            <div className="shrink-0 rounded-xl bg-white p-3 text-emerald-600 shadow-sm">
              <CalendarClock size={20} />
            </div>
          </div>

          {reminderId && !activity && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              Saving this conversation will also mark the linked reminder as completed.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Person contacted */}
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Person you spoke with{" "}
                <span className="text-rose-500">*</span>
              </label>

              <input
                className={inputClass}
                value={personContacted}
                onChange={(e) =>
                  setPersonContacted(e.target.value)
                }
                placeholder="Customer / decision maker name"
                required
              />
            </div>

            {/* Date */}
            <div>
              <label className={labelClass}>
                Date & time{" "}
                <span className="text-rose-500">*</span>
              </label>

              <input
                type="datetime-local"
                className={inputClass}
                value={occurredAt}
                onChange={(e) =>
                  setOccurredAt(e.target.value)
                }
                required
              />
            </div>

            {/* Interaction */}
            <div>
              <label className={labelClass}>
                Interaction type{" "}
                <span className="text-rose-500">*</span>
              </label>

              <select
                className={inputClass}
                value={interactionType}
                onChange={(e) =>
                  setInteractionType(e.target.value)
                }
              >
                {[
                  "Call",
                  "WhatsApp",
                  "Meeting",
                  "Email",
                  "Other",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* Summary */}
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Conversation summary{" "}
                <span className="text-rose-500">*</span>
              </label>

              <textarea
                className={`${inputClass} min-h-[125px] resize-y`}
                value={summary}
                onChange={(e) =>
                  setSummary(e.target.value)
                }
                placeholder="What did the customer say? What was discussed? What action was agreed?"
                maxLength={3000}
                required
              />

              <p className="mt-1 text-right text-[11px] text-slate-400">
                {summary.length}/3000 characters
              </p>
            </div>

            {/* Outcome */}
            <div>
              <label className={labelClass}>
                Outcome{" "}
                <span className="text-rose-500">*</span>
              </label>

              <select
                className={inputClass}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
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
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* Next follow-up */}
            <div>
              <label className={labelClass}>
                Next follow-up (optional)
              </label>

              <input
                type="datetime-local"
                className={inputClass}
                value={nextFollowUpAt}
                onChange={(e) =>
                  setNextFollowUpAt(e.target.value)
                }
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Saving...
                </>
              ) : activity ? (
                "Save changes"
              ) : (
                "Save interaction"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
