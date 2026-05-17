// server/activity/buoy-enrichment.ts
// Resolve buoy_task_id / buoy_relationship_id / buoy_email_status_id labels
// at read time. Non-existent refs render as a fallback label, never throw.
// This module is the only place where activity module reads from data.db.

import type { ActivityEntry } from "./service";

// Lazy-import rawSqlite from storage so we don't break the module boundary
// when running in test environments where storage.ts may not be loaded.
function getDataDb() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rawSqlite } = require("../storage");
    return rawSqlite as import("better-sqlite3").Database;
  } catch {
    return null;
  }
}

export interface EnrichedEntry extends ActivityEntry {
  taskLabel: string | null;
  relationshipLabel: string | null;
  emailStatusLabel: string | null;
}

export function enrichEntry(entry: ActivityEntry): EnrichedEntry {
  const db = getDataDb();

  let taskLabel: string | null = null;
  let relationshipLabel: string | null = null;
  let emailStatusLabel: string | null = null;

  if (db) {
    if (entry.buoyTaskId) {
      try {
        const row = db
          .prepare(`SELECT title FROM tasks WHERE id = ?`)
          .get(Number(entry.buoyTaskId)) as { title?: string } | undefined;
        taskLabel = row?.title ?? `Task #${entry.buoyTaskId}`;
      } catch {
        taskLabel = `Task #${entry.buoyTaskId}`;
      }
    }

    if (entry.buoyRelationshipId) {
      try {
        const row = db
          .prepare(`SELECT name FROM relationships WHERE id = ?`)
          .get(Number(entry.buoyRelationshipId)) as { name?: string } | undefined;
        relationshipLabel = row?.name ?? `Relationship #${entry.buoyRelationshipId}`;
      } catch {
        relationshipLabel = `Relationship #${entry.buoyRelationshipId}`;
      }
    }

    if (entry.buoyEmailStatusId) {
      try {
        const row = db
          .prepare(`SELECT subject FROM email_status WHERE id = ?`)
          .get(Number(entry.buoyEmailStatusId)) as { subject?: string } | undefined;
        emailStatusLabel = row?.subject ?? `Email #${entry.buoyEmailStatusId}`;
      } catch {
        emailStatusLabel = `Email #${entry.buoyEmailStatusId}`;
      }
    }
  } else {
    // No data.db connection — provide fallback labels.
    if (entry.buoyTaskId) taskLabel = `Task #${entry.buoyTaskId}`;
    if (entry.buoyRelationshipId) relationshipLabel = `Relationship #${entry.buoyRelationshipId}`;
    if (entry.buoyEmailStatusId) emailStatusLabel = `Email #${entry.buoyEmailStatusId}`;
  }

  return { ...entry, taskLabel, relationshipLabel, emailStatusLabel };
}

export function enrichEntries(entries: ActivityEntry[]): EnrichedEntry[] {
  return entries.map(enrichEntry);
}
