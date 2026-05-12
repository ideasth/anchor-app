// Stage 16 (2026-05-12) — Parsed interpretation display + inline editing.
//
// Shows the parsed JSON as human-readable copy and allows the user to:
//   - adjust durationMinutes via a number stepper
//   - toggle dateConstraints (weekday chips)
//   - switch timePreferences between morning / afternoon / evening pills
//
// On any edit, calls onRefinement with the updated parsed payload so the
// parent can re-submit via the {parsed} path (no LLM call).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ParsedScheduling {
  activity: string;
  durationMinutes: number | null;
  locationType: "online" | "in_person" | "unspecified";
  locationLabel: string | null;
  travelMinutesBefore: number;
  travelMinutesAfter: number;
  dateConstraints: Array<{
    type: string;
    value: string;
    partOfDay: string | null;
  }>;
  timePreferences: Array<{ partOfDay: string }> | null;
}

interface Props {
  parsed: ParsedScheduling;
  onRefinement: (updated: ParsedScheduling) => void;
}

const PARTS_OF_DAY = ["morning", "afternoon", "evening"] as const;

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildSummary(p: ParsedScheduling): string {
  const parts: string[] = [];
  if (p.durationMinutes) parts.push(`${p.durationMinutes}-minute`);
  if (p.locationType === "online") parts.push("online");
  else if (p.locationType === "in_person") parts.push("in-person");
  parts.push(p.activity);
  if (p.locationLabel) parts.push(`at ${p.locationLabel}`);
  if (p.travelMinutesBefore > 0 || p.travelMinutesAfter > 0) {
    if (p.travelMinutesBefore === p.travelMinutesAfter) {
      parts.push(`(${p.travelMinutesBefore} min travel each way)`);
    } else {
      parts.push(
        `(${p.travelMinutesBefore} min travel before, ${p.travelMinutesAfter} min after)`,
      );
    }
  }
  return capitalise(parts.join(" "));
}

function datesLabel(p: ParsedScheduling): string {
  const dc = p.dateConstraints;
  if (dc.length === 0) return "no dates specified";
  return dc
    .map((c) => {
      let s = capitalise(c.value);
      if (c.partOfDay) s += ` ${c.partOfDay}`;
      return s;
    })
    .join(", ");
}

export function ParsedInterpretation({ parsed, onRefinement }: Props) {
  const [local, setLocal] = useState<ParsedScheduling>(parsed);

  function update(patch: Partial<ParsedScheduling>) {
    const updated = { ...local, ...patch };
    setLocal(updated);
    onRefinement(updated);
  }

  function setDuration(val: number) {
    update({ durationMinutes: val > 0 ? val : null });
  }

  function toggleDayPod(idx: number, pod: string) {
    const dc = [...local.dateConstraints];
    const entry = dc[idx];
    if (!entry) return;
    dc[idx] = { ...entry, partOfDay: entry.partOfDay === pod ? null : pod };
    update({ dateConstraints: dc });
  }

  function setGlobalPod(pod: string) {
    const prefs = local.timePreferences ?? [];
    const alreadySet = prefs.some((p) => p.partOfDay === pod);
    update({
      timePreferences: alreadySet ? null : [{ partOfDay: pod }],
    });
  }

  return (
    <div
      className="rounded-md border bg-muted/40 p-3 space-y-3 text-sm"
      data-testid="parsed-interpretation"
    >
      <p className="font-medium text-foreground">
        Searching for: <span className="font-normal">{buildSummary(local)}</span>
      </p>

      {/* Duration stepper */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 shrink-0">Duration</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setDuration((local.durationMinutes ?? 0) - 15)}
          disabled={(local.durationMinutes ?? 0) <= 15}
          data-testid="duration-minus"
        >
          &minus;
        </Button>
        <span className="w-12 text-center" data-testid="duration-value">
          {local.durationMinutes ? `${local.durationMinutes} min` : "—"}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setDuration((local.durationMinutes ?? 0) + 15)}
          data-testid="duration-plus"
        >
          +
        </Button>
      </div>

      {/* Date / part-of-day chips */}
      <div className="flex flex-wrap gap-2 items-start">
        <span className="text-muted-foreground w-20 shrink-0 pt-1">Days</span>
        <div className="flex flex-wrap gap-1">
          {local.dateConstraints.length === 0 ? (
            <span className="text-muted-foreground italic">no dates specified</span>
          ) : (
            local.dateConstraints.map((dc, i) => (
              <div key={i} className="flex items-center gap-1">
                <span
                  className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                  data-testid={`dc-chip-${i}`}
                >
                  {capitalise(dc.value)}
                </span>
                {PARTS_OF_DAY.map((pod) => (
                  <button
                    key={pod}
                    type="button"
                    onClick={() => toggleDayPod(i, pod)}
                    data-testid={`dc-pod-${i}-${pod}`}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs transition-colors",
                      dc.partOfDay === pod
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary",
                    )}
                  >
                    {pod}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Global time-preference pills (only shown when no per-day pod set) */}
      {local.dateConstraints.every((dc) => !dc.partOfDay) && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 shrink-0">Time</span>
          {PARTS_OF_DAY.map((pod) => (
            <button
              key={pod}
              type="button"
              onClick={() => setGlobalPod(pod)}
              data-testid={`pref-${pod}`}
              className={cn(
                "rounded-full border px-3 py-0.5 text-xs transition-colors",
                (local.timePreferences ?? []).some((p) => p.partOfDay === pod)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary",
              )}
            >
              {capitalise(pod)}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground" data-testid="dates-summary">
        {datesLabel(local)}
      </p>
    </div>
  );
}
