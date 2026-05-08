// Canonical inventory of Anchor's recurring crons that need retuning at the
// AEDT cutover (Sun 5 Oct 2026 03:00 AEST -> 03:00 AEDT, clocks jump +1h).
//
// This is the source of truth for the AEDT cutover reminder (cron 236aa4a4).
// When that cron fires on Sat 3 Oct 2026, the proposed retune list it shows
// to the user MUST match this file. If you add or remove a cron, update this
// list and the test in test/cron-inventory.test.ts will keep things honest.
//
// Each entry's `aedtCron` is the `currentCron` shifted -1 hour in UTC, so
// that the Melbourne local time stays the same after AEDT begins.

export interface CronInventoryEntry {
  /** 8-char short cron id assigned by the platform. */
  id: string;
  /** Short human label. */
  label: string;
  /** Current UTC cron expression (valid before 2026-10-05). */
  currentCron: string;
  /** UTC cron expression to apply on/after 2026-10-05 to keep the same Melbourne local time. */
  aedtCron: string;
  /** Local Melbourne time (informational; does not change at the cutover). */
  melbourneLocal: string;
}

export const AEDT_RETUNE_INVENTORY: ReadonlyArray<CronInventoryEntry> = [
  {
    id: "8e8b7bb5",
    label: "weekly backup (Sun 03:00)",
    currentCron: "0 17 * * 6",
    aedtCron: "0 16 * * 6",
    melbourneLocal: "Sun 03:00",
  },
  {
    id: "0697627f",
    label: "daily morning briefing (06:00)",
    currentCron: "0 20 * * *",
    aedtCron: "0 19 * * *",
    melbourneLocal: "06:00 daily",
  },
  {
    id: "2928f9fa",
    label: "calendar sync (06:00 + 18:00)",
    currentCron: "0 8,20 * * *",
    aedtCron: "0 7,19 * * *",
    melbourneLocal: "06:00 and 18:00 daily",
  },
  {
    id: "67fb0e91",
    label: "weekly review (Sun 18:30)",
    currentCron: "30 8 * * 0",
    aedtCron: "30 7 * * 0",
    melbourneLocal: "Sun 18:30",
  },
  {
    id: "b4a58a27",
    label: "calendar refresh (06:00 + 18:00)",
    currentCron: "0 8,20 * * *",
    aedtCron: "0 7,19 * * *",
    melbourneLocal: "06:00 and 18:00 daily",
  },
  {
    id: "17df3d7e",
    label: "Outlook+Capture bridge (every 2h 06-22)",
    currentCron: "54 0,2,4,6,8,10,12,20,22 * * *",
    aedtCron: "54 23,1,3,5,7,9,11,19,21 * * *",
    melbourneLocal: "every 2h, 06-22",
  },
  {
    id: "c751741f",
    label: "Email Status pull (6-hourly 00/06/12/18)",
    currentCron: "0 20,2,8,14 * * *",
    aedtCron: "0 19,1,7,13 * * *",
    melbourneLocal: "00:00, 06:00, 12:00, 18:00 daily",
  },
  {
    id: "28a67578",
    label: "weekly data.db snapshot (Sun 03:00)",
    currentCron: "0 17 * * 0",
    aedtCron: "0 16 * * 0",
    melbourneLocal: "Sun 03:00",
  },
  {
    id: "d08f13f1",
    label: "verify backup-receipt loop (Sat 18:00)",
    currentCron: "0 8 * * 6",
    aedtCron: "0 7 * * 6",
    melbourneLocal: "Sat 18:00",
  },
] as const;

/**
 * Render the inventory as the markdown bullet list used in cron 236aa4a4's body.
 * The cron body should match this output verbatim. If the cron body is edited
 * by hand, run this function and replace the list to keep things in sync.
 */
export function renderAedtRetuneList(): string {
  return AEDT_RETUNE_INVENTORY.map(
    (e) => `- ${e.id} (${e.label}): ${e.currentCron} -> ${e.aedtCron}`,
  ).join("\n");
}

/**
 * Parse a UTC cron expression's hour field and return all hours as integers.
 * Supports comma-separated values. Does NOT support ranges or steps —
 * the inventory only uses comma lists or single values.
 */
export function parseHourField(cron: string): number[] {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`expected 5 cron fields, got ${fields.length}: ${cron}`);
  const hourField = fields[1];
  if (!/^[0-9,]+$/.test(hourField)) {
    throw new Error(`unsupported hour field syntax (no ranges/steps allowed): ${hourField}`);
  }
  return hourField.split(",").map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 23) throw new Error(`invalid hour: ${s}`);
    return n;
  });
}
