/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  X,
  Phone,
  User,
  Clock,
  MessageSquare,
  Filter,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

type CalendarEvent = {
  id: string;
  date: string;
  leadTypeId: string;
  leadTypeName: string;
  color: string;
  contactId: string;
  customerName: string;
  phone: string;
  interactionType: string;
  personContacted: string;
  agentName: string;
  outcome: string;
  summary: string;
  nextFollowUpAt: string | null;
  reminderId: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatMonth = (date: Date) =>
  date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

const formatDate = (value: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const dateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedLeadType, setSelectedLeadType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/calendar/events?month=${monthKey(currentMonth)}`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load calendar");
      }

      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const leadTypes = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();

    events.forEach((event) => {
      map.set(event.leadTypeId, {
        id: event.leadTypeId,
        name: event.leadTypeName,
        color: event.color,
      });
    });

    return Array.from(map.values());
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (selectedLeadType === "all") return events;
    return events.filter((event) => event.leadTypeId === selectedLeadType);
  }, [events, selectedLeadType]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    filteredEvents.forEach((event) => {
      const date = new Date(event.date);
      const key = dateKey(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    });

    return map;
  }, [filteredEvents]);

  const days = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((firstDay + totalDays) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - firstDay + 1;
      if (dayNumber < 1 || dayNumber > totalDays) return null;
      return new Date(year, month, dayNumber);
    });
  }, [currentMonth]);

  const todayKey = dateKey(new Date());
  const totalActivities = filteredEvents.length;
  const daysWithActivities = eventsByDay.size;

  const previousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 md:ml-64">
        <div className="mx-auto max-w-[1600px] space-y-6">
          {/* Page heading */}
          <div className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-r from-white via-emerald-50 to-green-100/80 p-5 shadow-sm sm:p-7">
            <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-lime-200/30 blur-2xl" />

            <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                  <Sparkles size={14} />
                  CRM ACTIVITY OVERVIEW
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Activity Calendar
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Keep track of customer conversations, completed follow-ups and
                  your team&apos;s daily activity.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
                <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <span className="rounded-lg bg-emerald-100 p-2">
                      <CheckCircle2 size={17} />
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Activities
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                    {totalActivities}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                  <div className="flex items-center gap-2 text-teal-700">
                    <span className="rounded-lg bg-teal-100 p-2">
                      <CalendarDays size={17} />
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Active days
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                    {daysWithActivities}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar controls */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    onClick={previousMonth}
                    className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-emerald-700 hover:shadow-sm"
                    aria-label="Previous month"
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <h2 className="min-w-40 px-3 text-center text-base font-bold text-slate-800">
                    {formatMonth(currentMonth)}
                  </h2>
                  <button
                    onClick={nextMonth}
                    className="rounded-lg p-2 text-slate-600 transition hover:bg-white hover:text-emerald-700 hover:shadow-sm"
                    aria-label="Next month"
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>

                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                >
                  Today
                </button>

                <button
                  onClick={fetchEvents}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label
                  htmlFor="leadTypeFilter"
                  className="flex items-center gap-2 text-sm font-medium text-slate-500"
                >
                  <Filter size={16} className="text-emerald-600" />
                  Filter by Lead Type
                </label>
                <select
                  id="leadTypeFilter"
                  value={selectedLeadType}
                  onChange={(e) => setSelectedLeadType(e.target.value)}
                  className="w-full min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 sm:w-auto"
                >
                  <option value="all">All Lead Types</option>
                  {leadTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {leadTypes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {leadTypes.map((type) => {
                  const isActive =
                    selectedLeadType === "all" ||
                    selectedLeadType === type.id;

                  return (
                    <button
                      key={type.id}
                      onClick={() =>
                        setSelectedLeadType(
                          selectedLeadType === type.id ? "all" : type.id
                        )
                      }
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                          : "border-slate-100 bg-white text-slate-400 opacity-60"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: type.color }}
                      />
                      {type.name}
                    </button>
                  );
                })}
                <span className="ml-auto self-center text-xs text-slate-400">
                  Select a lead type to filter activities
                </span>
              </div>
            )}
          </section>

          {/* Calendar grid */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-white px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Monthly Schedule
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Select an activity to view its details
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                {totalActivities} total
              </span>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="border-r border-slate-100 px-1 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 last:border-r-0 sm:text-xs"
                >
                  {day}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex min-h-[380px] items-center justify-center gap-3 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                Loading activities...
              </div>
            ) : error ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center px-5 text-center">
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
                  <CalendarDays size={24} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  Could not load calendar activities
                </p>
                <p className="mt-1 max-w-md text-sm text-rose-600">{error}</p>
                <button
                  onClick={fetchEvents}
                  className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {days.map((date, index) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${index}`}
                        className="min-h-28 border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-36 lg:min-h-40"
                      />
                    );
                  }

                  const key = dateKey(date);
                  const dayEvents = eventsByDay.get(key) || [];
                  const isToday = key === todayKey;

                  return (
                    <div
                      key={key}
                      className={`min-h-28 border-b border-r border-slate-100 p-1.5 transition-colors last:border-r-0 hover:bg-emerald-50/30 sm:min-h-36 sm:p-2 lg:min-h-40 ${
                        isToday ? "bg-emerald-50/40" : "bg-white"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:h-8 sm:w-8 sm:text-sm ${
                            isToday
                              ? "bg-emerald-600 text-white shadow-md shadow-emerald-200"
                              : "text-slate-600"
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 sm:text-[10px]">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        {dayEvents.map((event) => (
                          <button
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            title={`${event.customerName} - ${event.leadTypeName}`}
                            className="group flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-1 text-left transition hover:border-emerald-200 hover:bg-emerald-50 hover:shadow-sm sm:px-2"
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white"
                              style={{ backgroundColor: event.color }}
                            />
                            <span className="truncate text-[9px] font-semibold text-slate-600 group-hover:text-emerald-800 sm:text-[10px]">
                              {event.leadTypeName}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex flex-col justify-between gap-2 pb-2 text-xs text-slate-400 sm:flex-row sm:items-center">
            <p>Activity dates are based on the recorded interaction date.</p>
            <p>Click any activity label to view its complete details.</p>
          </div>
        </div>
      </main>

      {/* Activity details modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-5"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-emerald-100 bg-white shadow-2xl shadow-slate-950/20">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 rounded-2xl p-3"
                  style={{
                    backgroundColor: `${selectedEvent.color}20`,
                    color: selectedEvent.color,
                  }}
                >
                  <CalendarDays size={21} />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                    Customer activity
                  </span>
                  <h3 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">
                    Follow-up Details
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(selectedEvent.date)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-800 hover:shadow-sm"
                aria-label="Close details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <section>
                <SectionHeading title="Customer Information" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Detail
                    label="Lead Type"
                    value={selectedEvent.leadTypeName}
                    accent
                  />
                  <Detail
                    label="Customer Name"
                    value={selectedEvent.customerName}
                    icon={<User size={15} />}
                  />
                  <Detail
                    label="Phone Number"
                    value={selectedEvent.phone}
                    icon={<Phone size={15} />}
                  />
                  <Detail
                    label="Person Contacted"
                    value={selectedEvent.personContacted}
                  />
                </div>
              </section>

              <section>
                <SectionHeading title="Activity Information" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Detail
                    label="Activity Type"
                    value={selectedEvent.interactionType}
                  />
                  <Detail label="Agent" value={selectedEvent.agentName} />
                  <Detail label="Outcome" value={selectedEvent.outcome} />
                  <Detail
                    label="Activity Date"
                    value={formatDate(selectedEvent.date)}
                    icon={<Clock size={15} />}
                  />
                </div>
              </section>

              <section>
                <SectionHeading
                  title="Conversation Summary"
                  icon={<MessageSquare size={16} />}
                />
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm leading-6 text-slate-700">
                  {selectedEvent.summary || "No summary provided."}
                </div>
              </section>

              <section>
                <SectionHeading title="Next Follow-up" />
                <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
                  <span className="rounded-xl bg-white p-2 text-teal-700 shadow-sm">
                    <Clock size={17} />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-teal-700">
                      Scheduled follow-up
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">
                      {selectedEvent.nextFollowUpAt
                        ? formatDate(selectedEvent.nextFollowUpAt)
                        : "No next follow-up scheduled"}
                    </p>
                  </div>
                </div>
              </section>

              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  title,
  icon,
}: {
  title: string;
  icon?: ReactNode;
}) {
  return (
    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
      <span className="h-4 w-1 rounded-full bg-emerald-500" />
      {icon}
      {title}
    </h4>
  );
}

function Detail({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value?: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        accent
          ? "border-emerald-100 bg-emerald-50/70"
          : "border-slate-100 bg-slate-50/70"
      }`}
    >
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon && <span className="shrink-0 text-emerald-600">{icon}</span>}
        <span className="break-all">{value || "—"}</span>
      </div>
    </div>
  );
}
