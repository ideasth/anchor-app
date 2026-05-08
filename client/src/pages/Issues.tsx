// Issues — full log of contextual life issues with filters.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Issue } from "@shared/schema";
import { IssueRow } from "@/components/IssueRow";
import { IssueQuickAdd } from "@/components/IssueQuickAdd";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  type IssueCategory,
  type IssueStatus,
} from "@/lib/factors";

export default function Issues() {
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | "all">("all");
  const [showAdd, setShowAdd] = useState(false);

  const q = useQuery<Issue[]>({
    queryKey: ["/api/issues", { status: statusFilter === "all" ? undefined : statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      const r = await apiRequest(
        "GET",
        qs ? `/api/issues?${qs}` : "/api/issues",
      );
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const allItems = Array.isArray(q.data) ? q.data : [];
  const items = allItems.filter((i) =>
    categoryFilter === "all" ? true : i.category === categoryFilter,
  );

  const counts = {
    open: allItems.filter((i) => i.status === "open").length,
    ongoing: allItems.filter((i) => i.status === "ongoing").length,
    resolved: allItems.filter((i) => i.status === "resolved").length,
  };

  return (
    <div className="px-5 md:px-8 py-8 md:py-10 max-w-3xl space-y-8">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Issues</div>
        <h1 className="text-2xl font-semibold">Contextual life issues log</h1>
        <p className="text-sm text-muted-foreground">
          Signals, not diagnoses. Log what's pressing, mark whether you need support,
          and track whether it stays open, becomes ongoing, or gets resolved.
        </p>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Add new</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
            data-testid="button-toggle-issue-add"
          >
            {showAdd ? "Hide" : "Show form"}
          </Button>
        </div>
        {showAdd && (
          <div className="rounded-lg border border-card-border bg-card p-4">
            <IssueQuickAdd sourcePage="issues" />
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
            Status
          </span>
          {(
            [
              { value: "all", label: `All (${(q.data ?? []).length})` },
              ...ISSUE_STATUSES.map((s) => ({
                value: s.value,
                label: `${s.label} (${counts[s.value]})`,
              })),
            ] as { value: IssueStatus | "all"; label: string }[]
          ).map((f) => (
            <FilterChip
              key={f.value}
              active={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
              testId={`filter-status-${f.value}`}
            >
              {f.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
            Category
          </span>
          <FilterChip
            active={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
            testId="filter-category-all"
          >
            All
          </FilterChip>
          {ISSUE_CATEGORIES.map((c) => (
            <FilterChip
              key={c.value}
              active={categoryFilter === c.value}
              onClick={() => setCategoryFilter(c.value)}
              testId={`filter-category-${c.value}`}
            >
              <span aria-hidden="true">{c.icon}</span> {c.label}
            </FilterChip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-3">Log</h2>
        {q.isLoading && (
          <div className="text-sm text-muted-foreground italic">Loading…</div>
        )}
        {!q.isLoading && items.length === 0 && (
          <div className="text-sm text-muted-foreground italic rounded-lg border border-dashed p-4">
            No issues match this filter.
          </div>
        )}
        <div className="space-y-2">
          {items.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors hover-elevate active-elevate-2",
        active
          ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
