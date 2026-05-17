// server/activity/digest/weekly.ts
// SQL aggregates that return a JSON payload for a given week.
// Used by the future weekly digest cron and the /api/activity/digests/weekly endpoint.

import { getActivityDb } from "../db";
import {
  reportWeek,
  reportByCategory,
  reportBySubcategory,
  reportBySource,
  reportByRelationship,
  weeklyByCategoryAndSub,
  isoWeekToDateRange,
  currentIsoWeek,
} from "../reports";
import type { ActivityEntry } from "../service";

export interface WeeklyDigestPayload {
  isoWeek: string;
  from: string;
  to: string;
  totalMinutes: number;
  countByStatus: Record<string, number>;
  byCategory: Array<{ categoryId: number; categoryName: string; minutes: number; count: number }>;
  bySubcategory: Array<{ subcategoryId: number | null; subcategoryName: string; categoryName: string; minutes: number; count: number }>;
  bySource: Array<{ sourceKind: string; minutes: number; count: number }>;
  byRelationship: Array<{ buoyRelationshipId: string; minutes: number; count: number }>;
  byCategoryAndSub: Array<{ categoryName: string; subcategoryName: string | null; minutes: number }>;
  topEntries: Array<ActivityEntry>;
  generatedAt: string;
}

export function buildWeeklyDigest(isoWeek?: string): WeeklyDigestPayload {
  const week = isoWeek ?? currentIsoWeek();
  const { from, to } = isoWeekToDateRange(week);
  const db = getActivityDb();

  const weekReport = reportWeek(week);
  const byCategory = reportByCategory(from, to);
  const bySubcategory = reportBySubcategory(from, to);
  const bySource = reportBySource(from, to);
  const byRelationship = reportByRelationship(from, to);
  const byCategoryAndSub = weeklyByCategoryAndSub(week);

  const topEntries = db
    .prepare(
      `SELECT id, user_id as userId, entry_date as entryDate,
              start_utc as startUtc, end_utc as endUtc,
              duration_minutes as durationMinutes,
              title, context_summary as contextSummary, notes,
              tags_json as tagsJson, category_id as categoryId,
              subcategory_id as subcategoryId, source_id as sourceId,
              source_link as sourceLink,
              buoy_task_id as buoyTaskId,
              buoy_relationship_id as buoyRelationshipId,
              buoy_email_status_id as buoyEmailStatusId,
              status, billable, created_at as createdAt, updated_at as updatedAt
       FROM activity_entries
       WHERE entry_date BETWEEN ? AND ?
         AND duration_minutes IS NOT NULL
       ORDER BY duration_minutes DESC
       LIMIT 10`,
    )
    .all(from, to) as ActivityEntry[];

  return {
    isoWeek: week,
    from,
    to,
    totalMinutes: weekReport.totalMinutes,
    countByStatus: weekReport.countByStatus,
    byCategory,
    bySubcategory,
    bySource,
    byRelationship,
    byCategoryAndSub,
    topEntries,
    generatedAt: new Date().toISOString(),
  };
}

export function writeDigest(
  payload: WeeklyDigestPayload,
  narrative: string,
  source: "cron" | "manual" = "manual",
): { id: number } {
  const db = getActivityDb();
  const markdown = buildDigestMarkdown(payload, narrative);
  const r = db
    .prepare(
      `INSERT INTO activity_digests (iso_week, narrative, aggregates_json, markdown, source)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      payload.isoWeek,
      narrative,
      JSON.stringify(payload),
      markdown,
      source,
    );
  return { id: Number(r.lastInsertRowid) };
}

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

export function buildDigestMarkdown(payload: WeeklyDigestPayload, narrative: string): string {
  const lines: string[] = [];
  lines.push(`# Weekly Activity Digest — ${payload.isoWeek}`);
  lines.push(`_${payload.from} to ${payload.to}_`);
  lines.push("");
  lines.push(narrative);
  lines.push("");
  lines.push(`**Total:** ${fmtMinutes(payload.totalMinutes)}`);
  lines.push("");

  if (payload.byCategory.length > 0) {
    lines.push("## By Category");
    for (const c of payload.byCategory) {
      lines.push(`- **${c.categoryName}**: ${fmtMinutes(c.minutes)} (${c.count} entries)`);
    }
    lines.push("");
  }

  if (payload.byCategoryAndSub.length > 0) {
    lines.push("## By Category / Subcategory");
    for (const r of payload.byCategoryAndSub) {
      const sub = r.subcategoryName ? ` / ${r.subcategoryName}` : "";
      lines.push(`- **${r.categoryName}${sub}**: ${fmtMinutes(r.minutes)}`);
    }
    lines.push("");
  }

  if (payload.topEntries.length > 0) {
    lines.push("## Top 10 Entries by Duration");
    for (const e of payload.topEntries) {
      lines.push(`- ${e.title} — ${fmtMinutes(e.durationMinutes ?? 0)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function getDigest(id: number): {
  id: number; isoWeek: string; generatedAt: string; narrative: string;
  aggregatesJson: string; markdown: string; source: string;
} | null {
  const db = getActivityDb();
  const row = db
    .prepare(`SELECT id, iso_week as isoWeek, generated_at as generatedAt, narrative, aggregates_json as aggregatesJson, markdown, source FROM activity_digests WHERE id = ?`)
    .get(id) as any;
  return row ?? null;
}

export function listDigests(isoWeek?: string): any[] {
  const db = getActivityDb();
  if (isoWeek) {
    return db
      .prepare(`SELECT id, iso_week as isoWeek, generated_at as generatedAt, narrative, aggregates_json as aggregatesJson, markdown, source FROM activity_digests WHERE iso_week = ? ORDER BY generated_at DESC`)
      .all(isoWeek) as any[];
  }
  return db
    .prepare(`SELECT id, iso_week as isoWeek, generated_at as generatedAt, narrative, aggregates_json as aggregatesJson, markdown, source FROM activity_digests ORDER BY generated_at DESC LIMIT 52`)
    .all() as any[];
}
