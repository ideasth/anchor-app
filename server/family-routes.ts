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
import { getCachedEventsForFeeds, eventsForDate } from "./ics";
import { emitFamilyIcs } from "./public-calendar";
import { storage } from "./storage";
import { resolveTravel } from "./travel";
import { handleSchedulingSearch } from "./scheduling-handlers";
import { buildPlannerXlsx } from "./planner";
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
  // Stage 17b — Apex planner API mirror.
  //
  // The family SPA now renders the same CalendarPlanner used on apex,
  // which expects to fetch from /api/planner/events, /api/planner/notes,
  // /api/today-events, /api/travel/today, and /api/scheduling/search.
  // We mount those exact paths on the family router so the apex client
  // code works unchanged; auth is enforced upstream by requireFamilyAuth.
  //
  // Same data store as apex (single-tenant DB). The family token IS the
  // family member's identity — they see and edit the same planner events
  // and notes Oliver does on apex.
  // ------------------------------------------------------------------

  async function getMergedPlannerEvents() {
    const s = storage.getSettings();
    return getCachedEventsForFeeds([
      { url: s.calendar_ics_url },
      { url: s.aupfhs_ics_url || "", summaryPrefix: "[Personal]" },
    ]);
  }

  router.get("/api/planner/events", async (req: Request, res: Response) => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const addDays = (d: string, n: number) => {
        const dt = new Date(d + "T00:00:00Z");
        dt.setUTCDate(dt.getUTCDate() + n);
        return dt.toISOString().slice(0, 10);
      };
      const from = (req.query.from as string) || todayStr;
      const to = (req.query.to as string) || addDays(todayStr, 365);
      const all = await getMergedPlannerEvents();
      const fromDt = new Date(from + "T00:00:00");
      const toDt = new Date(to + "T23:59:59");
      const filtered = all
        .filter((e) => {
          const s = new Date(e.start);
          const en = new Date(e.end);
          return en >= fromDt && s <= toDt;
        })
        .sort((a, b) => +new Date(a.start) - +new Date(b.start));
      res.json({ events: filtered });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

  router.get("/api/today-events", async (_req: Request, res: Response) => {
    try {
      const events = await getMergedPlannerEvents();
      const today = new Date();
      res.json({
        date: today.toISOString(),
        events: eventsForDate(events, today),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

  router.get("/api/planner/notes", (req: Request, res: Response) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const addDays = (d: string, n: number) => {
      const dt = new Date(d + "T00:00:00Z");
      dt.setUTCDate(dt.getUTCDate() + n);
      return dt.toISOString().slice(0, 10);
    };
    const from = (req.query.from as string) || todayStr;
    const to = (req.query.to as string) || addDays(todayStr, 365);
    res.json({ notes: storage.listPlannerNotes(from, to) });
  });

  router.put("/api/planner/notes/:date", (req: Request, res: Response) => {
    const date = String(req.params.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return void res.status(400).json({ error: "invalid date" });
    }
    const note = (req.body?.note ?? "") as string;
    if (!note.trim()) {
      storage.deletePlannerNote(date);
      return void res.json({ note: null });
    }
    res.json({ note: storage.upsertPlannerNote(date, note) });
  });

  router.get("/api/travel/today", async (_req: Request, res: Response) => {
    try {
      const events = await getMergedPlannerEvents();
      const todayEvents = eventsForDate(events, new Date());
      const locations = storage.listTravelLocations();
      const homeAddress = storage.getSettings().home_address ?? null;
      const items = todayEvents.map((event) => {
        const override = storage.getTravelOverride(event.uid) ?? null;
        const match = resolveTravel({ event, locations, override, homeAddress });
        return {
          event: {
            uid: event.uid,
            summary: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
            allDay: event.allDay,
          },
          ...match,
        };
      });
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: String(err?.message ?? err) });
    }
  });

  router.post("/api/scheduling/search", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawSources = body.sources;
    const sources: string[] = Array.isArray(rawSources)
      ? rawSources.filter((s): s is string => typeof s === "string")
      : [];
    const enabledEvents: import("./ics").CalEvent[] = [];
    if (sources.includes("outlook") || sources.includes("buoy")) {
      try {
        const events = await getMergedPlannerEvents();
        for (const ev of events) enabledEvents.push(ev);
      } catch {
        // Non-fatal: empty calendar on fetch failure.
      }
    }
    const result = await handleSchedulingSearch({ body, events: enabledEvents });
    res.status(result.status).json(result.body);
  });

  router.get("/api/planner/export", async (req: Request, res: Response) => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const addDays = (d: string, n: number) => {
        const dt = new Date(d + "T00:00:00Z");
        dt.setUTCDate(dt.getUTCDate() + n);
        return dt.toISOString().slice(0, 10);
      };
      const from = (req.query.from as string) || todayStr;
      const to = (req.query.to as string) || addDays(todayStr, 365);
      const all = await getMergedPlannerEvents();
      const fromDt = new Date(from + "T00:00:00");
      const toDt = new Date(to + "T23:59:59");
      const filtered = all.filter((e) => {
        const s = new Date(e.start);
        const en = new Date(e.end);
        return en >= fromDt && s <= toDt;
      });
      const notes = storage.listPlannerNotes(from, to);
      const buf = await buildPlannerXlsx(from, to, filtered, notes);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="buoy-planner-${from}-to-${to}.xlsx"`,
      );
      res.send(buf);
    } catch (err: any) {
      console.error("[family planner export] failed:", err);
      res.status(500).json({ error: "export failed" });
    }
  });

  // The apex client also probes /api/auth/status on boot. On the family host
  // any authenticated request implies family-token auth already passed, so
  // we report "authenticated" with a synthetic user. The apex login flow is
  // suppressed by FAMILY_CALENDAR mode on the client side anyway.
  router.get("/api/auth/status", (_req: Request, res: Response) => {
    res.json({ authenticated: true, user: { name: "Family", role: "family" } });
  });

  // ------------------------------------------------------------------
  // Serve family SPA
  // ------------------------------------------------------------------

  // Vite emits a single shared assets dir at dist/public/assets/ and the
  // family index.html references them as `../assets/...`. From a browser
  // sitting at https://buoy-family.thinhalo.com/ that resolves to
  // /assets/<hash>.js, so we serve from the shared dist/public/assets dir
  // (NOT dist/public/family/assets which doesn't exist).
  router.get("/assets/*splat", (req: Request, res: Response) => {
    const distBase = path.resolve(__dirname, "public", "assets");
    // req.path is /assets/<file>; strip the leading /assets to map into distBase.
    const rel = req.path.replace(/^\/assets\//, "");
    const assetPath = path.join(distBase, rel);
    if (!assetPath.startsWith(distBase + path.sep)) return void res.status(404).send("Not Found");
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
