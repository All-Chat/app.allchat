/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useSession } from "next-auth/react";

import {
  Bell,
  CalendarClock,
  Check,
  Clock3,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import { toast } from "react-toastify";

import FollowUpActivityForm from "@/components/FollowUpActivityForm";

type Reminder = {
  _id: string;
  leadTypeId: string;
  contactId: string;
  message: string;
  contactName: string;
  phone: string;
  followUpAt: string;
  status: string;
  notifications: {
    _id: string;
    label: string;
    notifyAt: string;
    status: string;
  }[];
};

type Popup = {
  reminderId: string;
  eventId: string;
  leadTypeId: string;
  contactId: string;
  message: string;
  contactName: string;
  phone: string;
  label: string;
  followUpAt: string;
};

function dateLabel(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function ReminderCenter() {
  const { status } = useSession();

  const [reminders, setReminders] =
    useState<Reminder[]>([]);

  const [popups, setPopups] =
    useState<Popup[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);

  const [selected, setSelected] =
    useState<Popup | Reminder | null>(null);

  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");

  const loadReminders = useCallback(async () => {
    try {
      const response = await fetch("/api/reminders", {
        cache: "no-store",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setReminders(data.reminders || []);
      }
    } catch (error) {
      console.error("Load reminders:", error);
    }
  }, []);

  const pollReminders = useCallback(async () => {
    try {
      const response = await fetch("/api/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "poll",
        }),
      });

      const data = await response.json();

      if (
        response.ok &&
        data.success &&
        Array.isArray(data.events) &&
        data.events.length
      ) {
        setPopups((old) => {
          const known = new Set(
            old.map((popup) => popup.eventId)
          );

          return [
            ...data.events.filter(
              (popup: Popup) =>
                !known.has(popup.eventId)
            ),
            ...old,
          ].slice(0, 5);
        });

        await loadReminders();
      }
    } catch (error) {
      console.error("Poll reminders:", error);
    }
  }, [loadReminders]);

  useEffect(() => {
    if (status !== "authenticated") return;

    setLoading(true);

    loadReminders().finally(() => setLoading(false));

    pollReminders();

    const timer = window.setInterval(() => {
      pollReminders();
      loadReminders();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [status, loadReminders, pollReminders]);

  async function deleteReminder(id: string) {
    if (!window.confirm("Delete this reminder?")) {
      return;
    }

    setWorkingId(id);

    try {
      const response = await fetch(
        `/api/reminders?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to delete reminder."
        );
      }

      setReminders((old) =>
        old.filter((reminder) => reminder._id !== id)
      );

      setPopups((old) =>
        old.filter((popup) => popup.reminderId !== id)
      );

      toast.success("Reminder deleted.");
    } catch (error: any) {
      toast.error(
        error.message || "Unable to delete reminder."
      );
    } finally {
      setWorkingId("");
    }
  }

  if (status !== "authenticated") return null;

  const notificationCount = reminders.reduce(
    (sum, reminder) =>
      sum +
      reminder.notifications.filter(
        (notification) =>
          notification.status === "notified"
      ).length,
    0
  );

  return (
    <>
      {/* Reminder button and panel */}
      <div className="fixed right-5 top-29 z-[90]">
        <button
          type="button"
          onClick={() => setPanelOpen((value) => !value)}
          className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          title="Follow-up reminders"
        >
          <Bell size={21} />

          {(notificationCount || reminders.length) > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {notificationCount || reminders.length}
            </span>
          )}
        </button>

        {panelOpen && (
          <div className="absolute right-0 top-14 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Follow-up reminders
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Scheduled customer follow-ups
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[65vh] space-y-3 overflow-y-auto p-3">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin text-emerald-600" />
                </div>
              ) : reminders.length === 0 ? (
                <div className="py-10 text-center">
                  <CalendarClock
                    className="mx-auto mb-3 text-slate-300"
                    size={30}
                  />

                  <p className="text-sm font-semibold text-slate-700">
                    No active reminders
                  </p>
                </div>
              ) : (
                reminders.map((reminder) => (
                  <div
                    key={reminder._id}
                    className="rounded-xl border border-slate-200 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {reminder.contactName}
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500">
                          {reminder.phone}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={
                          workingId === reminder._id
                        }
                        onClick={() =>
                          deleteReminder(reminder._id)
                        }
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-slate-700">
                      {reminder.message}
                    </p>

                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock3 size={13} />
                      {dateLabel(reminder.followUpAt)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelected(reminder)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <Check size={13} />
                        Log conversation & complete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Due reminder popups */}
      <div className="fixed bottom-5 right-5 z-[110] flex w-[min(370px,calc(100vw-32px))] flex-col gap-3">
        {popups.map((popup) => (
          <div
            key={popup.eventId}
            className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Bell size={16} />
                  </span>

                  <p className="text-sm font-bold text-slate-900">
                    Follow-up due
                  </p>
                </div>

                <p className="mt-2 text-xs font-semibold text-emerald-700">
                  {popup.contactName} · {popup.phone}
                </p>

                <p className="mt-1 text-sm text-slate-700">
                  {popup.message}
                </p>

                <button
                  type="button"
                  onClick={() => setSelected(popup)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Check size={13} />
                  Log conversation & complete
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setPopups((old) =>
                    old.filter(
                      (item) =>
                        item.eventId !== popup.eventId
                    )
                  )
                }
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Conversation form for reminder completion */}
      {selected &&
        (() => {
          const reminderId =
            "reminderId" in selected
              ? selected.reminderId
              : selected._id;

          return (
            <FollowUpActivityForm
              open
              onClose={() => setSelected(null)}
              onSaved={async () => {
                setSelected(null);

                setPopups((old) =>
                  old.filter(
                    (popup) =>
                      popup.reminderId !== reminderId
                  )
                );

                await loadReminders();
              }}
              leadTypeId={selected.leadTypeId}
              contactId={selected.contactId}
              contactName={selected.contactName}
              phone={selected.phone}
              reminderId={reminderId}
            />
          );
        })()}
    </>
  );
}
