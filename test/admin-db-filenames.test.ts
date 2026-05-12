// Stage 14 phase 2 (2026-05-12) — verify the admin DB export/import
// route produces Buoy-branded filenames (Content-Disposition + temp
// files in os.tmpdir()). Wiring up the full express stack in a
// hermetic test would require booting storage.ts (opens data.db), so
// this is a source-level assertion against server/admin-db.ts — cheap,
// hermetic, and catches the exact strings the user observes when they
// hit the endpoint.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = readFileSync(
  path.resolve(__dirname, "../server/admin-db.ts"),
  "utf8",
);

describe("admin-db filename branding", () => {
  it("exports use a buoy-data-* Content-Disposition filename", () => {
    expect(SRC).toMatch(/filename="buoy-data-\$\{stamp\}\.db"/);
    expect(SRC).not.toMatch(/filename="anchor-data-/);
  });

  it("exports use a buoy-export-* temp filename in os.tmpdir()", () => {
    expect(SRC).toMatch(/buoy-export-\$\{Date\.now\(\)\}\.db/);
    expect(SRC).not.toMatch(/anchor-export-\$\{Date\.now\(\)\}/);
  });

  it("imports use a buoy-import-* temp filename in os.tmpdir()", () => {
    expect(SRC).toMatch(/buoy-import-\$\{stamp\}\.db/);
    expect(SRC).not.toMatch(/anchor-import-\$\{stamp\}/);
  });

  it("keeps the ANCHOR_DB_IMPORT_ENABLED env-var name (operator-only, out of scope)", () => {
    // Sanity: the operator kill-switch is intentionally NOT renamed in
    // phase 2, so a regression that auto-renames the env var would
    // break the deploy.
    expect(SRC).toMatch(/ANCHOR_DB_IMPORT_ENABLED/);
  });
});
