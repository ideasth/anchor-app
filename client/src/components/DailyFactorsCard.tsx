// DailyFactorsCard — Mood & Factors check-in.
//
// Renders the six measures defined in `lib/factors.ts`. Each measure is a
// forced single-choice row of icon buttons. Tapping a selected option clears
// it. State is persisted via PATCH /api/daily-factors/:ymd; the row is
// upserted server-side so a partial check-in is fine.
//
// `variant="compact"` is for the Morning page (smaller padding, smaller text).
// `variant="full"` is for the Reflect page.

import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { todayDateStr } from "@/lib/anchor";
import { cn } from "@/lib/utils";
import {
  FACTOR_MEASURES,
  type FactorKey,
  type FactorMeasure,
  type FactorOption,
} from "@/lib/factors";

interface FactorsResponse {
  date: string;
  factors: {
    mood: string | null;
    energy: string | null;
    cognitiveLoad: string | null;
    sleepQuality: string | null;
    focus: string | null;
    valuesAlignment: string | null;
  } | null;
}

interface Props {
  variant?: "compact" | "full";
  date?: string; // defaults to today
}

export function DailyFactorsCard({ variant = "full", date }: Props) {
  const ymd = date ?? todayDateStr();
  const q = useQuery<FactorsResponse>({
    queryKey: ["/api/daily-factors", ymd],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/daily-factors/${ymd}`);
      return r.json();
    },
  });

  const current = q.data?.factors ?? null;
  const compact = variant === "compact";

  const setValue = async (key: FactorKey, next: string | null) => {
    await apiRequest("PATCH", `/api/daily-factors/${ymd}`, { [key]: next });
    queryClient.invalidateQueries({ queryKey: ["/api/daily-factors", ymd] });
    queryClient.invalidateQueries({ queryKey: ["/api/daily-factors"] });
  };

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}> 
      {FACTOR_MEASURES.map((m) => (
        <FactorRow
          key={m.key}
          measure={m}
          current={(current?.[m.key] as string | null | undefined) ?? null}
          onPick={(v) => setValue(m.key, v)}
          compact={compact}
        />
      ))}
      <div className={cn("text-xs text-muted-foreground", compact && "text-[11px]")}> 
        Tap to set, tap again to clear. Saves automatically.
      </div>
    </div>
  );
}

function FactorRow({
  measure,
  current,
  onPick,
  compact,
}: {
  measure: FactorMeasure;
  current: string | null;
  onPick: (next: string | null) => void;
  compact: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}> 
      <div className="flex items-baseline justify-between gap-3">
        <div className={cn("text-sm font-medium", compact && "text-xs")}> {measure.title} </div>
        {!compact && (
          <div className="text-xs text-muted-foreground">{measure.helper}</div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {measure.options.map((o) => (
          <FactorButton
            key={o.value}
            option={o}
            selected={current === o.value}
            onClick={() => onPick(current === o.value ? null : o.value)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

function FactorButton({
  option,
  selected,
  onClick,
  compact,
}: {
  option: FactorOption;
  selected: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={option.label}
      title={option.label}
      data-testid={`factor-option-${option.value}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover-elevate active-elevate-2",
        compact && "px-2 py-1 text-xs",
        selected
          ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      <span aria-hidden="true">{option.icon}</span>
      <span className={cn(compact && "hidden sm:inline")}>{option.label}</span>
    </button>
  );
}
