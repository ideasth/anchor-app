// client/src/pages/Activity/Dashboard.tsx
// Activity Log dashboard — active timer banner, today/week totals, recent entries.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

function fmtMinutes(minutes: number | null | undefined): string {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function currentIsoWeek(): string {
  const now = new Date();
  const dow = now.getUTCDay() || 7;
  const thursday = new Date(now.getTime() + (4 - dow) * 86400000);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() + (1 - jan4Dow) * 86400000);
  const weekNo = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

export default function ActivityDashboard() {
  const { toast } = useToast();
  const today = todayStr();
  const week = currentIsoWeek();

  const { data: timerData, refetch: refetchTimer } = useQuery({
    queryKey: ["/api/activity/timers/current"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/activity/timers/current");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const { data: dayReport } = useQuery({
    queryKey: ["/api/activity/reports/day", today],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/activity/reports/day?date=${today}`);
      return r.json();
    },
  });

  const { data: weekReport } = useQuery({
    queryKey: ["/api/activity/reports/week", week],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/activity/reports/week?iso_week=${week}`);
      return r.json();
    },
  });

  const { data: recentEntries } = useQuery({
    queryKey: ["/api/activity/entries", "recent"],
    queryFn: async () => {
      const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      const r = await apiRequest("GET", `/api/activity/entries?from=${from}&limit=50`);
      return r.json();
    },
  });

  const stopTimerMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/activity/timers/stop", {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activity/timers/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/reports/day"] });
      toast({ title: "Timer stopped" });
    },
  });

  const timer = timerData?.timer;
  const timerEntry = timerData?.entry;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <div className="flex gap-2">
          <Link href="/activity/search">
            <Button variant="outline" size="sm">Search</Button>
          </Link>
          <Link href="/activity/import">
            <Button variant="outline" size="sm">Import</Button>
          </Link>
          <Link href="/activity/reports">
            <Button variant="outline" size="sm">Reports</Button>
          </Link>
        </div>
      </div>

      {/* Active timer banner */}
      {timer && timerEntry && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{timerEntry.title}</div>
            <div className="text-sm text-muted-foreground">
              Timer running since {new Date(timer.startedUtc).toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => stopTimerMut.mutate()}
            disabled={stopTimerMut.isPending}
          >
            Stop
          </Button>
        </div>
      )}

      {/* Today + Week totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground mb-1">Today</div>
          <div className="text-2xl font-bold">{fmtMinutes(dayReport?.totalMinutes)}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {dayReport?.byCategory?.map((c: any) => (
              <Badge key={c.categoryId} variant="secondary">
                {c.categoryName}: {fmtMinutes(c.minutes)}
              </Badge>
            ))}
          </div>
          {dayReport?.countByStatus && (
            <div className="mt-2 text-xs text-muted-foreground">
              {Object.entries(dayReport.countByStatus as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </div>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-sm text-muted-foreground mb-1">This week ({week})</div>
          <div className="text-2xl font-bold">{fmtMinutes(weekReport?.totalMinutes)}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {weekReport?.byCategory?.map((c: any) => (
              <Badge key={c.categoryId} variant="secondary">
                {c.categoryName}: {fmtMinutes(c.minutes)}
              </Badge>
            ))}
          </div>
          {weekReport?.countByStatus && (
            <div className="mt-2 text-xs text-muted-foreground">
              {Object.entries(weekReport.countByStatus as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Recent entries */}
      <div>
        <h2 className="text-lg font-medium mb-3">Recent entries (last 14 days)</h2>
        {!recentEntries || recentEntries.length === 0 ? (
          <div className="text-muted-foreground text-sm">No entries yet. Use Import or add an entry manually.</div>
        ) : (
          <div className="space-y-2">
            {recentEntries.slice(0, 50).map((entry: any) => (
              <div key={entry.id} className="border rounded-lg p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{entry.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {entry.entryDate}
                    {entry.durationMinutes ? ` · ${fmtMinutes(entry.durationMinutes)}` : ""}
                    {entry.contextSummary ? ` — ${entry.contextSummary.slice(0, 80)}` : ""}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Badge variant={entry.status === "Complete" ? "default" : "secondary"} className="text-xs">
                    {entry.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
