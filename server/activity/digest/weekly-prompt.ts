// server/activity/digest/weekly-prompt.ts
// Render the prompt body the future cron will POST to the sibling LLM proxy.
// This module does NOT call the proxy or create any cron. It is purely a
// prompt template renderer so the cron code (when added) has a clean
// separation between data and presentation.

import type { WeeklyDigestPayload } from "./weekly";

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

/**
 * Build the prompt messages array to send to the LLM proxy.
 * Returns { model, messages } — the exact shape that POST /api/llm/chat expects.
 */
export function buildWeeklyDigestPrompt(payload: WeeklyDigestPayload): {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
} {
  const systemPrompt = `You are a concise personal assistant writing a weekly activity summary for a busy medical professional and software developer. Write one paragraph (3–5 sentences) summarising the week's activities. Use AU English. Be factual and specific — mention categories, totals, and any notable patterns. Do not include filler phrases or emojis.`;

  const categoryLines = payload.byCategory
    .map((c) => `- ${c.categoryName}: ${fmtMinutes(c.minutes)} (${c.count} entries)`)
    .join("\n");

  const subLines = payload.byCategoryAndSub
    .map((r) => `  - ${r.categoryName}${r.subcategoryName ? " / " + r.subcategoryName : ""}: ${fmtMinutes(r.minutes)}`)
    .join("\n");

  const topLines = payload.topEntries
    .slice(0, 5)
    .map((e) => `- ${e.title} (${fmtMinutes(e.durationMinutes ?? 0)})`)
    .join("\n");

  const userPrompt = `Week: ${payload.isoWeek} (${payload.from} to ${payload.to})
Total time tracked: ${fmtMinutes(payload.totalMinutes)}
Entries: ${Object.values(payload.countByStatus).reduce((a, b) => a + b, 0)} (${Object.entries(payload.countByStatus).map(([k, v]) => `${k}: ${v}`).join(", ")})

By category:
${categoryLines}

By category/subcategory:
${subLines}

Top activities:
${topLines}

Write a one-paragraph narrative summary of this week's activity log.`;

  return {
    model: "sonar-pro",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
}
