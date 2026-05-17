// client/src/pages/Activity/Search.tsx
// Full-text search with «…» snippet rendering.

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function SnippetText({ text }: { text: string }) {
  // Replace «…» markers with <mark> highlights.
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("«") && part.endsWith("»") ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
            {part.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

export default function ActivitySearch() {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results, isFetching } = useQuery({
    queryKey: ["/api/activity/search", submitted],
    queryFn: async () => {
      if (!submitted) return [];
      const r = await apiRequest("GET", `/api/activity/search?q=${encodeURIComponent(submitted)}`);
      return r.json();
    },
    enabled: submitted.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(q.trim());
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Search Activity</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, notes, tags…"
          className="flex-1 border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" disabled={!q.trim()}>Search</Button>
      </form>

      {isFetching && <div className="text-sm text-muted-foreground">Searching…</div>}

      {results && results.length === 0 && submitted && !isFetching && (
        <div className="text-sm text-muted-foreground">No results for "{submitted}".</div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((hit: any) => (
            <div key={hit.id} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{hit.title}</div>
                <div className="flex gap-1 flex-shrink-0">
                  <Badge variant="secondary" className="text-xs">{hit.status}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {hit.entryDate}
                {hit.durationMinutes ? ` · ${Math.floor(hit.durationMinutes / 60)}h ${hit.durationMinutes % 60}m` : ""}
              </div>
              {hit.snippet && (
                <div className="text-sm mt-1 text-muted-foreground">
                  <SnippetText text={hit.snippet} />
                </div>
              )}
              {hit.sourceLink && (
                <div className="mt-1">
                  <a
                    href={hit.sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open source
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
