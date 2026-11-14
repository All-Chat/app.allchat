
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import {
  AlarmClock,
  Plus,
  X,
  Loader2,
  CalendarDays,
  Bell,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";

type Props = {
  leadTypeId: string;
  contactId: string;
  contactName: string;
  phone: string;
};

type Timing = {
  id: string;
  label: string;
  offsetMinutes: number;
  enabled: boolean;
};

function getLocalDateTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}

export default function AddFollowUpReminder({
  leadTypeId,
  contactId,
  contactName,
  phone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState(
    `Follow up with ${contactName}`
  );

  const [followUpAt, setFollowUpAt] = useState(getLocalDateTime());

  const [timings, setTimings] = useState<Timing[]>([
    {
      id: "before24",
      label: "24 hours before",
      offsetMinutes: -1440,
      enabled: true,
    },
    {
      id: "before2",
      label: "2 hours before",
      offsetMinutes: -120,
      enabled: true,
    },
    {
      id: "after2",
      label: "2 hours after",
      offsetMinutes: 120,
      enabled: true,
    },
  ]);

  const [customValue, setCustomValue] = useState("1");
  const [customUnit, setCustomUnit] = useState("hours");
  const [customDirection, setCustomDirection] = useState("before");

  const addCustomTiming = () => {
    const value = Number(customValue);

    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid timing.");
      return;
    }

    const multiplier =
      customUnit === "days"
        ? 1440
        : customUnit === "hours"
          ? 60
          : 1;

    const offset = value * multiplier;

    if (timings.length >= 30) {
      toast.error("Maximum 30 notification timings allowed.");
      return;
    }

    const signedOffset =
      customDirection === "before" ? -offset : offset;

    setTimings((previous) => [
      ...previous,
      {
        id: `custom-${Date.now()}`,
        label: `${value} ${customUnit} ${customDirection}`,
        offsetMinutes: signedOffset,
        enabled: true,
      },
    ]);
  };

  const toggleTiming = (id: string) => {
    setTimings((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, enabled: !item.enabled }
          : item
      )
    );
  };

  const removeTiming = (id: string) => {
    setTimings((previous) =>
      previous.filter((item) => item.id !== id)
    );
  };

  const saveReminder = async () => {
    if (!message.trim()) {
      toast.error("Please enter a reminder message.");
      return;
    }

    if (!followUpAt) {
      toast.error("Please select the follow-up date and time.");
      return;
    }

    const selectedTimings = timings.filter(
      (item) => item.enabled
    );

    if (selectedTimings.length === 0) {
      toast.error("Select at least one notification timing.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadTypeId,
          contactId,
          message: message.trim(),
          followUpAt: new Date(followUpAt).toISOString(),
          notifications: selectedTimings.map((item) => ({
            label: item.label,
            offsetMinutes: item.offsetMinutes,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to create reminder."
        );
      }

      toast.success("Follow-up reminder created successfully.");
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Unable to create reminder.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Add follow-up reminder"
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-green-50 hover:text-[#0CCB66]"
      >
        <AlarmClock size={15} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setOpen(false);
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <AlarmClock size={19} className="text-[#0CCB66]" />
                  <h2 className="text-lg font-semibold text-slate-800">
                    Add Follow-up Reminder
                  </h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Schedule a reminder for this contact.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>

            {/* Contact information */}
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="font-semibold text-slate-700">
                  {contactName}
                </span>
                <span className="text-slate-500">{phone}</span>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">

              {/* Reminder message */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Reminder Message
                </label>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Write what you need to follow up about..."
                  className="w-full resize-none rounded-lg border border-slate-200 px-3.5 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0CCB66] focus:ring-2 focus:ring-[#0CCB66]/10"
                />
              </div>

              {/* Date and time */}
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CalendarDays size={16} className="text-slate-500" />
                  Follow-up Date & Time
                </label>

                <input
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-[#0CCB66] focus:ring-2 focus:ring-[#0CCB66]/10"
                />
              </div>

              {/* Notification schedule */}
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Bell size={16} className="text-slate-500" />
                      Notification Schedule
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Choose when you want to receive notifications.
                    </p>
                  </div>

                  <span className="whitespace-nowrap rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                    {timings.filter((item) => item.enabled).length} Active
                  </span>
                </div>

                <div className="space-y-2">
                  {timings.map((timing) => (
                    <div
                      key={timing.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-3 transition hover:border-slate-300"
                    >
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={timing.enabled}
                          onChange={() => toggleTiming(timing.id)}
                          className="h-4 w-4 cursor-pointer accent-[#0CCB66]"
                        />

                        <span
                          className={`text-sm ${
                            timing.enabled
                              ? "font-medium text-slate-700"
                              : "text-slate-400"
                          }`}
                        >
                          {timing.label}
                        </span>
                      </label>

                      {timing.id.startsWith("custom-") && (
                        <button
                          type="button"
                          onClick={() => removeTiming(timing.id)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                          title="Remove timing"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom timing */}
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">
                  Add Custom Timing
                </h3>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">
                      Number
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0CCB66]"
                      placeholder="Number"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">
                      Unit
                    </label>
                    <select
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0CCB66]"
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">
                      Direction
                    </label>
                    <select
                      value={customDirection}
                      onChange={(e) => setCustomDirection(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0CCB66]"
                    >
                      <option value="before">Before</option>
                      <option value="after">After</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addCustomTiming}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#0CCB66] px-4 py-2.5 text-sm font-semibold text-[#079B4C] transition hover:bg-green-50"
                >
                  <Plus size={16} />
                  Add Timing
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveReminder}
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#0CCB66] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#09B45A] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <AlarmClock size={17} />
                )}
                {saving ? "Saving..." : "Save Reminder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
