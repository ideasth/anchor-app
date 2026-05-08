// IssueList — render a list of issues with optional empty/loading state.

import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@shared/schema";
import { IssueRow } from "./IssueRow";

interface Props {
  status?: "open" | "ongoing" | "resolved";
  from?: string;
  to?: string;
  emptyText?: string;
  showDate?: boolean;
  compact?: boolean;
}

export function IssueList({ status, from, to, emptyText, showDate, compact }: Props) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const url = qs ? `/api/issues?${qs}` : "/api/issues";

  const q = useQuery<Issue[]>({
    queryKey: ["/api/issues", { status, from, to }],
    queryFn: async () => {
      const r = await fetch(url, { credentials: "include" });
      return r.json();
    },
  });

  if (q.isLoading) {
    return <div className="text-sm text-muted-foreground italic">Loading…</div>;
  }
  const items = q.data ?? [];
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic rounded-lg border border-dashed p-4">
        {emptyText ?? "No issues logged."}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <IssueRow key={i.id} issue={i} showDate={showDate} compact={compact} />
      ))}
    </div>
  );
}
