// WeeklyFactorsStrip — Mon-Sun row of icons for each factor.
//
// Used on the Review page to surface mood/factor patterns at a glance.

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DailyFactors } from "@shared/schema";
import { FACTOR_MEASURES, getFactorOption, type FactorKey } from "@/lib/factors";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeekMelbourne(today: Date): Date {
  const dow = today.getDay(); // Sun=0..Sat=6
  const offset = dow === 0 ? -6 : 1 - dow;
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WeeklyFactorsStrip() {
  const monday = startOfWeekMelbourne(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fromYmd = ymd(monday);
  const toYmd = ymd(sunday);

  const q = useQuery<DailyFactors[]>({
    queryKey: ["/api/daily-factors", { from: fromYmd, to: toYmd }],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/daily-factors?from=${fromYmd}&to=${toYmd}`,
      );
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const byDate = new Map<string, DailyFactors>();
  const rows = Array.isArray(q.data) ? q.data : [];
  for (const row of rows) byDate.set(row.date, row);

  const days: { ymd: string; label: string; row?: DailyFactors }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = ymd(d);
    days.push({ ymd: key, label: DAY_LABELS[i], row: byDate.get(key) });
  }

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-normal px-3 py-2 w-32">Measure</th>
            {days.map((d) => (
              <th key={d.ymd} className="text-center font-normal px-2 py-2">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FACTOR_MEASURES.map((m) => (
            <tr key={m.key} className="border-t border-card-border">
              <td className="px-3 py-2 text-xs text-muted-foreground">{m.title}</td>
              {days.map((d) => {
                const value = d.row?.[m.key as FactorKey] as string | null | undefined;
                const opt = getFactorOption(m.key, value);
                return (
                  <td
                    key={d.ymd}
                    className={cn(
                      "text-center px-2 py-2 text-base",
                      !opt && "text-muted-foreground/30",
                    )}
                    title={opt ? `${opt.label} (${d.ymd})` : `Not logged (${d.ymd})`}
                  >
                    {opt ? <span aria-label={opt.label}>{opt.icon}</span> : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
