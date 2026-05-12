// Stage 17 — routes for buoy-family.thinhalo.com.
//
// All routes here are host-guarded to "family" by the middleware in routes.ts.
// Any request from another hostname returns 404 before reaching these handlers.

import type { Express, Request, Response, Router } from "express";
import { Router as makeRouter } from "express";
import { requireFamilyAuth } from "./family-auth";
import {
  listFamilyEvents,
  createFamilyEvent,
  patchFamilyEvent,
  deleteFamilyEvent,
  getFamilyDayNote,
  upsertFamilyDayNote,
  getFamilyWeekNote,
  upsertFamilyWeekNote,
} from "./family-storage";
import { getSetting, KEY } from "./app-settings";
import { getCachedEventsForFeeds } from "./ics";
import { emitFamilyIcs } from "./public-calendar";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";

export function makeFamilyRouter(): Router {
  const router = makeRouter();

  // All routes on the family hostname require family auth.
  router.use(requireFamilyAuth);

  // ------------------------------------------------------------------
  // ICS feeds
  // ------------------------------------------------------------------

  // GET /cal/private.ics  — Basic-auth-gated family ICS feed
  // GET /cal/:token.ics   — token-in-path family ICS feed
  async function serveFamilyIcs(req: Request, res: Response) {
    // Token-in-path variant: check token matches
    if (req.params.token) {
      const storedToken = getSetting(KEY.FAMILY_CALENDAR_TOKEN) ?? "";
      if (!storedToken || req.params.token !== storedToken) {
        return void res.status(404).send("Not Found");
      }
    }

    const s = storage.getSettings();
    const allFeeds: Array<{ url: string }> = [];
    if (s.calendar_ics_url) allFeeds.push({ url: s.calendar_ics_url });
    if (s.aupfhs_ics_url) allFeeds.push({ url: s.aupfhs_ics_url });

    const now = Date.now();
    const fromUtc = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    const toUtc = new Date(now + 12 * 7 * 24 * 60 * 60 * 1000).toISOString();

    let calEvents: import("./ics").CalEvent[] = [];
    try {
      calEvents = await getCachedEventsForFeeds(allFeeds);
      // filter to window
      calEvents = calEvents.filter((e) => {
        const s = new Date(e.start).getTime();
        const end = new Date(e.end).getTime();
        return end >= now - 90 * 24 * 60 * 60 * 1000 && s <= now + 12 * 7 * 24 * 60 * 60 * 1000;
      });
    } catch {
      // Degraded: serve family-only events
    }

    const familyEvents = listFamilyEvents(fromUtc, toUtc);

    // Gather day and week notes for the window
    const { db } = await import("./storage");
    let dayNotes: Array<{ date_local: string; body: string }> = [];
    let weekNotes: Array<{ iso_week: string; body: string }> = [];
    try {
      const { getFamilyDb } = await import("./family-storage");
      const fdb = getFamilyDb();
      dayNotes = fdb
        .prepare(
          `SELECT date_local, body FROM family_day_notes WHERE date_local >= ? AND date_local <= ?`,
        )
        .all(fromUtc.slice(0, 10), toUtc.slice(0, 10)) as any[];
      weekNotes = fdb
        .prepare(
          `SELECT iso_week, body FROM family_week_notes ORDER BY iso_week`,
        )
        .all() as any[];
    } catch {}

    const ics = emitFamilyIcs(calEvents, familyEvents, dayNotes, weekNotes);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="family.ics"');
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(ics);
  }

  router.get("/cal/private.ics", serveFamilyIcs);
  router.get("/cal/:token.ics", serveFamilyIcs);

  // ------------------------------------------------------------------
  // Family events API
  // ------------------------------------------------------------------

  router.get("/family/api/events", (req: Request, res: Response) => {
    const fromUtc = String(req.query.from || new Date(Date.now() - 30 * 86400000).toISOString());
    const toUtc = String(req.query.to || new Date(Date.now() + 90 * 86400000).toISOString());
    try {
      const events = listFamilyEvents(fromUtc, toUtc);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: String(err.message) });
    }
  });

  router.post("/family/api/events", (req: Request, res: Response) => {
    try {
      const added_by = (req as any).familyAuthBy ?? "token";
      const ev = createFamilyEvent({ ...req.body, added_by });
      res.status(201).json(ev);
    } catch (err: any) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  router.patch("/family/api/events/:id", (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return void res.status(400).json({ error: "invalid id" });
    try {
      const ev = patchFamilyEvent(id, req.body);
      if (!ev) return void res.status(404).json({ error: "not found" });
      res.json(ev);
    } catch (err: any) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  router.delete("/family/api/events/:id", (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!id) return void res.status(400).json({ error: "invalid id" });
    const ok = deleteFamilyEvent(id);
    if (!ok) return void res.status(404).json({ error: "not found" });
    res.status(204).send();
  });

  // ------------------------------------------------------------------
  // Day notes
  // ------------------------------------------------------------------

  router.get("/family/api/notes/day/:date", (req: Request, res: Response) => {
    const note = getFamilyDayNote(String(req.params.date));
    if (!note) return void res.status(404).json({ error: "not found" });
    res.json(note);
  });

  router.put("/family/api/notes/day/:date", (req: Request, res: Response) => {
    const updatedBy = (req as any).familyAuthBy ?? "token";
    const body = String(req.body?.body ?? "");
    try {
      const note = upsertFamilyDayNote(String(req.params.date), body, updatedBy);
      if (!note) return void res.status(204).send();
      res.json(note);
    } catch (err: any) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  // ------------------------------------------------------------------
  // Week notes
  // ------------------------------------------------------------------

  router.get("/family/api/notes/week/:isoweek", (req: Request, res: Response) => {
    const note = getFamilyWeekNote(String(req.params.isoweek));
    if (!note) return void res.status(404).json({ error: "not found" });
    res.json(note);
  });

  router.put("/family/api/notes/week/:isoweek", (req: Request, res: Response) => {
    const updatedBy = (req as any).familyAuthBy ?? "token";
    const body = String(req.body?.body ?? "");
    try {
      const note = upsertFamilyWeekNote(String(req.params.isoweek), body, updatedBy);
      if (!note) return void res.status(204).send();
      res.json(note);
    } catch (err: any) {
      res.status(400).json({ error: String(err.message) });
    }
  });

  // ------------------------------------------------------------------
  // Serve family SPA
  // ------------------------------------------------------------------

  router.get("/assets/*splat", (req: Request, res: Response) => {
    const distBase = path.resolve(__dirname, "public", "family");
    const assetPath = path.join(distBase, req.path);
    if (!assetPath.startsWith(distBase)) return void res.status(404).send("Not Found");
    res.sendFile(assetPath, (err) => {
      if (err) res.status(404).send("Not Found");
    });
  });

  router.get("/", (req: Request, res: Response) => {
    const indexPath = path.resolve(__dirname, "public", "family", "index.html");
    if (!fs.existsSync(indexPath)) {
      return void res.status(503).send("Family app not built");
    }
    res.sendFile(indexPath);
  });

  // Catch-all: 404 for any other path on the family hostname
  router.use((_req: Request, res: Response) => {
    res.status(404).send("Not Found");
  });

  return router;
}
