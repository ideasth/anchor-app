// server/activity/exporters/csv.ts
// Export activity entries as CSV.

import type { ActivityEntry } from "../service";

function esc(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/"/g, '""');
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s}"`;
  }
  return s;
}

const HEADERS = [
  "id", "entry_date", "title", "status", "category_id", "subcategory_id",
  "start_utc", "end_utc", "duration_minutes", "tags",
  "buoy_task_id", "buoy_relationship_id", "buoy_email_status_id",
  "source_id", "source_link", "context_summary", "notes",
  "billable", "created_at",
];

export function entriesToCsv(entries: ActivityEntry[]): string {
  const rows: string[] = [HEADERS.join(",")];
  for (const e of entries) {
    const tags = (() => {
      try { return JSON.parse(e.tagsJson).join("|"); } catch { return e.tagsJson; }
    })();
    rows.push([
      e.id, e.entryDate, e.title, e.status, e.categoryId, e.subcategoryId ?? "",
      e.startUtc ?? "", e.endUtc ?? "", e.durationMinutes ?? "",
      tags,
      e.buoyTaskId ?? "", e.buoyRelationshipId ?? "", e.buoyEmailStatusId ?? "",
      e.sourceId ?? "", e.sourceLink ?? "",
      e.contextSummary ?? "", e.notes ?? "",
      e.billable, e.createdAt,
    ].map(esc).join(","));
  }
  return rows.join("\r\n");
}
