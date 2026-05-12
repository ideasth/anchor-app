// Stage 17 — Manual overrides page (/settings/calendars/blocks).
// Lists public_calendar_blocks with Add + Delete.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Block {
  id: number;
  kind: "force_available" | "force_busy" | "rule_off_day";
  start_utc: string | null;
  end_utc: string | null;
  weekday: number | null;
  source_event_id: string | null;
  note: string | null;
  created_at: string;
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const KIND_LABELS: Record<string, string> = {
  force_available: "Force available",
  force_busy: "Force busy",
  rule_off_day: "Off day (rule)",
};

export default function CalendarBlocks() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<Block["kind"]>("force_busy");
  const [startUtc, setStartUtc] = useState("");
  const [endUtc, setEndUtc] = useState("");
  const [weekday, setWeekday] = useState<number>(1);
  const [note, setNote] = useState("");

  const { data } = useQuery<{ blocks: Block[] }>({
    queryKey: ["/api/settings/calendars/blocks"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/settings/calendars/blocks");
      return r.json();
    },
  });

  const blocks = data?.blocks ?? [];

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/settings/calendars/blocks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/settings/calendars/blocks"] }),
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const createMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      await apiRequest("POST", "/api/settings/calendars/blocks", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/calendars/blocks"] });
      setShowAdd(false);
      setNote("");
    },
    onError: () => toast({ title: "Create failed", variant: "destructive" }),
  });

  function submitAdd() {
    const body: Record<string, unknown> = { kind, note: note || null };
    if (kind === "rule_off_day") {
      body.weekday = weekday;
    } else {
      body.start_utc = startUtc ? startUtc + ":00Z" : null;
      body.end_utc = endUtc ? endUtc + ":00Z" : null;
    }
    createMut.mutate(body);
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Manual calendar overrides</h1>
        <a href="/#/settings/calendars" className="text-sm text-primary underline">
          Back to calendar settings
        </a>
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="text-sm px-3 py-1 border rounded"
      >
        Add override
      </button>

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">New override</h2>
          <div>
            <label className="text-sm text-muted-foreground">Kind</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              value={kind}
              onChange={(e) => setKind(e.target.value as Block["kind"])}
            >
              <option value="force_available">Force available</option>
              <option value="force_busy">Force busy</option>
              <option value="rule_off_day">Off day (entire weekday)</option>
            </select>
          </div>

          {kind === "rule_off_day" ? (
            <div>
              <label className="text-sm text-muted-foreground">Weekday</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {WEEKDAY_LABELS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm text-muted-foreground">Start (UTC)</label>
                <input
                  type="datetime-local"
                  className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                  value={startUtc}
                  onChange={(e) => setStartUtc(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">End (UTC)</label>
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
            <label className="text-sm text-muted-foreground">Note (private, never emitted)</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="text-sm px-3 py-1 border rounded"
            >
              Cancel
            </button>
            <button
              onClick={submitAdd}
              className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="space-y-2">
        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No overrides yet.</p>
        )}
        {blocks.map((b) => (
          <div key={b.id} className="border rounded p-3 text-sm flex items-start justify-between gap-3">
            <div>
              <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${
                b.kind === "force_available"
                  ? "bg-green-100 text-green-800"
                  : b.kind === "force_busy"
                  ? "bg-red-100 text-red-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}>
                {KIND_LABELS[b.kind]}
              </span>
              {b.kind === "rule_off_day"
                ? `Every ${WEEKDAY_LABELS[b.weekday ?? 0]}`
                : `${b.start_utc ?? "?"} — ${b.end_utc ?? "?"}`}
              {b.note && (
                <span className="ml-2 text-muted-foreground truncate max-w-xs inline-block">
                  {b.note}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                if (confirm("Delete this override?")) deleteMut.mutate(b.id);
              }}
              className="text-xs text-destructive border border-destructive rounded px-2 py-0.5 shrink-0"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
