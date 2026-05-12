// Stage 16 (2026-05-12) — Source filter chip row.
//
// Chips allow the user to choose which calendars are searched against.
// State persists in localStorage.findTimeSources.
// Chips for Marieke/Hilde/Axel ICS feeds render only when those feeds
// exist in the settings (Stage 17 will populate them; currently empty).

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface SourceChip {
  key: string;
  label: string;
  defaultOn: boolean;
}

const FIXED_CHIPS: SourceChip[] = [
  { key: "outlook", label: "My Outlook", defaultOn: true },
  { key: "buoy", label: "My Buoy events", defaultOn: true },
];

const STORAGE_KEY = "findTimeSources";

function loadFromStorage(allKeys: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // Ignore parse errors.
  }
  // Default: all defaultOn chips enabled.
  return new Set(allKeys.filter((k) => FIXED_CHIPS.find((c) => c.key === k)?.defaultOn ?? false));
}

interface Props {
  /** Extra ICS-feed chips (from settings, populated by Stage 17). */
  extraChips?: SourceChip[];
  onChange: (activeSources: string[]) => void;
}

export function SourceChips({ extraChips = [], onChange }: Props) {
  const allChips = [...FIXED_CHIPS, ...extraChips];
  const allKeys = allChips.map((c) => c.key);

  const [active, setActive] = useState<Set<string>>(() => loadFromStorage(allKeys));

  // Persist to localStorage and notify parent whenever state changes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(active)));
    } catch {
      // Storage may be unavailable in some contexts.
    }
    onChange(Array.from(active));
  }, [active, onChange]);

  function toggle(key: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center" data-testid="source-chips">
      <span className="text-xs text-muted-foreground mr-1">Search:</span>
      {allChips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => toggle(chip.key)}
          data-testid={`chip-${chip.key}`}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            active.has(chip.key)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary",
          )}
          aria-pressed={active.has(chip.key)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
