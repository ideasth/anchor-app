// Stage 17c — smoke tests for the Tasks/Priorities page refactor.
//
// Source-text inspection (same pattern as family-page-smoke.test.ts and
// find-time-page.test.tsx). Asserts the rename, redirect, search/filter,
// drawer, and tag typeahead are wired in. The behaviour itself is exercised
// in the browser; this layer catches accidental regressions in the wiring.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const PRIORITIES_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/pages/Priorities.tsx"),
  "utf8",
);

const APP_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/App.tsx"),
  "utf8",
);

const LAYOUT_SRC = readFileSync(
  path.resolve(__dirname, "../client/src/components/Layout.tsx"),
  "utf8",
);

describe("Tasks/Priorities page (Stage 17c)", () => {
  // ---- Route + sidebar wiring ----
  it("sidebar nav links to /tasks with label 'Tasks/Priorities'", () => {
    expect(LAYOUT_SRC).toContain('href: "/tasks"');
    expect(LAYOUT_SRC).toContain('label: "Tasks/Priorities"');
    // The old href should not be the active nav target any more.
    expect(LAYOUT_SRC).not.toMatch(/href:\s*"\/priorities"\s*,\s*label:\s*"Priorities"/);
  });

  it("App.tsx mounts Priorities at /tasks", () => {
    expect(APP_SRC).toMatch(/<Route path="\/tasks" component=\{Priorities\}/);
  });

  it("App.tsx has a PrioritiesRedirect from /priorities -> /tasks", () => {
    expect(APP_SRC).toContain("function PrioritiesRedirect");
    expect(APP_SRC).toMatch(/navigate\("\/tasks",\s*\{\s*replace:\s*true\s*\}/);
    expect(APP_SRC).toMatch(/<Route path="\/priorities" component=\{PrioritiesRedirect\}/);
  });

  // ---- Page header rename ----
  it("page header reads 'Tasks & Priorities'", () => {
    // Encoded as Tasks &amp; Priorities in JSX source.
    expect(PRIORITIES_SRC).toContain("Tasks &amp; Priorities");
  });

  // ---- Preserved features (must NOT be removed) ----
  it("preserves the top-three slot picker", () => {
    expect(PRIORITIES_SRC).toContain("top-slot-");
    expect(PRIORITIES_SRC).toContain("button-set-slot-");
  });

  it("preserves the Domain-grouped triage list (family-first)", () => {
    expect(PRIORITIES_SRC).toContain("Family first");
    expect(PRIORITIES_SRC).toContain("Clinical work");
    expect(PRIORITIES_SRC).toContain("Medicolegal");
    expect(PRIORITIES_SRC).toContain("Health");
    expect(PRIORITIES_SRC).toContain("Personal");
  });

  // ---- New: search + filter chips ----
  it("renders a search input with placeholder mentioning title/notes/project", () => {
    expect(PRIORITIES_SRC).toContain('data-testid="task-search-input"');
    expect(PRIORITIES_SRC).toMatch(/placeholder="Search title, notes or project/);
  });

  it("renders filter chips for domain, status, priority, project", () => {
    expect(PRIORITIES_SRC).toContain('data-testid="filter-domain"');
    expect(PRIORITIES_SRC).toContain('data-testid="filter-status"');
    expect(PRIORITIES_SRC).toContain('data-testid="filter-priority"');
    expect(PRIORITIES_SRC).toContain('data-testid="filter-tag"');
  });

  it("default status filter is 'open' (todo + doing)", () => {
    expect(PRIORITIES_SRC).toMatch(/useState<string>\("open"\)/);
  });

  it("filter clear button resets back to defaults", () => {
    expect(PRIORITIES_SRC).toContain('data-testid="filter-clear"');
  });

  it("search matches across title + notes + tag", () => {
    expect(PRIORITIES_SRC).toMatch(
      /hay = \[t\.title, t\.notes \?\? "", t\.tag \?\? ""\]\.join/,
    );
  });

  // ---- Tag (project) typeahead ----
  it("renders the tag typeahead component with create-new option", () => {
    expect(PRIORITIES_SRC).toContain("TagTypeahead");
    expect(PRIORITIES_SRC).toContain('data-testid="tag-typeahead-input"');
    expect(PRIORITIES_SRC).toContain('data-testid="tag-create-new"');
    expect(PRIORITIES_SRC).toContain('data-testid="tag-clear"');
  });

  it("tag suggestions are deduplicated case-insensitively", () => {
    expect(PRIORITIES_SRC).toMatch(/seen\.has\(key\)/);
  });

  // ---- Details drawer ----
  it("renders the details drawer with full edit form + delete", () => {
    expect(PRIORITIES_SRC).toContain('data-testid="task-details-drawer"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-title"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-status"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-priority"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-domain"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-estimate"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-due"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-notes"');
    expect(PRIORITIES_SRC).toContain('data-testid="drawer-delete"');
  });

  it("each task row has a button to open the details drawer", () => {
    expect(PRIORITIES_SRC).toMatch(/data-testid={`task-edit-\$\{t\.id\}`}/);
  });

  // ---- Task row inline controls ----
  it("each task row has a status toggle checkbox", () => {
    expect(PRIORITIES_SRC).toMatch(/data-testid={`task-toggle-\$\{t\.id\}`}/);
  });

  it("each task row exposes its own inline tag typeahead", () => {
    expect(PRIORITIES_SRC).toMatch(/testId={`row-tag-\$\{t\.id\}`}/);
  });

  // ---- API surface usage ----
  it("uses PATCH /api/tasks/:id for status / tag / drawer edits", () => {
    expect(PRIORITIES_SRC).toMatch(/apiRequest\("PATCH", `\/api\/tasks\/\$\{[^}]+\}`/);
  });

  it("uses DELETE /api/tasks/:id when deleting from the drawer", () => {
    expect(PRIORITIES_SRC).toMatch(/apiRequest\("DELETE", `\/api\/tasks\/\$\{task\.id\}`/);
  });

  // ---- AU spelling + no emoji ----
  it("no emoji characters in source", () => {
    const emojiRe = /[\u{1F300}-\u{1FFFF}]/u;
    expect(emojiRe.test(PRIORITIES_SRC)).toBe(false);
  });
});
