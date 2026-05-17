// client/src/pages/Activity/Reports.tsx
// Activity Reports page — date-range picker, six panels.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
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

function fmtMinutes(m: number): string {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

export default function ActivityReports() {
  const today = todayStr();
  const [from, setFrom] = useState(nDaysAgo(7));
  const [to, setTo] = useState(today);

  const { data: catReport } = useQuery({
    queryKey: ["/api/activity/reports/by-category", from, to],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/activity/reports/by-category?from=${from}&to=${to}`);
      return r.json();
    },
  });

  const { data: subReport } = useQuery({
    queryKey: ["/api/activity/reports/by-subcategory", from, to],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/activity/reports/by-subcategory?from=${from}&to=${to}`);
      return r.json();
    },
  });

  const { data: sourceReport } = useQuery({
    queryKey: ["/api/activity/reports/by-source", from, to],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/activity/reports/by-source?from=${from}&to=${to}`);
      return r.json();
    },
  });

  const { data: relReport } = useQuery({
    queryKey: ["/api/activity/reports/by-relationship", from, to],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/activity/reports/by-relationship?from=${from}&to=${to}`);
      return r.json();
    },
  });

  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: nDaysAgo(1), to: nDaysAgo(1) },
    { label: "This week", from: nDaysAgo(6), to: today },
    { label: "Last 7 days", from: nDaysAgo(7), to: today },
    { label: "Last 30 days", from: nDaysAgo(30), to: today },
    { label: "Last 90 days", from: nDaysAgo(90), to: today },
  ];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Activity Reports</h1>

      {/* Date range picker */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              onClick={() => { setFrom(p.from); setTo(p.to); }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
          />
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/activity/export.csv?from=${from}&to=${to}`}
            className="text-sm text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Export CSV
          </a>
          <span className="text-muted-foreground">·</span>
          <a
            href={`/api/activity/export.md?from=${from}&to=${to}`}
            className="text-sm text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Export Markdown
          </a>
        </div>
      </div>

      {/* Category breakdown */}
      <ReportPanel title="By Category" rows={catReport ?? []} keyField="categoryName" minutesField="minutes" countField="count" />

      {/* Subcategory breakdown */}
      <ReportPanel title="By Subcategory" rows={subReport ?? []} keyField="subcategoryName" minutesField="minutes" countField="count" />

      {/* Source breakdown */}
      <ReportPanel title="By Source" rows={sourceReport ?? []} keyField="sourceKind" minutesField="minutes" countField="count" />

      {/* Relationship breakdown */}
      {relReport && relReport.length > 0 && (
        <ReportPanel title="By Relationship" rows={relReport} keyField="buoyRelationshipId" minutesField="minutes" countField="count" />
      )}
    </div>
  );
}

function ReportPanel({
  title,
  rows,
  keyField,
  minutesField,
  countField,
}: {
  title: string;
  rows: any[];
  keyField: string;
  minutesField: string;
  countField: string;
}) {
  const max = Math.max(...rows.map((r) => r[minutesField] ?? 0), 1);

  return (
    <div className="border rounded-lg p-4">
      <h2 className="text-base font-medium mb-3">{title}</h2>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data for this period.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex justify-between text-sm">
                <span>{row[keyField] ?? "—"}</span>
                <span className="text-muted-foreground">
                  {fmtMinutes(row[minutesField])} · {row[countField]} entries
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.round((row[minutesField] / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
