// IssueRow — single issue with status toggle, support indicator, delete.

import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { Issue } from "@shared/schema";
import {
  categoryMeta,
  ISSUE_STATUSES,
  supportTypeMeta,
  type IssueStatus,
} from "@/lib/factors";

interface Props {
  issue: Issue;
  showDate?: boolean;
  compact?: boolean;
}

export function IssueRow({ issue, showDate = true, compact = false }: Props) {
  const cat = categoryMeta(issue.category);
  const support = supportTypeMeta(issue.supportType);

  const setStatus = async (next: IssueStatus) => {
    await apiRequest("PATCH", `/api/issues/${issue.id}`, { status: next });
    queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
    queryClient.invalidateQueries({ queryKey: ["/api/issues/this-week"] });
  };

  const remove = async () => {
    if (!confirm("Delete this issue?")) return;
    await apiRequest("DELETE", `/api/issues/${issue.id}`);
    queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
    queryClient.invalidateQueries({ queryKey: ["/api/issues/this-week"] });
  };

  return (
    <div
      className={cn(
        "rounded-md border border-card-border bg-card p-3",
        compact && "p-2",
        issue.status === "resolved" && "opacity-60",
      )}
      data-testid={`issue-row-${issue.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-lg leading-none pt-0.5" aria-hidden="true">
          {cat.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <div className="text-sm font-medium">{cat.label}</div>
            {showDate && (
              <div className="text-xs text-muted-foreground">
                {issue.createdYmd}
                {issue.resolvedYmd && issue.status === "resolved" && (
                  <> → resolved {issue.resolvedYmd}</>
                )}
              </div>
            )}
          </div>
          {issue.note && (
            <div className="text-sm text-muted-foreground mt-0.5 break-words">
              {issue.note}
            </div>
          )}
          {issue.needSupport === 1 && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
              <span aria-hidden="true">{support?.icon ?? "🤝"}</span>
              <span>Needs {support?.label ?? "support"}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex gap-1" role="group" aria-label="Issue status">
            {ISSUE_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatus(s.value)}
                aria-pressed={issue.status === s.value}
                data-testid={`issue-${issue.id}-status-${s.value}`}
                className={cn(
                  "rounded border px-2 py-0.5 text-[11px] transition-colors hover-elevate active-elevate-2",
                  issue.status === s.value
                    ? statusActiveClass(s.value)
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={remove}
            aria-label="Delete issue"
            data-testid={`issue-${issue.id}-delete`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function statusActiveClass(s: IssueStatus): string {
  switch (s) {
    case "open":
      return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-medium";
    case "ongoing":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium";
    case "resolved":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium";
  }
}
