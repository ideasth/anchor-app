// IssueQuickAdd — compact form for logging a contextual life issue.
//
// Shown on Morning + Reflect pages and within the Issues page header. The
// form requires a category; everything else (note, support flag) is optional.

import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { todayDateStr } from "@/lib/anchor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ISSUE_CATEGORIES,
  SUPPORT_TYPES,
  type IssueCategory,
  type SupportType,
} from "@/lib/factors";

interface Props {
  sourcePage: "morning" | "reflect" | "issues";
  defaultDate?: string;
  compact?: boolean;
}

export function IssueQuickAdd({ sourcePage, defaultDate, compact = false }: Props) {
  const [category, setCategory] = useState<IssueCategory | null>(null);
  const [note, setNote] = useState("");
  const [needSupport, setNeedSupport] = useState(false);
  const [supportType, setSupportType] = useState<SupportType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCategory(null);
    setNote("");
    setNeedSupport(false);
    setSupportType(null);
  };

  const submit = async () => {
    if (!category) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/issues", {
        createdYmd: defaultDate ?? todayDateStr(),
        category,
        note: note.trim() || null,
        needSupport,
        supportType: needSupport ? supportType : null,
        status: "open",
        sourcePage,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues/this-week"] });
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn("space-y-3", compact && "space-y-2")} data-testid="issue-quick-add">
      <div className="flex flex-wrap gap-1.5">
        {ISSUE_CATEGORIES.map((c) => {
          const selected = category === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(selected ? null : c.value)}
              aria-pressed={selected}
              data-testid={`issue-category-${c.value}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover-elevate active-elevate-2",
                compact && "px-2 py-1 text-xs",
                selected
                  ? "border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <span aria-hidden="true">{c.icon}</span>
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>

      <Input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 200))}
        placeholder="Optional context — one line"
        data-testid="issue-note-input"
        className={cn(compact && "h-8 text-sm")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={needSupport}
            onChange={(e) => {
              setNeedSupport(e.target.checked);
              if (!e.target.checked) setSupportType(null);
            }}
            data-testid="issue-need-support"
          />
          <span>Need support</span>
        </label>
        {needSupport && (
          <div className="flex flex-wrap gap-1.5">
            {SUPPORT_TYPES.map((s) => {
              const selected = supportType === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSupportType(selected ? null : s.value)}
                  aria-pressed={selected}
                  data-testid={`issue-support-${s.value}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover-elevate active-elevate-2",
                    selected
                      ? "border-primary bg-primary/10 font-medium ring-1 ring-primary/40"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  <span aria-hidden="true">{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={submit}
          disabled={!category || submitting}
          data-testid="issue-quick-add-submit"
        >
          {submitting ? "Logging…" : "Log issue"}
        </Button>
      </div>
    </div>
  );
}
