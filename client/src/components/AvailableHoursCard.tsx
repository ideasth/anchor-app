// AvailableHoursCard — surfaces this week's project-time budget.
//
// Pulls /api/available-hours/this-week and shows a compact card.
// `variant="compact"` renders a 4-stat row + deep-work summary line for the
// Morning page; `variant="detailed"` shows the per-block breakdown for Review.

import { useQuery } from "@tanstack/react-query";
import { fmtDuration } from "@/lib/anchor";

interface DeepWorkBlock {
  ymd: string;
  startMin: number;
  endMin: number;
  minutes: number;
}

interface AvailableHoursThisWeek {
  weekLabel: string;
  mondayYmd: string;
  sundayYmd: string;
  totalWeekMinutes: number;
  sleepMinutes: number;
  totalWakingMinutes: number;
  paidWorkMinutes: number;
  familyMinutes: number;
  otherCommittedMinutes: number;
  freeMinutes: number;
  deepWorkBlocks: DeepWorkBlock[];
  deepWorkTotalMinutes: number;
  fragmentedMinutes: number;
  generatedAt: string;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatHm(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dayLabel(ymd: string, mondayYmd: string): string {
  // Compute index from Monday.
  const a = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(mondayYmd.slice(0, 4)),
    Number(mondayYmd.slice(5, 7)) - 1,
    Number(mondayYmd.slice(8, 10)),
  );
  const idx = Math.round((a - b) / 86_400_000);
  return DAY_NAMES[idx] ?? ymd.slice(5);
}

export function AvailableHoursCard({
  variant = "compact",
}: {
  variant?: "compact" | "detailed";
}) {
  const q = useQuery<AvailableHoursThisWeek>({
    queryKey: ["/api/available-hours/this-week"],
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Loading available hours…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Could not load available hours.
      </div>
    );
  }
  const d = q.data;

  if (variant === "compact") {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3" data-testid="available-hours-card">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Project time available — week of {d.mondayYmd}
            </div>
            <div className="clock-numerals text-2xl font-medium mt-1 tabular-nums">
              {fmtDuration(d.freeMinutes)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Deep-work blocks
            </div>
            <div className="text-sm tabular-nums mt-1">
              {d.deepWorkBlocks.length} ·{" "}
              <span className="text-muted-foreground">{fmtDuration(d.deepWorkTotalMinutes)}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <BreakdownItem label="Paid work" value={fmtDuration(d.paidWorkMinutes)} />
          <BreakdownItem label="Family" value={fmtDuration(d.familyMinutes)} />
          <BreakdownItem label="Other committed" value={fmtDuration(d.otherCommittedMinutes)} />
        </div>
        <div className="text-xs text-muted-foreground">
          Free hours = waking ({fmtDuration(d.totalWakingMinutes)}) − all events. Deep-work ={" "}
          unblocked windows ≥ 30 min. Sleep assumed 23:00 – 07:00.
        </div>
      </div>
    );
  }

  // Detailed variant: full table of deep-work blocks grouped by day.
  const byDay = new Map<string, DeepWorkBlock[]>();
  for (const b of d.deepWorkBlocks) {
    if (!byDay.has(b.ymd)) byDay.set(b.ymd, []);
    byDay.get(b.ymd)!.push(b);
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4" data-testid="available-hours-detailed">
      <header>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Available project time — week {d.weekLabel}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {d.mondayYmd} → {d.sundayYmd}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Free" value={fmtDuration(d.freeMinutes)} />
        <Stat label="Deep-work" value={fmtDuration(d.deepWorkTotalMinutes)} />
        <Stat label="Fragmented" value={fmtDuration(d.fragmentedMinutes)} />
        <Stat label="Paid work" value={fmtDuration(d.paidWorkMinutes)} />
        <Stat label="Family" value={fmtDuration(d.familyMinutes)} />
        <Stat label="Other committed" value={fmtDuration(d.otherCommittedMinutes)} />
        <Stat label="Waking total" value={fmtDuration(d.totalWakingMinutes)} />
        <Stat label="Sleep" value={fmtDuration(d.sleepMinutes)} />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Deep-work blocks (≥ 30 min)</h3>
        {d.deepWorkBlocks.length === 0 ? (
          <div className="text-sm text-muted-foreground italic rounded-lg border border-dashed p-4">
            No uninterrupted blocks this week. Calendar may need defragmenting.
          </div>
        ) : (
          <div className="space-y-1.5">
            {Array.from(byDay.entries())
              .sort((a, b) => (a[0] < b[0] ? -1 : 1))
              .map(([ymd, blocks]) => (
                <div key={ymd} className="flex items-baseline gap-3 text-sm">
                  <div className="w-12 text-xs uppercase tracking-wider text-muted-foreground">
                    {dayLabel(ymd, d.mondayYmd)}
                  </div>
                  <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    {blocks.map((b, i) => (
                      <span key={i}>
                        {formatHm(b.startMin)}–{formatHm(b.endMin)}{" "}
                        <span className="text-muted-foreground">({fmtDuration(b.minutes)})</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        Definitions: Sleep = 23:00 – 07:00. Paid work = Oliver's clinical /
        AUPFHS / medicolegal events (recognised by keyword). Family = events
        mentioning kids or Marieke. Free = waking minutes − all event minutes.
        Deep-work block = uninterrupted free window ≥ 30 min.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="clock-numerals text-lg font-medium mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function BreakdownItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="tabular-nums mt-0.5 text-sm">{value}</div>
    </div>
  );
}
