// server/activity/reports.ts
// Day/week/category/subcategory/source/relationship aggregates.

import { getActivityDb } from "./db";

export interface DayReport {
  date: string;
  totalMinutes: number;
  countByStatus: Record<string, number>;
  byCategory: Array<{ categoryId: number; categoryName: string; minutes: number; count: number }>;
  bySubcategory: Array<{ subcategoryId: number | null; subcategoryName: string; minutes: number; count: number }>;
}

export interface WeekReport {
  isoWeek: string;
  totalMinutes: number;
  countByStatus: Record<string, number>;
  byCategory: Array<{ categoryId: number; categoryName: string; minutes: number; count: number }>;
}

export interface CategoryReport {
  categoryId: number;
  categoryName: string;
  minutes: number;
  count: number;
}

export interface SubcategoryReport {
  subcategoryId: number | null;
  subcategoryName: string;
  categoryId: number;
  categoryName: string;
  minutes: number;
  count: number;
}

export interface SourceReport {
  sourceKind: string;
  minutes: number;
  count: number;
}

export interface RelationshipReport {
  buoyRelationshipId: string;
  minutes: number;
  count: number;
}

export function reportDay(date: string): DayReport {
  const db = getActivityDb();

  const totalRow = db
    .prepare(`SELECT COALESCE(SUM(duration_minutes), 0) as total FROM activity_entries WHERE entry_date = ?`)
    .get(date) as { total: number };

  const statusRows = db
    .prepare(`SELECT status, COUNT(*) as cnt FROM activity_entries WHERE entry_date = ? GROUP BY status`)
    .all(date) as Array<{ status: string; cnt: number }>;
  const countByStatus: Record<string, number> = {};
  for (const r of statusRows) countByStatus[r.status] = r.cnt;

  const byCategory = db
    .prepare(
      `SELECT e.category_id as categoryId, c.name as categoryName,
              COALESCE(SUM(e.duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries e
       JOIN activity_categories c ON c.id = e.category_id
       WHERE e.entry_date = ?
       GROUP BY e.category_id`,
    )
    .all(date) as Array<{ categoryId: number; categoryName: string; minutes: number; count: number }>;

  const bySubcategory = db
    .prepare(
      `SELECT e.subcategory_id as subcategoryId,
              COALESCE(s.name, 'Uncategorised') as subcategoryName,
              COALESCE(SUM(e.duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries e
       LEFT JOIN activity_subcategories s ON s.id = e.subcategory_id
       WHERE e.entry_date = ?
       GROUP BY e.subcategory_id`,
    )
    .all(date) as Array<{ subcategoryId: number | null; subcategoryName: string; minutes: number; count: number }>;

  return { date, totalMinutes: totalRow.total, countByStatus, byCategory, bySubcategory };
}

export function reportWeek(isoWeek: string): WeekReport {
  // isoWeek = YYYY-Www; convert to date range Mon–Sun.
  const { from, to } = isoWeekToDateRange(isoWeek);
  const db = getActivityDb();

  const totalRow = db
    .prepare(`SELECT COALESCE(SUM(duration_minutes), 0) as total FROM activity_entries WHERE entry_date BETWEEN ? AND ?`)
    .get(from, to) as { total: number };

  const statusRows = db
    .prepare(`SELECT status, COUNT(*) as cnt FROM activity_entries WHERE entry_date BETWEEN ? AND ? GROUP BY status`)
    .all(from, to) as Array<{ status: string; cnt: number }>;
  const countByStatus: Record<string, number> = {};
  for (const r of statusRows) countByStatus[r.status] = r.cnt;

  const byCategory = db
    .prepare(
      `SELECT e.category_id as categoryId, c.name as categoryName,
              COALESCE(SUM(e.duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries e
       JOIN activity_categories c ON c.id = e.category_id
       WHERE e.entry_date BETWEEN ? AND ?
       GROUP BY e.category_id`,
    )
    .all(from, to) as Array<{ categoryId: number; categoryName: string; minutes: number; count: number }>;

  return { isoWeek, totalMinutes: totalRow.total, countByStatus, byCategory };
}

export function reportByCategory(from: string, to: string): CategoryReport[] {
  const db = getActivityDb();
  return db
    .prepare(
      `SELECT e.category_id as categoryId, c.name as categoryName,
              COALESCE(SUM(e.duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries e
       JOIN activity_categories c ON c.id = e.category_id
       WHERE e.entry_date BETWEEN ? AND ?
       GROUP BY e.category_id
       ORDER BY minutes DESC`,
    )
    .all(from, to) as CategoryReport[];
}

export function reportBySubcategory(from: string, to: string, categoryId?: number): SubcategoryReport[] {
  const db = getActivityDb();
  const cond = categoryId !== undefined ? "AND e.category_id = ?" : "";
  const params: unknown[] = [from, to];
  if (categoryId !== undefined) params.push(categoryId);

  return db
    .prepare(
      `SELECT e.subcategory_id as subcategoryId,
              COALESCE(s.name, 'Uncategorised') as subcategoryName,
              e.category_id as categoryId, c.name as categoryName,
              COALESCE(SUM(e.duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries e
       JOIN activity_categories c ON c.id = e.category_id
       LEFT JOIN activity_subcategories s ON s.id = e.subcategory_id
       WHERE e.entry_date BETWEEN ? AND ?
       ${cond}
       GROUP BY e.subcategory_id
       ORDER BY minutes DESC`,
    )
    .all(...params) as SubcategoryReport[];
}

export function reportBySource(from: string, to: string): SourceReport[] {
  const db = getActivityDb();
  return db
    .prepare(
      `SELECT COALESCE(s.kind, 'manual') as sourceKind,
              COALESCE(SUM(e.duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries e
       LEFT JOIN activity_sources s ON s.id = e.source_id
       WHERE e.entry_date BETWEEN ? AND ?
       GROUP BY COALESCE(s.kind, 'manual')
       ORDER BY minutes DESC`,
    )
    .all(from, to) as SourceReport[];
}

export function reportByRelationship(from: string, to: string): RelationshipReport[] {
  const db = getActivityDb();
  return db
    .prepare(
      `SELECT buoy_relationship_id as buoyRelationshipId,
              COALESCE(SUM(duration_minutes), 0) as minutes, COUNT(*) as count
       FROM activity_entries
       WHERE entry_date BETWEEN ? AND ?
         AND buoy_relationship_id IS NOT NULL AND buoy_relationship_id != ''
       GROUP BY buoy_relationship_id
       ORDER BY minutes DESC`,
    )
    .all(from, to) as RelationshipReport[];
}

/** Weekly totals by category and subcategory — used by the Coach prompt. */
export function weeklyByCategoryAndSub(
  isoWeek: string,
): Array<{ categoryName: string; subcategoryName: string | null; minutes: number }> {
  const { from, to } = isoWeekToDateRange(isoWeek);
  const db = getActivityDb();
  return db
    .prepare(
      `SELECT c.name as categoryName,
              s.name as subcategoryName,
              COALESCE(SUM(e.duration_minutes), 0) as minutes
       FROM activity_entries e
       JOIN activity_categories c ON c.id = e.category_id
       LEFT JOIN activity_subcategories s ON s.id = e.subcategory_id
       WHERE e.entry_date BETWEEN ? AND ?
       GROUP BY e.category_id, e.subcategory_id
       ORDER BY categoryName, subcategoryName`,
    )
    .all(from, to) as Array<{ categoryName: string; subcategoryName: string | null; minutes: number }>;
}

// ---------------------------------------------------------------------------
// ISO week helpers
// ---------------------------------------------------------------------------

export function isoWeekToDateRange(isoWeek: string): { from: string; to: string } {
  // isoWeek = YYYY-Www
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`Invalid ISO week format: ${isoWeek}`);
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);

  // Jan 4 is always in week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  // Day of week: Mon=1 ... Sun=7.
  const jan4Dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() + (1 - jan4Dow) * 86400000 + (week - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  return { from: fmt(monday), to: fmt(sunday) };
}

export function currentIsoWeek(): string {
  const now = new Date();
  const dow = now.getUTCDay() || 7; // Mon=1..Sun=7
  const thursday = new Date(now.getTime() + (4 - dow) * 86400000);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() + (1 - jan4Dow) * 86400000);
  const weekNo = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}
