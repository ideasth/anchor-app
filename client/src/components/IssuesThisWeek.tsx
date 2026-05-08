// IssuesThisWeek — Review page summary of issues, grouped by status.
//
// Pulls /api/issues/this-week which returns thisWeek (created Mon-Sun) plus
// carriedOver (open/ongoing issues created before Monday). Each row exposes
// the same status toggle as elsewhere so users can mark Ongoing or Resolved
// straight from Review.

import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@shared/schema";
import { IssueRow } from "./IssueRow";

interface ThisWeekResponse {
  mondayYmd: string;
  sundayYmd: string;
  thisWeek: Issue[];
  carriedOver: Issue[];
}

export function IssuesThisWeek() {
  const q = useQuery<ThisWeekResponse>({
    queryKey: ["/api/issues/this-week"],
    queryFn: async () => {
      const r = await fetch("/api/issues/this-week", { credentials: "include" });
      return r.json();
    },
  });

  if (q.isLoading || !q.data) {
    return <div className="text-sm text-muted-foreground italic">Loading…</div>;
  }
  const { thisWeek, carriedOver, mondayYmd, sundayYmd } = q.data;
  const all = [...carriedOver, ...thisWeek];
  if (all.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic rounded-lg border border-dashed p-4">
        No issues logged this week ({mondayYmd} → {sundayYmd}).
      </div>
    );
  }

  const open = all.filter((i) => i.status === "open");
  const ongoing = all.filter((i) => i.status === "ongoing");
  const resolved = all.filter((i) => i.status === "resolved");

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        Week of {mondayYmd} → {sundayYmd}. Carried-over open or ongoing issues from
        previous weeks are shown alongside this week's entries.
      </div>
      <Group title="Open" count={open.length} items={open} />
      <Group title="Ongoing" count={ongoing.length} items={ongoing} />
      <Group title="Resolved" count={resolved.length} items={resolved} />
    </div>
  );
}

function Group({ title, count, items }: { title: string; count: number; items: Issue[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {title} · {count}
      </div>
      <div className="space-y-2">
        {items.map((i) => (
          <IssueRow key={i.id} issue={i} />
        ))}
      </div>
    </div>
  );
}
