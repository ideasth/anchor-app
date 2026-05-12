// Stage 13a (2026-05-12) — Calm weekly-review aggregates.
//
// Pure functions over a list of CoachSession rows. No DB access here so
// the test suite can exercise the aggregator with synthetic fixtures
// without booting the live storage handle. Called by /api/weekly-review.

import type { CoachSession } from "@shared/schema";

// Dimensions tracked by chip-frequency + per-session delta. The label
// is what the client renders; the pre/post keys are the columns on
// coach_sessions that store the chosen chip values.
export interface CalmChipDimension {
  key:
    | "arousal"
    | "energy"
    | "sleep"
    | "mood"
    | "cognitiveLoad"
    | "focus"
    | "alignmentPeople"
    | "alignmentValues";
  label: string;
  preCol: keyof CoachSession;
  postCol: keyof CoachSession;
}

export const CALM_CHIP_DIMENSIONS: CalmChipDimension[] = [
  { key: "arousal", label: "Arousal", preCol: "calmPreArousal", postCol: "calmPostArousal" },
  { key: "energy", label: "Energy", preCol: "calmPreEnergy", postCol: "calmPostEnergy" },
  { key: "sleep", label: "Sleep", preCol: "calmPreSleep", postCol: "calmPostSleep" },
  { key: "mood", label: "Mood", preCol: "calmPreMood", postCol: "calmPostMood" },
  {
    key: "cognitiveLoad",
    label: "Cognitive load",
    preCol: "calmPreCognitiveLoad",
    postCol: "calmPostCognitiveLoad",
  },
  { key: "focus", label: "Focus", preCol: "calmPreFocus", postCol: "calmPostFocus" },
  {
    key: "alignmentPeople",
    label: "Alignment — people",
    preCol: "calmPreAlignmentPeople",
    postCol: "calmPostAlignmentPeople",
  },
  {
    key: "alignmentValues",
    label: "Alignment — values",
    preCol: "calmPreAlignmentValues",
    postCol: "calmPostAlignmentValues",
  },
];

export interface CalmChipFrequency {
  key: string;
  label: string;
  counts: Array<{ value: string; count: number }>;
}

export interface CalmSessionDelta {
  sessionId: number;
  completedAt: number | null;
  startedAt: number;
  // Empty when nothing changed across the chip dimensions or mind cats.
  dimensionChanges: Array<{ label: string; from: string; to: string }>;
  mindAdded: string[];
  mindDropped: string[];
}

export interface CalmReviewAggregates {
  totalCount: number;
  chipFrequencies: CalmChipFrequency[];
  topMindCategories: Array<{ category: string; count: number }>;
  perSessionDeltas: CalmSessionDelta[];
}

function safeParseStringArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readChip(session: CoachSession, col: keyof CoachSession): string | null {
  const v = session[col];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Compute weekly review chip aggregates for a window of completed Calm
 * sessions. Only sessions with completedAt != null are considered.
 */
export function computeCalmReviewAggregates(
  sessions: CoachSession[],
): CalmReviewAggregates {
  const completed = sessions.filter((s) => s.completedAt != null);

  // Chip frequencies — pre-capture values per dimension.
  const chipFrequencies: CalmChipFrequency[] = CALM_CHIP_DIMENSIONS.map((d) => {
    const counts = new Map<string, number>();
    for (const s of completed) {
      const v = readChip(s, d.preCol);
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return {
      key: d.key,
      label: d.label,
      counts: Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

  // Top mind categories — across pre-capture selections this week.
  const mindCounts = new Map<string, number>();
  for (const s of completed) {
    const cats = safeParseStringArray(s.calmPreMindCategories);
    for (const c of cats) {
      mindCounts.set(c, (mindCounts.get(c) ?? 0) + 1);
    }
  }
  const topMindCategories = Array.from(mindCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Per-session deltas — only emit changed dimensions. If both pre and
  // post on a dimension are filled and differ, record the move. Mind
  // categories are diffed as added/dropped sets.
  const perSessionDeltas: CalmSessionDelta[] = completed.map((s) => {
    const dimensionChanges: Array<{ label: string; from: string; to: string }> = [];
    for (const d of CALM_CHIP_DIMENSIONS) {
      const a = readChip(s, d.preCol);
      const b = readChip(s, d.postCol);
      if (a && b && a !== b) dimensionChanges.push({ label: d.label, from: a, to: b });
    }
    const preCatsArr = safeParseStringArray(s.calmPreMindCategories);
    const postCatsArr = safeParseStringArray(s.calmPostMindCategories);
    const preCats = new Set(preCatsArr);
    const postCats = new Set(postCatsArr);
    const mindAdded: string[] = postCatsArr.filter((c) => !preCats.has(c));
    const mindDropped: string[] = preCatsArr.filter((c) => !postCats.has(c));
    return {
      sessionId: s.id,
      completedAt: s.completedAt ?? null,
      startedAt: s.startedAt,
      dimensionChanges,
      mindAdded,
      mindDropped,
    };
  });

  return {
    totalCount: completed.length,
    chipFrequencies,
    topMindCategories,
    perSessionDeltas,
  };
}
