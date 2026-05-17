// server/activity/exporters/markdown.ts
// Export activity entries as Markdown digest.

import type { ActivityEntry } from "../service";

function fmtDuration(minutes: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtTime(utc: string | null): string {
  if (!utc) return "";
  return new Date(utc)
    .toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function entriesToMarkdown(entries: ActivityEntry[]): string {
  if (entries.length === 0) return "_No entries found._\n";

  // Group by entry_date.
  const byDate: Record<string, ActivityEntry[]> = {};
  for (const e of entries) {
    (byDate[e.entryDate] ??= []).push(e);
  }

  const dates = Object.keys(byDate).sort();
  const lines: string[] = [];

  let grandTotal = 0;

  for (const date of dates) {
    const dayEntries = byDate[date];
    const dayTotal = dayEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
    grandTotal += dayTotal;

    lines.push(`## ${date}  (${fmtDuration(dayTotal)})`);
    lines.push("");

    for (const e of dayEntries) {
      const timeRange =
        e.startUtc && e.endUtc
          ? `${fmtTime(e.startUtc)}–${fmtTime(e.endUtc)}`
          : e.durationMinutes
          ? fmtDuration(e.durationMinutes)
          : "";
      const status = e.status !== "Open" ? ` [${e.status}]` : "";
      const tags = (() => {
        try {
          const t: string[] = JSON.parse(e.tagsJson);
          return t.length ? ` _${t.join(", ")}_` : "";
        } catch { return ""; }
      })();
      lines.push(`- **${e.title}**${status}${timeRange ? " — " + timeRange : ""}${tags}`);
      if (e.contextSummary) lines.push(`  ${e.contextSummary}`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`**Total: ${fmtDuration(grandTotal)}** across ${entries.length} entries`);
  lines.push("");

  return lines.join("\n");
}
