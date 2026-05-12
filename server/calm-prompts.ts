// Stage 13 (2026-05-11) — Calm coach prompts + fallback strings.
//
// Kept in a standalone module (not coach-context.ts) so unit tests can
// import them without pulling in storage.ts (which opens the live
// data.db on import).

export const CALM_REFRAME_SYSTEM_PROMPT = `The user has just shared their state via a brief check-in. Use these signals to inform the reframe but do not list them back at them.

You write one short reframe for a person who has just paused, slowed their breathing, and named what is around them. Your goal is regulation, not problem solving.

Voice: calm, grounded, second-person ("you"). Australian English. No emoji. Plain prose. One short paragraph, sixty words or fewer.

Rules:
- Acknowledge the feeling they named.
- Normalise it without minimising it.
- Suggest sitting with the thought rather than fixing it.
- Do not offer steps, plans, actions, or advice.
- Do not use bullet points or numbered lists.
- Do not ask a question.
- Do not reference the breathing or grounding directly more than once.
- Do not list the check-in chips back at them. Let the signals colour your tone, not your content.`;

export const CALM_ACKNOWLEDGE_SYSTEM_PROMPT = `You write one short acknowledgement after the user has named something they are noticing. Your only job is pacing — letting their words land before the next prompt.

Voice: calm, warm, brief. Australian English. No emoji.

Rules:
- A single sentence, fifteen words or fewer.
- Never advice. Never planning. Never a question.
- Reflect that you heard them, nothing more.
- Examples of the right register: "Thank you for naming that.", "That is a real observation.", "That sounds heavy to be carrying."`;

/**
 * Stage 13a (2026-05-12): the reframe sees the full pre-capture chip set
 * plus the optional brain-dump and (if linked) the issue's title/notes.
 * Every chip is optional — missing values are simply omitted so the
 * prompt stays compact.
 *
 * Back-compat with Stage 13 callers: `preTags` + `preIntensity` still
 * accepted via the legacy path.
 */
export interface CalmReframeInput {
  issueLabel: string;
  issueNotes?: string | null;
  groundingObservations: { see: string; hear: string; feel: string };
  // Stage 13a chip state.
  preArousal?: string | null;
  preEnergy?: string | null;
  preSleep?: string | null;
  preMood?: string | null;
  preCognitiveLoad?: string | null;
  preFocus?: string | null;
  preAlignmentPeople?: string | null;
  preAlignmentValues?: string | null;
  preMindCategories?: string[] | null;
  preMindOtherLabel?: string | null;
  preBrainDump?: string | null;
  // Legacy Stage 13 fields (kept so older sessions still produce a
  // sensible reframe). Either may be omitted on new sessions.
  preTags?: string[] | null;
  preIntensity?: number | null;
}

export function buildCalmReframeMessages(
  input: CalmReframeInput,
): Array<{ role: "system" | "user"; content: string }> {
  const lines: string[] = [];
  lines.push(`Issue: ${input.issueLabel || "(none)"}`);
  if (input.issueNotes && input.issueNotes.trim()) {
    lines.push(`Issue notes: ${input.issueNotes.trim()}`);
  }
  // Chip check-in — only emit lines for chips the user actually picked,
  // so the prompt does not get cluttered with "(blank)" rows.
  const chipPairs: Array<[string, string | null | undefined]> = [
    ["Arousal", input.preArousal],
    ["Energy", input.preEnergy],
    ["Sleep", input.preSleep],
    ["Mood", input.preMood],
    ["Cognitive load", input.preCognitiveLoad],
    ["Focus", input.preFocus],
    ["Alignment with people", input.preAlignmentPeople],
    ["Alignment with values", input.preAlignmentValues],
  ];
  const chipLines = chipPairs
    .filter(([, v]) => typeof v === "string" && v.trim().length > 0)
    .map(([label, v]) => `- ${label}: ${v}`);
  if (chipLines.length > 0) {
    lines.push("Check-in chips:");
    lines.push(...chipLines);
  }
  if (input.preMindCategories && input.preMindCategories.length > 0) {
    const cats = input.preMindCategories.map((c) =>
      c === "Other" && input.preMindOtherLabel
        ? `Other (${input.preMindOtherLabel})`
        : c,
    );
    lines.push(`On their mind: ${cats.join(", ")}`);
  }
  if (input.preBrainDump && input.preBrainDump.trim()) {
    lines.push(`Brain dump: ${input.preBrainDump.trim()}`);
  }
  // Legacy Stage 13 fields — only if the new chips weren't supplied.
  const hasNewChips =
    chipLines.length > 0 ||
    (input.preMindCategories && input.preMindCategories.length > 0) ||
    (input.preBrainDump && input.preBrainDump.trim());
  if (!hasNewChips) {
    if (input.preTags && input.preTags.length > 0) {
      lines.push(`Feeling tags: ${input.preTags.join(", ")}`);
    }
    if (typeof input.preIntensity === "number") {
      lines.push(`Intensity (0-10): ${input.preIntensity}`);
    }
  }
  lines.push(`Grounding — see: ${input.groundingObservations.see || "(blank)"}`);
  lines.push(`Grounding — hear: ${input.groundingObservations.hear || "(blank)"}`);
  lines.push(`Grounding — feel: ${input.groundingObservations.feel || "(blank)"}`);
  return [
    { role: "system", content: CALM_REFRAME_SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

export function buildCalmAcknowledgeMessages(input: {
  questionLabel: string;
  userAnswer: string;
}): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: CALM_ACKNOWLEDGE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Question: ${input.questionLabel}\nUser answer: ${input.userAnswer}`,
    },
  ];
}

export const CALM_REFRAME_FALLBACK = "You've slowed your breathing and named what's around you. That's enough for this moment. The thought you're holding doesn't need an answer right now — it needs space.";
export const CALM_ACKNOWLEDGE_FALLBACK = "Noted.";

export const CALM_REFLECTION_PROMPTS = {
  worst: "What's the worst-case story you're telling yourself right now?",
  accurate: "What's a more accurate story?",
  next: "What's one small next action that's within your control?",
} as const;

/**
 * Strip sonar-reasoning-pro's <think>...</think> reasoning preamble.
 * Mirrors the helper in coach-routes.ts so the calm endpoints can clean
 * model output without importing the route module.
 */
export function stripThinkTags(text: string): string {
  if (!text) return text;
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
}
