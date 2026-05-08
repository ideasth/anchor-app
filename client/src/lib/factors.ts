// Shared constants for the Mood & Factors check-in and Issues log.
// Icons are user-facing (per spec); keep code comments emoji-free.

export type Mood = "positive" | "neutral" | "strained";
export type Energy = "low" | "moderate" | "high";
export type CognitiveLoad = "high" | "moderate" | "low";
export type SleepQuality = "restorative" | "adequate" | "poor";
export type Focus = "focused" | "scattered";
export type ValuesAlignment = "aligned" | "neutral" | "misaligned";

export type FactorKey =
  | "mood"
  | "energy"
  | "cognitiveLoad"
  | "sleepQuality"
  | "focus"
  | "valuesAlignment";

export interface FactorOption {
  value: string;
  icon: string;
  label: string;
}

export interface FactorMeasure {
  key: FactorKey;
  title: string;
  helper: string;
  options: FactorOption[];
}

// Order matches the design spec: Mood, Energy, Cognitive Load, Sleep, Focus, Values.
export const FACTOR_MEASURES: FactorMeasure[] = [
  {
    key: "mood",
    title: "Mood",
    helper: "Overall emotional state right now",
    options: [
      { value: "positive", icon: "🙂", label: "Positive / OK" },
      { value: "neutral", icon: "😐", label: "Neutral / Flat" },
      { value: "strained", icon: "😤", label: "Strained / Distressed" },
    ],
  },
  {
    key: "energy",
    title: "Energy",
    helper: "Physical and mental energy available",
    options: [
      { value: "low", icon: "⚡", label: "Low" },
      { value: "moderate", icon: "⚡⚡", label: "Moderate" },
      { value: "high", icon: "⚡⚡⚡", label: "High" },
    ],
  },
  {
    key: "cognitiveLoad",
    title: "Cognitive load",
    helper: "Mental load, pressure, or overwhelm",
    options: [
      { value: "high", icon: "🔴", label: "High (overloaded)" },
      { value: "moderate", icon: "🟡", label: "Moderate" },
      { value: "low", icon: "🟢", label: "Low / clear" },
    ],
  },
  {
    key: "sleepQuality",
    title: "Sleep quality",
    helper: "Subjective sense of restfulness from last night",
    options: [
      { value: "restorative", icon: "🙂", label: "Restorative" },
      { value: "adequate", icon: "😐", label: "Adequate" },
      { value: "poor", icon: "😵\u200d💫", label: "Poor / disrupted" },
    ],
  },
  {
    key: "focus",
    title: "Focus",
    helper: "Ability to concentrate and stay engaged",
    options: [
      { value: "focused", icon: "🎯", label: "Focused" },
      { value: "scattered", icon: "😵\u200d💫", label: "Scattered" },
    ],
  },
  {
    key: "valuesAlignment",
    title: "Values alignment",
    helper: "Acting in line with your values today",
    options: [
      { value: "aligned", icon: "✅", label: "Aligned" },
      { value: "neutral", icon: "⚪", label: "Neutral" },
      { value: "misaligned", icon: "❌", label: "Misaligned" },
    ],
  },
];

export function getFactorOption(
  key: FactorKey,
  value: string | null | undefined,
): FactorOption | undefined {
  if (!value) return undefined;
  const m = FACTOR_MEASURES.find((x) => x.key === key);
  return m?.options.find((o) => o.value === value);
}

// ----- Issues -----

export type IssueCategory = "relationship" | "house" | "kids" | "work" | "other";
export type IssueStatus = "open" | "ongoing" | "resolved";
export type SupportType = "listen" | "problem_solve" | "practical";

export const ISSUE_CATEGORIES: { value: IssueCategory; icon: string; label: string }[] = [
  { value: "relationship", icon: "❤️", label: "Relationship" },
  { value: "house", icon: "🏠", label: "House" },
  { value: "kids", icon: "👧", label: "Kids" },
  { value: "work", icon: "✚", label: "Work" },
  { value: "other", icon: "✳︎", label: "Other" },
];

export const SUPPORT_TYPES: { value: SupportType; icon: string; label: string }[] = [
  { value: "listen", icon: "💬", label: "Listen" },
  { value: "problem_solve", icon: "🧩", label: "Problem-solve" },
  { value: "practical", icon: "🤝", label: "Practical help" },
];

export const ISSUE_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "ongoing", label: "Ongoing" },
  { value: "resolved", label: "Resolved" },
];

export function categoryMeta(value: string) {
  return (
    ISSUE_CATEGORIES.find((c) => c.value === value) ?? {
      value: "other" as const,
      icon: "✳︎",
      label: "Other",
    }
  );
}

export function supportTypeMeta(value: string | null | undefined) {
  if (!value) return undefined;
  return SUPPORT_TYPES.find((s) => s.value === value);
}
