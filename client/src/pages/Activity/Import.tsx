// client/src/pages/Activity/Import.tsx
// Paste-import page for [ACTIVITY LOG] blocks.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ImportResult {
  blockIndex: number;
  status: "created" | "updated" | "skipped" | "error";
  entryId?: number;
  errors: Array<{ line: number; field: string; message: string }>;
  warnings: string[];
}

interface ImportResponse {
  results: ImportResult[];
  created: (number | undefined)[];
  updated: (number | undefined)[];
  skippedCount: number;
  warnings: string[];
}

export default function ActivityImport() {
  const { toast } = useToast();
  const [block, setBlock] = useState("");
  const [autocreate, setAutocreate] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<ImportResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  const dryRunMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/activity/import?dry_run=1" + (autocreate ? "&autocreate=1" : ""), { block });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Dry run failed");
      return data as ImportResponse;
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      setImportResult(null);
    },
    onError: (err) => {
      toast({ title: "Dry run failed", description: String(err), variant: "destructive" });
    },
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/activity/import" + (autocreate ? "?autocreate=1" : ""), { block });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Import failed");
      return data as ImportResponse;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setDryRunResult(null);
      queryClient.invalidateQueries({ queryKey: ["/api/activity/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity/reports"] });
      toast({ title: `Imported: ${data.created.length} created, ${data.updated.length} updated` });
    },
    onError: (err) => {
      toast({ title: "Import failed", description: String(err), variant: "destructive" });
    },
  });

  const resultData = dryRunResult ?? importResult;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Import Activity Log</h1>

      <p className="text-sm text-muted-foreground">
        Paste one or more [ACTIVITY LOG] … [ACTIVITY LOG] blocks below. Use "Dry run" to preview
        what would be created/updated, then "Import" to commit.
      </p>

      <textarea
        value={block}
        onChange={(e) => setBlock(e.target.value)}
        placeholder={"[ACTIVITY LOG]\ndate: 2026-05-17\ntitle: My activity\ncategory: Work\nstatus: Complete\ndurationMinutes: 30\n[ACTIVITY LOG]"}
        rows={14}
        className="w-full border rounded-lg p-3 font-mono text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autocreate}
            onChange={(e) => setAutocreate(e.target.checked)}
            className="rounded"
          />
          Auto-create missing taxonomy
        </label>
        <Button
          variant="outline"
          onClick={() => dryRunMut.mutate()}
          disabled={!block.trim() || dryRunMut.isPending}
        >
          Dry run
        </Button>
        <Button
          onClick={() => importMut.mutate()}
          disabled={!block.trim() || importMut.isPending}
        >
          Import
        </Button>
      </div>

      {resultData && (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="text-sm font-medium">
            {dryRunResult ? "Dry run preview" : "Import result"}
            {" — "}
            {resultData.created.length} would be created / created,
            {" "}{resultData.updated.length} updated,
            {" "}{resultData.skippedCount} skipped
          </div>

          {resultData.warnings.length > 0 && (
            <div className="text-xs text-amber-600">
              {resultData.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {resultData.results.map((r, i) => (
            <div key={i} className={`text-sm rounded px-2 py-1 ${r.status === "error" ? "bg-red-50 dark:bg-red-950/30 text-red-600" : "bg-muted"}`}>
              <span className="font-mono">Block {i + 1}</span>: {r.status}
              {r.entryId ? ` (id=${r.entryId})` : ""}
              {r.errors.map((e, j) => (
                <div key={j} className="text-xs">
                  {e.field ? `${e.field}: ` : ""}{e.message}
                  {e.line > 0 ? ` (line ${e.line})` : ""}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
