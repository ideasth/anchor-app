// Stage 20 (2026-05-17) — Activity parser: blocks, time zones, idempotency.
// Includes AEST↔AEDT cutover near 2026-10-05 per spec §L.

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { _setActivityTestDb, _resetActivityDb, runInlineMigrations } from "../server/activity/db";
import { parseBlock, splitBlocks, importActivityLogBlocks, blockToEntry } from "../server/activity/parser";

function setup() {
  _resetActivityDb();
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runInlineMigrations(db);
  _setActivityTestDb(db);
}

const VALID_BLOCK = `[ACTIVITY LOG]
date: 2026-05-17
sessionid: abc123
sessionkind: thread
sessionurl: pplx/sessions/abc123
title: Draft Stage 20 spec
category: Work
subcategory: App development
status: Complete
start: 2026-05-17T11:25:00+10:00
end: 2026-05-17T11:55:00+10:00
durationminutes: 30
tags: buoy, stage20, activity-log
buoytaskid:
buoyrelationshipid:
buoyemailstatusid:
billable: false
contextsummary: Wrote the full Stage 20 spec inside the Life Management space.
notes: Confirmed Option B.
[ACTIVITY LOG]`;

describe("Stage 20 — parser: parseBlock", () => {
  it("parses a valid block with all fields", () => {
    const parsed = parseBlock(VALID_BLOCK);
    expect(parsed.fields.date).toBe("2026-05-17");
    expect(parsed.fields.title).toBe("Draft Stage 20 spec");
    expect(parsed.fields.category).toBe("Work");
    expect(parsed.fields.status).toBe("Complete");
    expect(parsed.fields.sessionid).toBe("abc123");
    expect(parsed.errors).toHaveLength(0);
  });

  it("handles multi-word values correctly", () => {
    const parsed = parseBlock(VALID_BLOCK);
    expect(parsed.fields.subcategory).toBe("App development");
  });
});

describe("Stage 20 — parser: splitBlocks", () => {
  it("extracts a single block", () => {
    const blocks = splitBlocks(VALID_BLOCK);
    expect(blocks).toHaveLength(1);
  });

  it("extracts multiple blocks from one body", () => {
    const body = `${VALID_BLOCK}\n\n${VALID_BLOCK}`;
    const blocks = splitBlocks(body);
    expect(blocks).toHaveLength(2);
  });

  it("returns empty for input with no blocks", () => {
    expect(splitBlocks("just some text")).toHaveLength(0);
  });
});

describe("Stage 20 — parser: importActivityLogBlocks", () => {
  beforeEach(setup);

  it("creates an entry from a valid block", () => {
    const results = importActivityLogBlocks(VALID_BLOCK, { autocreate: true });
    expect(results[0].status).toBe("created");
    expect(results[0].entryId).toBeTypeOf("number");
  });

  it("re-import of same block (same sessionid) updates rather than duplicates", () => {
    importActivityLogBlocks(VALID_BLOCK, { autocreate: true });
    const results = importActivityLogBlocks(VALID_BLOCK, { autocreate: true });
    expect(results[0].status).toBe("updated");
  });

  it("dry-run does not write to DB", () => {
    const results = importActivityLogBlocks(VALID_BLOCK, { dryRun: true, autocreate: true });
    expect(results[0].status).toBe("skipped");
    expect(results[0].warnings).toContain("dry-run: no write performed");
  });

  it("returns error for missing required fields", () => {
    const badBlock = `[ACTIVITY LOG]
date: 2026-05-17
title: Missing category
status: Open
[ACTIVITY LOG]`;
    const results = importActivityLogBlocks(badBlock, {});
    expect(results[0].status).toBe("error");
    expect(results[0].errors.some((e) => e.field === "category")).toBe(true);
  });

  it("returns error for unknown category without autocreate", () => {
    const block = `[ACTIVITY LOG]
date: 2026-05-17
title: Unknown cat
category: ThisCategoryDoesNotExist
status: Open
[ACTIVITY LOG]`;
    const results = importActivityLogBlocks(block, {});
    expect(results[0].status).toBe("error");
  });

  it("creates category with autocreate=true for unknown category", () => {
    const block = `[ACTIVITY LOG]
date: 2026-05-17
title: New category test
category: BrandNewCategory
status: Open
[ACTIVITY LOG]`;
    const results = importActivityLogBlocks(block, { autocreate: true });
    expect(results[0].status).toBe("created");
  });

  it("processes multiple blocks in one body", () => {
    const body = `[ACTIVITY LOG]
date: 2026-05-17
title: Block one
category: Work
status: Open
[ACTIVITY LOG]

[ACTIVITY LOG]
date: 2026-05-17
title: Block two
category: Home
status: Open
[ACTIVITY LOG]`;
    const results = importActivityLogBlocks(body, { autocreate: true });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "created")).toBe(true);
  });
});

describe("Stage 20 — parser: timezone conversion", () => {
  it("converts +10:00 offset (AEST) to UTC correctly", () => {
    setup();
    const parsed = parseBlock(VALID_BLOCK);
    // start: 2026-05-17T11:25:00+10:00 → UTC 2026-05-17T01:25:00Z
    const { input } = blockToEntry(parsed, { autocreate: true });
    expect(input?.startUtc).toMatch(/2026-05-17T01:25/);
  });

  it("handles AEDT cutover date 2026-10-05 (Sunday) — times after 2am shift to +11", () => {
    // 2026-10-05 02:00 AEST becomes 2026-10-05 03:00 AEDT (the clock skips forward).
    // A session starting at 10:00 AEDT (+11:00) should parse to 23:00 UTC the day before.
    const block = `[ACTIVITY LOG]
date: 2026-10-05
title: Post-cutover session
category: Work
status: Complete
start: 2026-10-05T10:00:00+11:00
end: 2026-10-05T10:30:00+11:00
[ACTIVITY LOG]`;
    setup();
    const parsed = parseBlock(block);
    const { input } = blockToEntry(parsed, { autocreate: true });
    // 10:00+11 = 23:00Z previous day
    expect(input?.startUtc).toMatch(/2026-10-04T23:00/);
  });
});
