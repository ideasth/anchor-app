// server/activity-routes.ts
// All /api/activity/* routes. Apex-only (family + availability return 404 via
// the host guard in routes.ts). Session-auth-gated throughout.

import type { Express, Request, Response } from "express";
import express from "express";
import {
  createEntry,
  updateEntry,
  deleteEntry,
  listEntries,
  getEntry,
  startTimer,
  stopTimer,
  getCurrentTimer,
  listCategories,
  listSubcategories,
  createCategory,
  createSubcategory,
} from "./activity/service";
import { searchEntries } from "./activity/fts";
import {
  reportDay,
  reportWeek,
  reportByCategory,
  reportBySubcategory,
  reportBySource,
  reportByRelationship,
  currentIsoWeek,
} from "./activity/reports";
import { importActivityLogBlocks } from "./activity/parser";
import { entriesToCsv } from "./activity/exporters/csv";
import { entriesToMarkdown } from "./activity/exporters/markdown";
import {
  buildWeeklyDigest,
  writeDigest,
  listDigests,
} from "./activity/digest/weekly";
import { enrichEntry, enrichEntries } from "./activity/buoy-enrichment";

type Authed = (req: Request, res: Response) => boolean;

export function registerActivityRoutes(
  app: Express,
  requireUserOrOrchestrator: Authed,
): void {
  const json4k = express.json({ limit: "4kb" });
  const json1m = express.json({ limit: "1mb" });

  // -------------------------------------------------------------------------
  // Taxonomy
  // -------------------------------------------------------------------------

  app.get("/api/activity/categories", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    res.json(listCategories());
  });

  app.post("/api/activity/categories", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return void res.status(400).json({ error: "name is required" });
    }
    try {
      res.status(201).json(createCategory(name));
    } catch (err) {
      res.status(409).json({ error: String(err) });
    }
  });

  app.get("/api/activity/subcategories", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const catId = req.query.category_id ? Number(req.query.category_id) : undefined;
    res.json(listSubcategories(catId));
  });

  app.post("/api/activity/subcategories", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const { category_id, name } = req.body ?? {};
    if (!name || typeof name !== "string") {
      return void res.status(400).json({ error: "name is required" });
    }
    const catId = Number(category_id);
    if (!catId) return void res.status(400).json({ error: "category_id is required" });
    try {
      res.status(201).json(createSubcategory(catId, name));
    } catch (err) {
      res.status(409).json({ error: String(err) });
    }
  });

  // Convenience: combined taxonomy endpoint.
  app.get("/api/activity/taxonomy", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    res.json({ categories: listCategories(), subcategories: listSubcategories() });
  });

  // -------------------------------------------------------------------------
  // Entries
  // -------------------------------------------------------------------------

  app.get("/api/activity/entries", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const q = req.query;
    try {
      const entries = listEntries({
        from: q.from as string,
        to: q.to as string,
        categoryId: q.category_id ? Number(q.category_id) : undefined,
        subcategoryId: q.subcategory_id ? Number(q.subcategory_id) : undefined,
        status: q.status as string,
        sourceKind: q.source_kind as string,
        relationshipId: q.relationship_id as string,
        taskId: q.task_id as string,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
      res.json(enrichEntries(entries));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get("/api/activity/entries/:id", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const id = Number(req.params.id);
    const entry = getEntry(id);
    if (!entry) return void res.status(404).json({ error: "not found" });
    res.json(enrichEntry(entry));
  });

  app.post("/api/activity/entries", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    try {
      const entry = createEntry(req.body);
      res.status(201).json(enrichEntry(entry));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.patch("/api/activity/entries/:id", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const id = Number(req.params.id);
    try {
      const entry = updateEntry(id, req.body);
      if (!entry) return void res.status(404).json({ error: "not found" });
      res.json(enrichEntry(entry));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete("/api/activity/entries/:id", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const id = Number(req.params.id);
    const deleted = deleteEntry(id);
    if (!deleted) return void res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------

  app.post("/api/activity/timers/start", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    try {
      const result = startTimer(req.body);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post("/api/activity/timers/stop", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    try {
      const entry = stopTimer(req.body ?? {});
      if (!entry) return void res.status(404).json({ error: "no running timer" });
      res.json(enrichEntry(entry));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get("/api/activity/timers/current", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const timer = getCurrentTimer();
    if (!timer) return void res.json(null);
    const entry = getEntry(timer.entryId);
    res.json({ timer, entry: entry ? enrichEntry(entry) : null });
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  app.get("/api/activity/search", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const q = req.query;
    const query = q.q as string;
    if (!query) return void res.status(400).json({ error: "q is required" });
    try {
      const hits = searchEntries(query, {
        from: q.from as string,
        to: q.to as string,
        categoryId: q.category_id ? Number(q.category_id) : undefined,
        subcategoryId: q.subcategory_id ? Number(q.subcategory_id) : undefined,
        status: q.status as string,
        sourceKind: q.source_kind as string,
        relationshipId: q.relationship_id as string,
        taskId: q.task_id as string,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      res.json(hits);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  app.get("/api/activity/reports/day", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    res.json(reportDay(date));
  });

  app.get("/api/activity/reports/week", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const isoWeek = (req.query.iso_week as string) || currentIsoWeek();
    try {
      res.json(reportWeek(isoWeek));
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get("/api/activity/reports/by-category", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const from = (req.query.from as string) || "2000-01-01";
    const to = (req.query.to as string) || "9999-12-31";
    res.json(reportByCategory(from, to));
  });

  app.get("/api/activity/reports/by-subcategory", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const from = (req.query.from as string) || "2000-01-01";
    const to = (req.query.to as string) || "9999-12-31";
    const catId = req.query.category_id ? Number(req.query.category_id) : undefined;
    res.json(reportBySubcategory(from, to, catId));
  });

  app.get("/api/activity/reports/by-source", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const from = (req.query.from as string) || "2000-01-01";
    const to = (req.query.to as string) || "9999-12-31";
    res.json(reportBySource(from, to));
  });

  app.get("/api/activity/reports/by-relationship", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const from = (req.query.from as string) || "2000-01-01";
    const to = (req.query.to as string) || "9999-12-31";
    res.json(reportByRelationship(from, to));
  });

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------

  app.post("/api/activity/import", json1m, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const { block } = req.body ?? {};
    const dryRun = req.query.dry_run === "1" || req.query.dryRun === "1";
    const autocreate = req.query.autocreate === "1";

    if (!block || typeof block !== "string") {
      return void res.status(400).json({ error: "block (string) is required in request body" });
    }

    const results = importActivityLogBlocks(block, { dryRun, autocreate });

    const hasErrors = results.some((r) => r.status === "error");
    const created = results.filter((r) => r.status === "created").map((r) => r.entryId);
    const updated = results.filter((r) => r.status === "updated").map((r) => r.entryId);
    const skipped = results.filter((r) => r.status === "skipped").length;
    const warnings = results.flatMap((r) => r.warnings);

    res.status(hasErrors ? 400 : 200).json({
      results,
      created,
      updated,
      skippedCount: skipped,
      warnings,
    });
  });

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------

  app.get("/api/activity/export.csv", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const q = req.query;
    const entries = listEntries({
      from: q.from as string,
      to: q.to as string,
      categoryId: q.category_id ? Number(q.category_id) : undefined,
      limit: 10000,
    });
    const csv = entriesToCsv(entries);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="activity-export.csv"`);
    res.send(csv);
  });

  app.get("/api/activity/export.md", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const q = req.query;
    const entries = listEntries({
      from: q.from as string,
      to: q.to as string,
      categoryId: q.category_id ? Number(q.category_id) : undefined,
      limit: 10000,
    });
    const md = entriesToMarkdown(entries);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="activity-export.md"`);
    res.send(md);
  });

  // -------------------------------------------------------------------------
  // Weekly Digest
  // -------------------------------------------------------------------------

  app.get("/api/activity/digests/weekly", (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const isoWeek = req.query.iso_week as string | undefined;
    try {
      const payload = buildWeeklyDigest(isoWeek);
      // Also return any stored digests for that week.
      const stored = listDigests(payload.isoWeek);
      res.json({ payload, stored });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post("/api/activity/digests/weekly", json4k, (req, res) => {
    if (!requireUserOrOrchestrator(req, res)) return;
    const { iso_week, narrative } = req.body ?? {};
    if (!narrative || typeof narrative !== "string") {
      return void res.status(400).json({ error: "narrative (string) is required" });
    }
    try {
      const payload = buildWeeklyDigest(iso_week);
      const result = writeDigest(payload, narrative, "manual");
      res.status(201).json({ ...result, isoWeek: payload.isoWeek });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });
}
