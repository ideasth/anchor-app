// Stage 17 — Public availability page.
// Served from oliver-availability.thinhalo.com.
//
// Read-only. Shows 12 weeks of Available blocks.
// Token is in URL (?t=) on first visit; subsequent visits use a cookie.
// No titles, no event detail beyond duration label.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AvailBlock {
  startUtcMs: number;
  endUtcMs: number;
  durationMin: number;
}

interface WeekData {
  isoWeek: string;
  days: {
    label: string;
    ymd: string;
    blocks: AvailBlock[];
    isToday: boolean;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function formatHm(utcMs: number): string {
  const d = new Date(utcMs);
  return d.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isoWeekLabel(d: Date): string {
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000);
  const diffDays = Math.round((d.getTime() - mondayW1.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function mondayOfIsoWeek(isoWeek: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!m) return new Date();
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const mondayW1 = new Date(jan4.getTime() - (jan4Dow - 1) * 86400000);
  return new Date(mondayW1.getTime() + (week - 1) * 7 * 86400000);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Fetch available blocks from the ICS feed
// ---------------------------------------------------------------------------

async function fetchAvailableBlocks(): Promise<AvailBlock[]> {
  // Read token from URL params
  const urlToken = new URLSearchParams(window.location.search).get("t") ?? "";
  const url = urlToken ? `/elgin.ics?t=${encodeURIComponent(urlToken)}` : `/elgin.ics`;

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const text = await res.text();
  return parseIcsBlocks(text);
}

function parseIcsBlocks(ics: string): AvailBlock[] {
  const blocks: AvailBlock[] = [];
  const lines = ics.split(/\r?\n/);
  let inEvent = false;
  let dtstart = "";
  let dtend = "";

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      dtstart = "";
      dtend = "";
    } else if (line === "END:VEVENT" && inEvent) {
      inEvent = false;
      if (dtstart && dtend) {
        const start = parseIcsDt(dtstart);
        const end = parseIcsDt(dtend);
        if (start && end) {
          const durationMin = Math.round((end - start) / 60000);
          blocks.push({ startUtcMs: start, endUtcMs: end, durationMin });
        }
      }
    } else if (inEvent) {
      if (line.startsWith("DTSTART:")) dtstart = line.slice(8).trim();
      else if (line.startsWith("DTEND:")) dtend = line.slice(6).trim();
    }
  }
  return blocks;
}

function parseIcsDt(s: string): number | null {
  // Format: yyyymmddTHHmmssZ
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null;
  return Date.UTC(
    parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
    parseInt(m[4]), parseInt(m[5]), parseInt(m[6]),
  );
}

// ---------------------------------------------------------------------------
// Build 12-week grid
// ---------------------------------------------------------------------------

function buildWeekGrid(blocks: AvailBlock[], now: Date): WeekData[] {
  const todayYmd = ymd(now);
  const currentWeek = isoWeekLabel(now);
  const weeks: WeekData[] = [];

  for (let w = 0; w < 12; w++) {
    const weekLabel = isoWeekLabel(addDays(mondayOfIsoWeek(currentWeek), w * 7));
    const monday = mondayOfIsoWeek(weekLabel);
    const days = DAY_LABELS.map((label, i) => {
      const day = addDays(monday, i);
      const dayYmd = ymd(day);
      const dayStart = new Date(dayYmd + "T00:00:00Z").getTime();
      const dayEnd = dayStart + 86400000;
      const dayBlocks = blocks.filter(
        (b) => b.startUtcMs >= dayStart && b.startUtcMs < dayEnd,
      );
      return {
        label,
        ymd: dayYmd,
        blocks: dayBlocks,
        isToday: dayYmd === todayYmd,
      };
    });
    weeks.push({ isoWeek: weekLabel, days });
  }

  return weeks;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AvailabilityApp() {
  const now = new Date();

  const { data: blocks = [], isLoading, error } = useQuery({
    queryKey: ["avail-blocks"],
    queryFn: fetchAvailableBlocks,
    staleTime: 5 * 60 * 1000,
  });

  const weekGrid = buildWeekGrid(blocks, now);
  const icsUrl = (() => {
    const t = new URLSearchParams(window.location.search).get("t");
    return t ? `/elgin.ics?t=${encodeURIComponent(t)}` : "/elgin.ics";
  })();

  function copyIcsUrl() {
    const fullUrl = `${window.location.origin}${icsUrl}`;
    navigator.clipboard.writeText(fullUrl).catch(() => {});
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 font-sans max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Oliver — availability</h1>
        <p className="text-sm text-muted-foreground">
          Next 12 weeks of available time. Updated every 5 minutes.
          Times shown in Australia/Melbourne.
        </p>
      </header>

      {isLoading && (
        <div className="text-sm text-muted-foreground italic">Loading...</div>
      )}

      {error && (
        <div className="text-sm text-destructive">Failed to load availability data.</div>
      )}

      {/* 12-week grid */}
      {!isLoading && (
        <div className="space-y-6">
          {weekGrid.map((week) => (
            <WeekRow key={week.isoWeek} week={week} />
          ))}
        </div>
      )}

      {/* ICS subscribe panel */}
      <div className="mt-8 p-4 border rounded-lg">
        <h2 className="text-sm font-semibold mb-2">Subscribe to this calendar</h2>
        <div className="flex gap-2 items-center">
          <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
            {window.location.origin}{icsUrl}
          </code>
          <button
            onClick={copyIcsUrl}
            className="text-xs px-3 py-1 border rounded shrink-0"
          >
            Copy
          </button>
        </div>
      </div>

      <footer className="mt-8 text-xs text-muted-foreground border-t pt-4">
        Sanitised availability feed. Refreshes every 5 minutes. Times shown in Australia/Melbourne.
        Updated: {now.toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekRow
// ---------------------------------------------------------------------------

function WeekRow({ week }: { week: WeekData }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{week.isoWeek}</div>
      <div className="grid grid-cols-6 gap-1">
        {week.days.map((day) => (
          <div
            key={day.ymd}
            className={`border rounded p-1 min-h-16 text-xs ${
              day.isToday ? "border-primary" : ""
            }`}
          >
            <div
              className={`font-semibold mb-1 ${
                day.isToday ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {day.label}
            </div>
            {day.blocks.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              day.blocks.map((blk, i) => (
                <div
                  key={i}
                  className="bg-green-100 dark:bg-green-900/30 rounded px-1 py-0.5 mb-0.5 text-green-800 dark:text-green-200"
                >
                  {formatHm(blk.startUtcMs)}–{formatHm(blk.endUtcMs)}
                  <br />
                  <span className="text-green-600 dark:text-green-400">
                    Available ({Math.floor(blk.durationMin / 15) * 15} min)
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
