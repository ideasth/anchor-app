// Stage 17 — Family week-view SPA.
// Served from buoy-family.thinhalo.com.
//
// Week view: Mon-Sun for the current ISO week (Australia/Melbourne),
// with prev/next navigation up to ±12 weeks.
// Add Event button, day note and week note editing.

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoWeekLabel(d: Date): string {
  // ISO week: Monday-anchored. Jan 4 is always in week 1.
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000);
  const diffDays = Math.round((d.getTime() - mondayW1.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  // Edge: if week is 53 or 0, defer to previous/next year — simplified here.
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function mondayOfIsoWeek(isoWeek: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!m) return new Date();
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000);
  return new Date(mondayW1.getTime() + (week - 1) * 7 * 86400000);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FamilyEvent {
  id: number;
  title: string;
  start_utc: string;
  end_utc: string;
  all_day: number;
  location?: string;
  notes?: string;
  count_as_busy_for_public: number;
  added_by?: string;
}

interface DayNote {
  id: number;
  date_local: string;
  body: string;
}

interface WeekNote {
  id: number;
  iso_week: string;
  body: string;
}

// ---------------------------------------------------------------------------
// API helpers — use relative URLs (same origin, no auth headers needed:
// the server family-auth middleware handles auth via Basic / cookie)
// ---------------------------------------------------------------------------

const FAMILY_API = "";

async function apiFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${FAMILY_API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  return res;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FamilyApp() {
  const now = new Date();
  const todayYmd = ymd(now);
  const currentIsoWeek = isoWeekLabel(now);

  const [currentWeek, setCurrentWeek] = useState(currentIsoWeek);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [editingDayNote, setEditingDayNote] = useState<string | null>(null);
  const [editingWeekNote, setEditingWeekNote] = useState(false);

  const monday = mondayOfIsoWeek(currentWeek);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const fromUtc = monday.toISOString();
  const toUtc = addDays(monday, 7).toISOString();

  const qc = useQueryClient();

  // Fetch events for the week
  const { data: eventsData } = useQuery({
    queryKey: ["family-events", fromUtc, toUtc],
    queryFn: async () => {
      const r = await apiFetch("GET", `/family/api/events?from=${encodeURIComponent(fromUtc)}&to=${encodeURIComponent(toUtc)}`);
      if (!r.ok) throw new Error("failed to load events");
      return r.json() as Promise<{ events: FamilyEvent[] }>;
    },
  });

  // Fetch week note
  const { data: weekNoteData } = useQuery({
    queryKey: ["family-week-note", currentWeek],
    queryFn: async () => {
      const r = await apiFetch("GET", `/family/api/notes/week/${currentWeek}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("failed to load week note");
      return r.json() as Promise<WeekNote>;
    },
  });

  const allEvents = eventsData?.events ?? [];

  // Mutations
  const createEvent = useMutation({
    mutationFn: async (data: Omit<FamilyEvent, "id" | "added_by">) => {
      const r = await apiFetch("POST", "/family/api/events", data);
      if (!r.ok) throw new Error("failed to create event");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["family-events"] });
      setShowAddEvent(false);
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch("DELETE", `/family/api/events/${id}`);
      if (!r.ok) throw new Error("failed to delete event");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["family-events"] }),
  });

  const saveWeekNote = useMutation({
    mutationFn: async (body: string) => {
      const r = await apiFetch("PUT", `/family/api/notes/week/${currentWeek}`, { body });
      if (!r.ok) throw new Error("failed to save note");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["family-week-note", currentWeek] });
      setEditingWeekNote(false);
    },
  });

  const saveDayNote = useMutation({
    mutationFn: async ({ date, body }: { date: string; body: string }) => {
      const r = await apiFetch("PUT", `/family/api/notes/day/${date}`, { body });
      if (!r.ok) throw new Error("failed to save day note");
    },
    onSuccess: () => {
      weekDays.forEach((d) => qc.invalidateQueries({ queryKey: ["family-day-note", ymd(d)] }));
      setEditingDayNote(null);
    },
  });

  function prevWeek() {
    const m = mondayOfIsoWeek(currentWeek);
    setCurrentWeek(isoWeekLabel(addDays(m, -7)));
  }

  function nextWeek() {
    const m = mondayOfIsoWeek(currentWeek);
    setCurrentWeek(isoWeekLabel(addDays(m, 7)));
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Family Calendar</h1>
        <button
          onClick={() => setShowAddEvent(true)}
          className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
        >
          Add Event
        </button>
      </header>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={prevWeek} className="text-sm px-2 py-1 border rounded">Prev</button>
        <span className="font-medium text-sm">{currentWeek}</span>
        <button onClick={nextWeek} className="text-sm px-2 py-1 border rounded">Next</button>
        <button
          onClick={() => setCurrentWeek(currentIsoWeek)}
          className="text-sm px-2 py-1 border rounded"
        >
          Today
        </button>
      </div>

      {/* Week note banner */}
      <div
        className="mb-4 p-2 border rounded text-sm cursor-pointer hover:bg-muted"
        onClick={() => setEditingWeekNote(true)}
      >
        {weekNoteData?.body
          ? <span>{weekNoteData.body}</span>
          : <span className="text-muted-foreground italic">Click to add week note...</span>}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {weekDays.map((day) => (
          <DayColumn
            key={ymd(day)}
            day={day}
            isToday={ymd(day) === todayYmd}
            events={allEvents.filter((ev) => {
              const s = new Date(ev.start_utc);
              const e = new Date(ev.end_utc);
              const dayStart = new Date(ymd(day) + "T00:00:00Z");
              const dayEnd = new Date(ymd(day) + "T23:59:59Z");
              return s <= dayEnd && e >= dayStart;
            })}
            onEditEvent={setEditingEvent}
            onDeleteEvent={(id) => deleteEvent.mutate(id)}
            onEditDayNote={(d) => setEditingDayNote(d)}
          />
        ))}
      </div>

      {/* Modals */}
      {showAddEvent && (
        <EventDialog
          onSave={(data) => createEvent.mutate(data as any)}
          onCancel={() => setShowAddEvent(false)}
        />
      )}

      {editingEvent && (
        <EventDialog
          event={editingEvent}
          onSave={async (data) => {
            const r = await apiFetch("PATCH", `/family/api/events/${editingEvent.id}`, data);
            if (!r.ok) throw new Error("failed to update");
            qc.invalidateQueries({ queryKey: ["family-events"] });
            setEditingEvent(null);
          }}
          onCancel={() => setEditingEvent(null)}
          onDelete={() => {
            deleteEvent.mutate(editingEvent.id);
            setEditingEvent(null);
          }}
        />
      )}

      {editingWeekNote && (
        <NoteDialog
          title="Week note"
          initialBody={weekNoteData?.body ?? ""}
          onSave={(body) => saveWeekNote.mutate(body)}
          onCancel={() => setEditingWeekNote(false)}
        />
      )}

      {editingDayNote && (
        <DayNoteDialogWithFetch
          date={editingDayNote}
          onSave={(body) => saveDayNote.mutate({ date: editingDayNote, body })}
          onCancel={() => setEditingDayNote(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayColumn
// ---------------------------------------------------------------------------

function DayColumn({
  day,
  isToday,
  events,
  onEditEvent,
  onDeleteEvent,
  onEditDayNote,
}: {
  day: Date;
  isToday: boolean;
  events: FamilyEvent[];
  onEditEvent: (ev: FamilyEvent) => void;
  onDeleteEvent: (id: number) => void;
  onEditDayNote: (d: string) => void;
}) {
  const dayStr = ymd(day);
  const { data: dayNoteData } = useQuery({
    queryKey: ["family-day-note", dayStr],
    queryFn: async () => {
      const r = await apiFetch("GET", `/family/api/notes/day/${dayStr}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<DayNote>;
    },
  });

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const label = DAYS[day.getUTCDay()];

  return (
    <div
      className={`border rounded p-1 flex flex-col min-h-32 text-xs ${isToday ? "border-primary" : ""}`}
    >
      <div className={`font-semibold mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
        {label} {day.getUTCDate()}
      </div>
      <div className="flex-1 space-y-1">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="bg-blue-100 dark:bg-blue-900/30 rounded px-1 py-0.5 cursor-pointer truncate"
            onClick={() => onEditEvent(ev)}
          >
            {ev.title}
          </div>
        ))}
      </div>
      <div
        className="mt-1 text-muted-foreground cursor-pointer hover:text-foreground truncate"
        onClick={() => onEditDayNote(dayStr)}
      >
        {dayNoteData?.body ? dayNoteData.body : <span className="italic">note...</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventDialog
// ---------------------------------------------------------------------------

function EventDialog({
  event,
  onSave,
  onCancel,
  onDelete,
}: {
  event?: FamilyEvent;
  onSave: (data: unknown) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [startUtc, setStartUtc] = useState(
    event?.start_utc ? event.start_utc.slice(0, 16) : new Date().toISOString().slice(0, 16),
  );
  const [endUtc, setEndUtc] = useState(
    event?.end_utc ? event.end_utc.slice(0, 16) : new Date(Date.now() + 3600000).toISOString().slice(0, 16),
  );
  const [allDay, setAllDay] = useState(event?.all_day === 1);
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [countAsBusy, setCountAsBusy] = useState(event?.count_as_busy_for_public ?? 1);

  function handleSave() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      start_utc: startUtc + ":00Z",
      end_utc: endUtc + ":00Z",
      all_day: allDay ? 1 : 0,
      location: location || null,
      notes: notes || null,
      count_as_busy_for_public: countAsBusy,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg p-6 w-full max-w-md space-y-3">
        <h2 className="text-lg font-semibold">{event ? "Edit Event" : "Add Event"}</h2>
        <div>
          <label className="text-sm text-muted-foreground">Title</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm mt-0.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="allday" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <label htmlFor="allday" className="text-sm">All day</label>
        </div>
        {!allDay && (
          <>
            <div>
              <label className="text-sm text-muted-foreground">Start</label>
              <input
                type="datetime-local"
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                value={startUtc}
                onChange={(e) => setStartUtc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">End</label>
              <input
                type="datetime-local"
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                value={endUtc}
                onChange={(e) => setEndUtc(e.target.value)}
              />
            </div>
          </>
        )}
        <div>
          <label className="text-sm text-muted-foreground">Location (optional)</label>
          <input
            className="w-full border rounded px-2 py-1 text-sm mt-0.5"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Notes (optional)</label>
          <textarea
            className="w-full border rounded px-2 py-1 text-sm mt-0.5"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="busyPublic"
            checked={countAsBusy === 1}
            onChange={(e) => setCountAsBusy(e.target.checked ? 1 : 0)}
          />
          <label htmlFor="busyPublic" className="text-sm">Count as busy for public availability</label>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-1 text-sm border border-destructive text-destructive rounded"
            >
              Delete
            </button>
          )}
          <button onClick={onCancel} className="px-3 py-1 text-sm border rounded">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteDialog (week note)
// ---------------------------------------------------------------------------

function NoteDialog({
  title,
  initialBody,
  onSave,
  onCancel,
}: {
  title: string;
  initialBody: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border rounded-lg p-6 w-full max-w-md space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave empty to delete note"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1 text-sm border rounded">Cancel</button>
          <button
            onClick={() => onSave(body)}
            className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayNoteDialogWithFetch
// ---------------------------------------------------------------------------

function DayNoteDialogWithFetch({
  date,
  onSave,
  onCancel,
}: {
  date: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["family-day-note", date],
    queryFn: async () => {
      const r = await apiFetch("GET", `/family/api/notes/day/${date}`);
      if (r.status === 404) return null;
      return r.json() as Promise<DayNote>;
    },
  });

  return (
    <NoteDialog
      title={`Day note — ${date}`}
      initialBody={data?.body ?? ""}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
