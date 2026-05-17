// server/activity/service.ts
// Core CRUD for activity_entries, timers, and taxonomy.

import type Database from "better-sqlite3";
import { getActivityDb } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  id: number;
  userId: number | null;
  entryDate: string;
  startUtc: string | null;
  endUtc: string | null;
  durationMinutes: number | null;
  title: string;
  contextSummary: string | null;
  notes: string | null;
  tagsJson: string;
  categoryId: number;
  subcategoryId: number | null;
  sourceId: number | null;
  sourceLink: string | null;
  buoyTaskId: string | null;
  buoyRelationshipId: string | null;
  buoyEmailStatusId: string | null;
  status: string;
  billable: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityCategory {
  id: number;
  userId: number | null;
  name: string;
  sortOrder: number;
  isArchived: number;
  createdAt: string;
}

export interface ActivitySubcategory {
  id: number;
  userId: number | null;
  categoryId: number;
  name: string;
  sortOrder: number;
  isArchived: number;
  createdAt: string;
}

export interface ActivitySource {
  id: number;
  userId: number | null;
  kind: string;
  externalId: string | null;
  url: string | null;
  createdAt: string;
}

export interface ActivityTimer {
  id: number;
  userId: number | null;
  entryId: number;
  startedUtc: string;
  createdAt: string;
}

export interface CreateEntryInput {
  userId?: number;
  entryDate: string;
  startUtc?: string;
  endUtc?: string;
  durationMinutes?: number;
  title: string;
  contextSummary?: string;
  notes?: string;
  tags?: string[];
  categoryId: number;
  subcategoryId?: number;
  source?: { kind: string; externalId?: string; url?: string };
  sourceLink?: string;
  buoyTaskId?: string;
  buoyRelationshipId?: string;
  buoyEmailStatusId?: string;
  status?: string;
  billable?: boolean;
}

export interface UpdateEntryInput extends Partial<Omit<CreateEntryInput, "userId">> {}

export interface ListEntriesFilter {
  from?: string;
  to?: string;
  categoryId?: number;
  subcategoryId?: number;
  status?: string;
  sourceKind?: string;
  relationshipId?: string;
  taskId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function validateTitle(title: unknown): string {
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("title is required");
  }
  if (title.length > 200) {
    throw new Error("title must be ≤200 characters");
  }
  return title.trim();
}

export function validateTags(tags: unknown): string[] {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw new Error("tags must be an array");
  if (tags.length > 20) throw new Error("tags must contain ≤20 items");
  for (const t of tags) {
    if (typeof t !== "string") throw new Error("each tag must be a string");
    if (t.length > 40) throw new Error("each tag must be ≤40 characters");
  }
  return tags as string[];
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

function resolveOrCreateSource(
  db: Database.Database,
  source: { kind: string; externalId?: string; url?: string },
  userId?: number,
): number {
  const { kind, externalId, url } = source;

  // For manual/timer sources we never dedup, just insert.
  if (!externalId) {
    const r = db
      .prepare(
        `INSERT INTO activity_sources (user_id, kind, external_id, url) VALUES (?, ?, NULL, ?)`,
      )
      .run(userId ?? null, kind, url ?? null);
    return Number(r.lastInsertRowid);
  }

  // For external sources (perplexity_thread etc.) deduplicate by (kind, external_id).
  const existing = db
    .prepare(`SELECT id FROM activity_sources WHERE kind = ? AND external_id = ?`)
    .get(kind, externalId) as { id: number } | undefined;

  if (existing) return existing.id;

  const r = db
    .prepare(
      `INSERT INTO activity_sources (user_id, kind, external_id, url) VALUES (?, ?, ?, ?)`,
    )
    .run(userId ?? null, kind, externalId, url ?? null);
  return Number(r.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createEntry(input: CreateEntryInput): ActivityEntry {
  const db = getActivityDb();
  const title = validateTitle(input.title);
  const tags = validateTags(input.tags);

  if (!input.entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) {
    throw new Error("entryDate is required (YYYY-MM-DD)");
  }
  if (!input.categoryId) throw new Error("categoryId is required");

  const status = input.status ?? "Open";
  const validStatuses = ["Open", "Active", "Complete", "Parked"];
  if (!validStatuses.includes(status)) {
    throw new Error(`status must be one of: ${validStatuses.join(", ")}`);
  }

  let sourceId: number | null = null;
  if (input.source) {
    sourceId = resolveOrCreateSource(db, input.source, input.userId);
  }

  let durationMinutes = input.durationMinutes ?? null;
  if (input.startUtc && input.endUtc && !durationMinutes) {
    const start = new Date(input.startUtc).getTime();
    const end = new Date(input.endUtc).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      durationMinutes = Math.round((end - start) / 60000);
    }
  }

  const r = db
    .prepare(
      `INSERT INTO activity_entries
        (user_id, entry_date, start_utc, end_utc, duration_minutes,
         title, context_summary, notes, tags_json,
         category_id, subcategory_id, source_id, source_link,
         buoy_task_id, buoy_relationship_id, buoy_email_status_id,
         status, billable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId ?? null,
      input.entryDate,
      input.startUtc ?? null,
      input.endUtc ?? null,
      durationMinutes,
      title,
      input.contextSummary ?? null,
      input.notes ?? null,
      JSON.stringify(tags),
      input.categoryId,
      input.subcategoryId ?? null,
      sourceId,
      input.sourceLink ?? null,
      input.buoyTaskId ?? null,
      input.buoyRelationshipId ?? null,
      input.buoyEmailStatusId ?? null,
      status,
      input.billable ? 1 : 0,
    );

  return getEntry(Number(r.lastInsertRowid))!;
}

export function getEntry(id: number): ActivityEntry | null {
  const db = getActivityDb();
  const row = db
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
       FROM activity_entries WHERE id = ?`,
    )
    .get(id) as ActivityEntry | undefined;
  return row ?? null;
}

export function updateEntry(id: number, input: UpdateEntryInput): ActivityEntry | null {
  const db = getActivityDb();
  const existing = getEntry(id);
  if (!existing) return null;

  const title = input.title !== undefined ? validateTitle(input.title) : undefined;
  const tags = input.tags !== undefined ? validateTags(input.tags) : undefined;

  const fields: string[] = [];
  const values: unknown[] = [];

  function set(col: string, val: unknown) {
    fields.push(`${col} = ?`);
    values.push(val);
  }

  if (title !== undefined) set("title", title);
  if (input.entryDate !== undefined) set("entry_date", input.entryDate);
  if (input.startUtc !== undefined) set("start_utc", input.startUtc);
  if (input.endUtc !== undefined) set("end_utc", input.endUtc);
  if (input.durationMinutes !== undefined) set("duration_minutes", input.durationMinutes);
  if (input.contextSummary !== undefined) set("context_summary", input.contextSummary);
  if (input.notes !== undefined) set("notes", input.notes);
  if (tags !== undefined) set("tags_json", JSON.stringify(tags));
  if (input.categoryId !== undefined) set("category_id", input.categoryId);
  if (input.subcategoryId !== undefined) set("subcategory_id", input.subcategoryId ?? null);
  if (input.sourceLink !== undefined) set("source_link", input.sourceLink);
  if (input.buoyTaskId !== undefined) set("buoy_task_id", input.buoyTaskId ?? null);
  if (input.buoyRelationshipId !== undefined) set("buoy_relationship_id", input.buoyRelationshipId ?? null);
  if (input.buoyEmailStatusId !== undefined) set("buoy_email_status_id", input.buoyEmailStatusId ?? null);
  if (input.status !== undefined) set("status", input.status);
  if (input.billable !== undefined) set("billable", input.billable ? 1 : 0);

  if (input.source !== undefined) {
    const sourceId = resolveOrCreateSource(db, input.source);
    set("source_id", sourceId);
  }

  if (fields.length === 0) return existing;

  set("updated_at", new Date().toISOString().replace("T", " ").slice(0, 19));
  values.push(id);

  db.prepare(`UPDATE activity_entries SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getEntry(id);
}

export function deleteEntry(id: number): boolean {
  const db = getActivityDb();
  const r = db.prepare(`DELETE FROM activity_entries WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function listEntries(filter: ListEntriesFilter = {}): ActivityEntry[] {
  const db = getActivityDb();
  const conds: string[] = [];
  const params: unknown[] = [];

  if (filter.from) { conds.push("entry_date >= ?"); params.push(filter.from); }
  if (filter.to) { conds.push("entry_date <= ?"); params.push(filter.to); }
  if (filter.categoryId) { conds.push("category_id = ?"); params.push(filter.categoryId); }
  if (filter.subcategoryId) { conds.push("subcategory_id = ?"); params.push(filter.subcategoryId); }
  if (filter.status) { conds.push("status = ?"); params.push(filter.status); }
  if (filter.relationshipId) { conds.push("buoy_relationship_id = ?"); params.push(filter.relationshipId); }
  if (filter.taskId) { conds.push("buoy_task_id = ?"); params.push(filter.taskId); }

  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(filter.limit ?? 100, 1000));
  const offset = filter.offset ?? 0;

  const rows = db
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
       ${where}
       ORDER BY entry_date DESC, COALESCE(start_utc, created_at) DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ActivityEntry[];
  return rows;
}

// ---------------------------------------------------------------------------
// Timer management
// ---------------------------------------------------------------------------

export function startTimer(
  input: { entryId?: number; createEntry?: CreateEntryInput },
): { timerId: number; entryId: number; startedUtc: string } {
  const db = getActivityDb();
  const startedUtc = new Date().toISOString();

  // Auto-stop any existing running timer.
  const running = getCurrentTimer();
  if (running) {
    stopTimer({ entryId: running.entryId });
  }

  let entryId: number;
  if (input.entryId !== undefined) {
    entryId = input.entryId;
  } else if (input.createEntry) {
    const entry = createEntry({ ...input.createEntry, startUtc: startedUtc, status: "Active" });
    entryId = entry.id;
  } else {
    throw new Error("Either entryId or createEntry is required to start a timer");
  }

  // Mark entry as Active.
  db.prepare(`UPDATE activity_entries SET status = 'Active', start_utc = COALESCE(start_utc, ?), updated_at = ? WHERE id = ?`)
    .run(startedUtc, new Date().toISOString(), entryId);

  const r = db
    .prepare(`INSERT INTO activity_timers (entry_id, started_utc) VALUES (?, ?)`)
    .run(entryId, startedUtc);

  return { timerId: Number(r.lastInsertRowid), entryId, startedUtc };
}

export function stopTimer(input: { entryId?: number } = {}): ActivityEntry | null {
  const db = getActivityDb();
  const now = new Date().toISOString();

  let timer: ActivityTimer | undefined;
  if (input.entryId !== undefined) {
    timer = db
      .prepare(`SELECT id, user_id as userId, entry_id as entryId, started_utc as startedUtc, created_at as createdAt FROM activity_timers WHERE entry_id = ?`)
      .get(input.entryId) as ActivityTimer | undefined;
  } else {
    timer = db
      .prepare(`SELECT id, user_id as userId, entry_id as entryId, started_utc as startedUtc, created_at as createdAt FROM activity_timers ORDER BY created_at DESC LIMIT 1`)
      .get() as ActivityTimer | undefined;
  }

  if (!timer) return null;

  const start = new Date(timer.startedUtc).getTime();
  const end = new Date(now).getTime();
  const durationMinutes = Math.round((end - start) / 60000);

  db.prepare(`UPDATE activity_entries SET end_utc = ?, duration_minutes = ?, status = 'Complete', updated_at = ? WHERE id = ?`)
    .run(now, durationMinutes, now, timer.entryId);

  db.prepare(`DELETE FROM activity_timers WHERE id = ?`).run(timer.id);

  return getEntry(timer.entryId);
}

export function getCurrentTimer(): ActivityTimer | null {
  const db = getActivityDb();
  const row = db
    .prepare(`SELECT id, user_id as userId, entry_id as entryId, started_utc as startedUtc, created_at as createdAt FROM activity_timers ORDER BY created_at DESC LIMIT 1`)
    .get() as ActivityTimer | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export function listCategories(): ActivityCategory[] {
  const db = getActivityDb();
  return db
    .prepare(
      `SELECT id, user_id as userId, name, sort_order as sortOrder, is_archived as isArchived, created_at as createdAt
       FROM activity_categories ORDER BY sort_order, name`,
    )
    .all() as ActivityCategory[];
}

export function listSubcategories(categoryId?: number): ActivitySubcategory[] {
  const db = getActivityDb();
  if (categoryId !== undefined) {
    return db
      .prepare(
        `SELECT id, user_id as userId, category_id as categoryId, name, sort_order as sortOrder, is_archived as isArchived, created_at as createdAt
         FROM activity_subcategories WHERE category_id = ? ORDER BY sort_order, name`,
      )
      .all(categoryId) as ActivitySubcategory[];
  }
  return db
    .prepare(
      `SELECT id, user_id as userId, category_id as categoryId, name, sort_order as sortOrder, is_archived as isArchived, created_at as createdAt
       FROM activity_subcategories ORDER BY category_id, sort_order, name`,
    )
    .all() as ActivitySubcategory[];
}

export function createCategory(name: string, userId?: number): ActivityCategory {
  const db = getActivityDb();
  const r = db
    .prepare(`INSERT INTO activity_categories (name, user_id) VALUES (?, ?)`)
    .run(name.trim(), userId ?? null);
  return db
    .prepare(`SELECT id, user_id as userId, name, sort_order as sortOrder, is_archived as isArchived, created_at as createdAt FROM activity_categories WHERE id = ?`)
    .get(Number(r.lastInsertRowid)) as ActivityCategory;
}

export function createSubcategory(categoryId: number, name: string, userId?: number): ActivitySubcategory {
  const db = getActivityDb();
  const r = db
    .prepare(`INSERT INTO activity_subcategories (category_id, name, user_id) VALUES (?, ?, ?)`)
    .run(categoryId, name.trim(), userId ?? null);
  return db
    .prepare(`SELECT id, user_id as userId, category_id as categoryId, name, sort_order as sortOrder, is_archived as isArchived, created_at as createdAt FROM activity_subcategories WHERE id = ?`)
    .get(Number(r.lastInsertRowid)) as ActivitySubcategory;
}

export function resolveOrCreateCategory(name: string, userId?: number): number {
  const db = getActivityDb();
  const existing = db
    .prepare(`SELECT id FROM activity_categories WHERE name = ?`)
    .get(name.trim()) as { id: number } | undefined;
  if (existing) return existing.id;
  const r = db
    .prepare(`INSERT INTO activity_categories (name, user_id) VALUES (?, ?)`)
    .run(name.trim(), userId ?? null);
  return Number(r.lastInsertRowid);
}

export function resolveOrCreateSubcategory(categoryId: number, name: string, userId?: number): number {
  const db = getActivityDb();
  const existing = db
    .prepare(`SELECT id FROM activity_subcategories WHERE category_id = ? AND name = ?`)
    .get(categoryId, name.trim()) as { id: number } | undefined;
  if (existing) return existing.id;
  const r = db
    .prepare(`INSERT INTO activity_subcategories (category_id, name, user_id) VALUES (?, ?, ?)`)
    .run(categoryId, name.trim(), userId ?? null);
  return Number(r.lastInsertRowid);
}
