// server/activity/parser.ts
// Parses [ACTIVITY LOG] blocks from raw text.
// Idempotent on (source.kind, source.external_id).
// Returns per-line errors for malformed input.

import { createEntry, updateEntry, resolveOrCreateCategory, resolveOrCreateSubcategory } from "./service";
import { getActivityDb } from "./db";
import type { CreateEntryInput } from "./service";

export interface ParsedBlock {
  raw: string;
  fields: Record<string, string>;
  errors: Array<{ line: number; field: string; message: string }>;
}

export interface ImportOutcome {
  blockIndex: number;
  status: "created" | "updated" | "skipped" | "error";
  entryId?: number;
  errors: Array<{ line: number; field: string; message: string }>;
  warnings: string[];
}

export interface ImportOptions {
  dryRun?: boolean;
  autocreate?: boolean;
}

// ---------------------------------------------------------------------------
// Parse one block's raw text into a field map
// ---------------------------------------------------------------------------

export function parseBlock(text: string): ParsedBlock {
  const lines = text.split("\n");
  const fields: Record<string, string> = {};
  const errors: Array<{ line: number; field: string; message: string }> = [];

  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inNotes = false;

  const flushCurrent = () => {
    if (currentKey !== null) {
      fields[currentKey] = currentValue.join("\n").trim();
      currentKey = null;
      currentValue = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Skip fence markers.
    if (line.trim().toUpperCase() === "[ACTIVITY LOG]") continue;
    if (line.trim() === "") {
      if (inNotes) { currentValue.push(""); }
      continue;
    }

    // Check for a key: value line.
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch) {
      flushCurrent();
      currentKey = kvMatch[1].toLowerCase().replace(/_/g, "");
      // notes: key starts multi-line accumulation
      if (currentKey === "notes") {
        inNotes = true;
        currentValue = [kvMatch[2]];
      } else {
        inNotes = false;
        currentValue = [kvMatch[2]];
      }
    } else {
      // Continuation line (folded/literal for notes/contextsummary).
      if (currentKey !== null) {
        currentValue.push(line.trim());
      } else {
        errors.push({ line: lineNo, field: "", message: `Unexpected line: ${line.slice(0, 80)}` });
      }
    }
  }
  flushCurrent();

  return { raw: text, fields, errors };
}

// ---------------------------------------------------------------------------
// Split raw import body into individual blocks
// ---------------------------------------------------------------------------

export function splitBlocks(body: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let insideBlock = false;

  for (const line of body.split("\n")) {
    if (line.trim().toUpperCase() === "[ACTIVITY LOG]") {
      if (insideBlock) {
        // Closing fence — save current block.
        current.push(line);
        blocks.push(current.join("\n"));
        current = [];
        insideBlock = false;
      } else {
        // Opening fence.
        current = [line];
        insideBlock = true;
      }
    } else if (insideBlock) {
      current.push(line);
    }
  }

  // Handle unclosed block (missing closing fence).
  if (insideBlock && current.length > 1) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Parse a Melbourne-local or UTC timestamp to UTC ISO-8601
// ---------------------------------------------------------------------------

function parseDatetime(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;

  const s = raw.trim();

  // ISO-8601 with offset — convert to UTC.
  if (/T\d{2}:\d{2}/.test(s) || /T\d{4}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD HH:MM interpreted as Australia/Melbourne.
  const localMatch = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (localMatch) {
    // Use Intl to compute the UTC offset for that date in Melbourne.
    const [, datePart, timePart] = localMatch;
    // Construct a candidate date to find the offset.
    const candidate = new Date(`${datePart}T${timePart}:00+10:00`);
    // Melbourne is UTC+10 (AEST) or UTC+11 (AEDT after 2026-10-05).
    // We use the offset encoded in the candidate Intl.DateTimeFormat result.
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    }).formatToParts(candidate);
    // If Intl round-trips correctly, candidate is good enough.
    // We try the standard approach: assume +10 then check if date matches after Intl.
    // For simplicity and correctness, we construct using Temporal-safe approach:
    const guessUtcMs = new Date(`${datePart}T${timePart}:00+10:00`).getTime();
    const testDate = new Date(guessUtcMs);
    const melbParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(testDate);
    const melbDate = `${melbParts.find(p=>p.type==="year")?.value}-${melbParts.find(p=>p.type==="month")?.value}-${melbParts.find(p=>p.type==="day")?.value}`;
    const melbTime = `${melbParts.find(p=>p.type==="hour")?.value}:${melbParts.find(p=>p.type==="minute")?.value}`;
    if (melbDate === datePart && melbTime === timePart) {
      return testDate.toISOString();
    }
    // Try +11 (AEDT).
    const guessUtcMs2 = new Date(`${datePart}T${timePart}:00+11:00`).getTime();
    const testDate2 = new Date(guessUtcMs2);
    const melbParts2 = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(testDate2);
    const melbDate2 = `${melbParts2.find(p=>p.type==="year")?.value}-${melbParts2.find(p=>p.type==="month")?.value}-${melbParts2.find(p=>p.type==="day")?.value}`;
    const melbTime2 = `${melbParts2.find(p=>p.type==="hour")?.value}:${melbParts2.find(p=>p.type==="minute")?.value}`;
    if (melbDate2 === datePart && melbTime2 === timePart) {
      return testDate2.toISOString();
    }
    // Fallback: use +10.
    return new Date(`${datePart}T${timePart}:00+10:00`).toISOString();
  }

  return null;
}

// ---------------------------------------------------------------------------
// Convert a parsed block into a CreateEntryInput (or collect errors)
// ---------------------------------------------------------------------------

export function blockToEntry(
  parsed: ParsedBlock,
  opts: ImportOptions,
): { input?: CreateEntryInput; errors: Array<{ line: number; field: string; message: string }> } {
  const errors = [...parsed.errors];
  const f = parsed.fields;

  // Required fields.
  if (!f.date) errors.push({ line: 0, field: "date", message: "date is required" });
  if (!f.title) errors.push({ line: 0, field: "title", message: "title is required" });
  if (!f.category) errors.push({ line: 0, field: "category", message: "category is required" });
  if (!f.status) errors.push({ line: 0, field: "status", message: "status is required" });

  if (errors.length > 0) return { errors };

  const db = getActivityDb();

  // Resolve category.
  let categoryId: number;
  const catRow = db
    .prepare(`SELECT id FROM activity_categories WHERE LOWER(name) = LOWER(?)`)
    .get(f.category) as { id: number } | undefined;
  if (!catRow) {
    if (opts.autocreate) {
      categoryId = resolveOrCreateCategory(f.category);
    } else {
      errors.push({ line: 0, field: "category", message: `Unknown category: ${f.category}` });
      return { errors };
    }
  } else {
    categoryId = catRow.id;
  }

  // Resolve subcategory.
  let subcategoryId: number | undefined;
  if (f.subcategory && f.subcategory.trim()) {
    const subRow = db
      .prepare(`SELECT id FROM activity_subcategories WHERE LOWER(name) = LOWER(?)`)
      .get(f.subcategory) as { id: number } | undefined;
    if (!subRow) {
      if (opts.autocreate) {
        subcategoryId = resolveOrCreateSubcategory(categoryId, f.subcategory);
      } else {
        errors.push({ line: 0, field: "subcategory", message: `Unknown subcategory: ${f.subcategory}` });
        return { errors };
      }
    } else {
      subcategoryId = subRow.id;
    }
  }

  // Parse times.
  const startUtc = f.start ? parseDatetime(f.start) ?? undefined : undefined;
  const endUtc = f.end ? parseDatetime(f.end) ?? undefined : undefined;

  // Parse duration_minutes.
  let durationMinutes: number | undefined;
  const rawDur = f.durationminutes ?? f.duration;
  if (rawDur) {
    const n = parseInt(rawDur, 10);
    if (!isNaN(n) && n >= 0) durationMinutes = n;
  }

  // Parse tags: JSON array or comma-separated.
  let tags: string[] = [];
  if (f.tags) {
    try {
      const parsed = JSON.parse(f.tags);
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      tags = f.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  // Source.
  let source: CreateEntryInput["source"];
  const sessionId = f.sessionid ?? f.session_id;
  const sessionKind = (f.sessionkind ?? f.session_kind ?? "").toLowerCase();
  const sessionUrl = f.sessionurl ?? f.session_url;

  if (sessionId) {
    const kind = sessionKind.includes("task") ? "perplexity_task" : "perplexity_thread";
    source = { kind, externalId: sessionId, url: sessionUrl || undefined };
  }

  const input: CreateEntryInput = {
    entryDate: f.date,
    title: f.title,
    categoryId,
    subcategoryId,
    status: f.status,
    startUtc,
    endUtc,
    durationMinutes,
    tags,
    contextSummary: f.contextsummary ?? f.context_summary ?? undefined,
    notes: f.notes ?? undefined,
    source,
    sourceLink: sessionUrl ?? undefined,
    buoyTaskId: f.buoytaskid && f.buoytaskid.trim() ? f.buoytaskid.trim() : undefined,
    buoyRelationshipId: f.buoyrelationshipid && f.buoyrelationshipid.trim() ? f.buoyrelationshipid.trim() : undefined,
    buoyEmailStatusId: f.buoyemailstatusid && f.buoyemailstatusid.trim() ? f.buoyemailstatusid.trim() : undefined,
    billable: f.billable?.toLowerCase() === "true",
  };

  return { input, errors: [] };
}

// ---------------------------------------------------------------------------
// Main entry point: import one or many blocks
// ---------------------------------------------------------------------------

export function importActivityLogBlocks(
  body: string,
  opts: ImportOptions = {},
): ImportOutcome[] {
  const rawBlocks = splitBlocks(body);
  if (rawBlocks.length === 0) {
    return [{
      blockIndex: 0,
      status: "error",
      errors: [{ line: 0, field: "", message: "No [ACTIVITY LOG] blocks found in input" }],
      warnings: [],
    }];
  }

  return rawBlocks.map((rawBlock, idx) => {
    const parsed = parseBlock(rawBlock);
    const { input, errors } = blockToEntry(parsed, opts);

    if (errors.length > 0) {
      return { blockIndex: idx, status: "error" as const, errors, warnings: [] };
    }

    if (!input) {
      return { blockIndex: idx, status: "error" as const, errors: [{ line: 0, field: "", message: "Failed to parse block" }], warnings: [] };
    }

    if (opts.dryRun) {
      return { blockIndex: idx, status: "skipped" as const, errors: [], warnings: ["dry-run: no write performed"] };
    }

    const db = getActivityDb();

    // Idempotency check: if source has externalId, look for existing entry.
    if (input.source?.externalId) {
      const existing = db
        .prepare(
          `SELECT ae.id FROM activity_entries ae
           JOIN activity_sources s ON s.id = ae.source_id
           WHERE s.kind = ? AND s.external_id = ?
           LIMIT 1`,
        )
        .get(input.source.kind, input.source.externalId) as { id: number } | undefined;

      if (existing) {
        // Update in place.
        try {
          updateEntry(existing.id, input as any);
          return { blockIndex: idx, status: "updated" as const, entryId: existing.id, errors: [], warnings: [] };
        } catch (err) {
          return { blockIndex: idx, status: "error" as const, errors: [{ line: 0, field: "", message: String(err) }], warnings: [] };
        }
      }
    }

    try {
      const entry = createEntry(input);
      return { blockIndex: idx, status: "created" as const, entryId: entry.id, errors: [], warnings: [] };
    } catch (err) {
      return { blockIndex: idx, status: "error" as const, errors: [{ line: 0, field: "", message: String(err) }], warnings: [] };
    }
  });
}
