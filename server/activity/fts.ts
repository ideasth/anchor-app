// server/activity/fts.ts
// FTS5 search over activity_entries with «…» snippet markers and bm25 ranking.

import { getActivityDb } from "./db";
import type { ActivityEntry } from "./service";

export interface FtsHit extends ActivityEntry {
  snippet: string;
  rank: number;
}

export interface FtsFilter {
  from?: string;
  to?: string;
  categoryId?: number;
  subcategoryId?: number;
  status?: string;
  sourceKind?: string;
  relationshipId?: string;
  taskId?: string;
  limit?: number;
}

/** Escape FTS5 query: wrap bare terms to avoid syntax errors. */
export function sanitizeFtsQuery(q: string): string {
  // Remove control characters, collapse whitespace.
  const clean = q.replace(/[^\w\s'-]/g, " ").trim();
  if (!clean) return '""';
  // If the user already used FTS5 operators or quotes, pass through.
  if (/["*^()]/.test(q)) return q;
  // Wrap multi-word query in a phrase search.
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0];
  // Use AND of individual terms.
  return words.join(" AND ");
}

/**
 * Build a simple snippet from text: wrap first occurrence of any query term
 * with « » markers, returning up to ~160 chars of surrounding context.
 */
function buildSnippet(text: string, terms: string[]): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  let earliest = text.length;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && idx < earliest) earliest = idx;
  }
  if (earliest === text.length) return text.slice(0, 160);
  const start = Math.max(0, earliest - 40);
  const end = Math.min(text.length, earliest + 120);
  let excerpt = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  // Wrap each matched term.
  for (const term of terms) {
    excerpt = excerpt.replace(new RegExp(term, "gi"), (m) => `«${m}»`);
  }
  return excerpt;
}

export function searchEntries(q: string, filter: FtsFilter = {}): FtsHit[] {
  const db = getActivityDb();
  if (!q || q.trim() === "") return [];

  const safeQ = sanitizeFtsQuery(q);
  const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));

  // Step 1: FTS match — just get rowids and rank.
  let ftsRows: Array<{ rowid: number; rank: number }>;
  try {
    ftsRows = db
      .prepare(`SELECT rowid, rank FROM activity_entries_fts WHERE activity_entries_fts MATCH ? ORDER BY rank LIMIT ?`)
      .all(safeQ, limit) as Array<{ rowid: number; rank: number }>;
  } catch {
    return [];
  }

  if (ftsRows.length === 0) return [];

  // Step 2: Fetch full entry rows for matching ids.
  const rowids = ftsRows.map((r) => r.rowid);
  const rankMap = new Map(ftsRows.map((r) => [r.rowid, r.rank]));

  // Optional extra filters.
  const extraConds: string[] = [`e.id IN (${rowids.map(() => "?").join(",")})`];
  const extraParams: unknown[] = [...rowids];

  if (filter.from) { extraConds.push("e.entry_date >= ?"); extraParams.push(filter.from); }
  if (filter.to) { extraConds.push("e.entry_date <= ?"); extraParams.push(filter.to); }
  if (filter.categoryId) { extraConds.push("e.category_id = ?"); extraParams.push(filter.categoryId); }
  if (filter.subcategoryId) { extraConds.push("e.subcategory_id = ?"); extraParams.push(filter.subcategoryId); }
  if (filter.status) { extraConds.push("e.status = ?"); extraParams.push(filter.status); }
  if (filter.relationshipId) { extraConds.push("e.buoy_relationship_id = ?"); extraParams.push(filter.relationshipId); }
  if (filter.taskId) { extraConds.push("e.buoy_task_id = ?"); extraParams.push(filter.taskId); }

  const where = `WHERE ${extraConds.join(" AND ")}`;

  try {
    const entries = db
      .prepare(
        `SELECT
           e.id, e.user_id as userId, e.entry_date as entryDate,
           e.start_utc as startUtc, e.end_utc as endUtc,
           e.duration_minutes as durationMinutes,
           e.title, e.context_summary as contextSummary, e.notes,
           e.tags_json as tagsJson, e.category_id as categoryId,
           e.subcategory_id as subcategoryId, e.source_id as sourceId,
           e.source_link as sourceLink,
           e.buoy_task_id as buoyTaskId,
           e.buoy_relationship_id as buoyRelationshipId,
           e.buoy_email_status_id as buoyEmailStatusId,
           e.status, e.billable, e.created_at as createdAt, e.updated_at as updatedAt
         FROM activity_entries e
         ${where}`,
      )
      .all(...extraParams) as any[];

    // Extract query terms for snippet generation.
    const terms = safeQ
      .replace(/["*^()]/g, " ")
      .split(/\s+/)
      .filter((t) => t && t !== "AND" && t !== "OR" && t !== "NOT");

    return entries.map((e) => ({
      ...e,
      rank: rankMap.get(e.id) ?? 0,
      snippet: buildSnippet((e.title ?? "") + " " + (e.contextSummary ?? "") + " " + (e.notes ?? ""), terms),
    } as FtsHit)).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  } catch {
    return [];
  }
}
