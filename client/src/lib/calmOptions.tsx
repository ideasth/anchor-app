// Stage 13a (2026-05-12) — Calm chip option sets + shared chip-row
// component. Built on the same ChipOption shape as morningOptions.tsx so
// the Calm page is visually consistent with Reflect.
//
// Mind categories are multi-select; "Other" reveals an inline label
// input. All option values use Title Case labels with emoji icons per
// spec; code comments stay emoji-free.

import { cn } from "@/lib/utils";
import {
  AROUSAL_STATE_OPTIONS,
  ENERGY_OPTIONS,
  SLEEP_OPTIONS,
  MOOD_OPTIONS,
  COGNITIVE_LOAD_OPTIONS,
  FOCUS_OPTIONS,
  ALIGNMENT_PEOPLE_OPTIONS,
  ALIGNMENT_ACTIVITIES_OPTIONS,
  type ChipOption,
} from "./morningOptions";

// Re-export the shared single-select chip option arrays under Calm
// names. Values match morningOptions exactly so analytics can join across
// pages.
export {
  AROUSAL_STATE_OPTIONS,
  ENERGY_OPTIONS,
  SLEEP_OPTIONS,
  MOOD_OPTIONS,
  COGNITIVE_LOAD_OPTIONS,
  FOCUS_OPTIONS,
  ALIGNMENT_PEOPLE_OPTIONS,
  ALIGNMENT_ACTIVITIES_OPTIONS,
};

// Stage 13a — "What's on my mind" multi-select. Title-cased labels per
// spec. "Other" reveals an inline free-text label input when toggled on.
export const MIND_CATEGORY_OPTIONS: ChipOption[] = [
  { value: "Relationship", label: "Relationship", icon: "❤️" },
  { value: "House", label: "House", icon: "\u{1F3E0}" },
  { value: "Kids", label: "Kids", icon: "\u{1F467}" },
  { value: "Work", label: "Work", icon: "✚" },
  { value: "Other", label: "Other", icon: "✳️" },
];

// Visual chip used in single-select rows. Same look as morningOptions'
// ReflectionChipRow but unwrapped into a tiny primitive so the multi-
// select group can reuse it too.
export function CalmChip({
  selected,
  option,
  onClick,
  testId,
}: {
  selected: boolean;
  option: ChipOption;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={option.label}
      title={option.label}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover-elevate active-elevate-2",
        selected
          ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {option.icon && <span aria-hidden="true">{option.icon}</span>}
      <span>{option.label}</span>
    </button>
  );
}

export function CalmSingleSelectRow({
  label,
  options,
  value,
  onPick,
  testIdPrefix,
}: {
  label: string;
  options: ChipOption[];
  value: string | null;
  onPick: (next: string | null) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <CalmChip
              key={o.value}
              selected={selected}
              option={o}
              testId={`${testIdPrefix}-${o.value}`}
              onClick={() => onPick(selected ? null : o.value)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function CalmMultiSelectRow({
  label,
  options,
  values,
  onToggle,
  testIdPrefix,
}: {
  label: string;
  options: ChipOption[];
  values: string[];
  onToggle: (value: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const selected = values.includes(o.value);
          return (
            <CalmChip
              key={o.value}
              selected={selected}
              option={o}
              testId={`${testIdPrefix}-${o.value}`}
              onClick={() => onToggle(o.value)}
            />
          );
        })}
      </div>
    </div>
  );
}

// Stage 13a chip state — single object so the post-capture screen can
// initialise from the pre-capture values with one assignment.
export interface CalmChipState {
  arousal: string | null;
  energy: string | null;
  sleep: string | null;
  mood: string | null;
  cognitiveLoad: string | null;
  focus: string | null;
  alignmentPeople: string | null;
  alignmentValues: string | null;
  mindCategories: string[];
  mindOtherLabel: string;
  brainDump: string;
}

export const EMPTY_CALM_CHIP_STATE: CalmChipState = {
  arousal: null,
  energy: null,
  sleep: null,
  mood: null,
  cognitiveLoad: null,
  focus: null,
  alignmentPeople: null,
  alignmentValues: null,
  mindCategories: [],
  mindOtherLabel: "",
  brainDump: "",
};

// Build the server payload from a chip state. Used by both pre-capture
// (sent to /sessions) and post-capture (sent to /complete) so the field
// names stay aligned across both routes.
export function chipStateToPayload(
  state: CalmChipState,
  phase: "pre" | "post",
): Record<string, string | string[] | null> {
  const k = (suffix: string) => `${phase}_${suffix}`;
  return {
    [k("arousal")]: state.arousal,
    [k("energy")]: state.energy,
    [k("sleep")]: state.sleep,
    [k("mood")]: state.mood,
    [k("cognitive_load")]: state.cognitiveLoad,
    [k("focus")]: state.focus,
    [k("alignment_people")]: state.alignmentPeople,
    [k("alignment_values")]: state.alignmentValues,
    [k("mind_categories")]: state.mindCategories,
    [k("mind_other_label")]:
      state.mindCategories.includes("Other") && state.mindOtherLabel.trim()
        ? state.mindOtherLabel.trim()
        : null,
    [k("brain_dump")]: state.brainDump.trim() || null,
  };
}
