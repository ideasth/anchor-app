// client/src/pages/Activity/SettingsActivity.tsx
// Activity settings — taxonomy management + coach toggle.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function SettingsActivity() {
  const { toast } = useToast();

  const { data: categories, refetch: refetchCats } = useQuery({
    queryKey: ["/api/activity/categories"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/activity/categories");
      return r.json();
    },
  });

  const { data: subcategories, refetch: refetchSubs } = useQuery({
    queryKey: ["/api/activity/subcategories"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/activity/subcategories");
      return r.json();
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/settings");
      return r.json();
    },
  });

  const { data: health } = useQuery({
    queryKey: ["/api/admin/health"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/admin/health");
      return r.json();
    },
  });

  const [newCatName, setNewCatName] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [newSubCatId, setNewSubCatId] = useState("");

  const addCatMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/activity/categories", { name: newCatName });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setNewCatName("");
      refetchCats();
      toast({ title: "Category created" });
    },
    onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
  });

  const addSubMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/activity/subcategories", { name: newSubName, category_id: Number(newSubCatId) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      setNewSubName("");
      refetchSubs();
      toast({ title: "Subcategory created" });
    },
    onError: (err) => toast({ title: "Error", description: String(err), variant: "destructive" }),
  });

  const activitySummaryEnabled = settings?.coachIncludeActivitySummary === "true" || settings?.["coach.include_activity_summary"] === "true";

  const lastReceipt = health?.backups?.lastReceipt;
  const filesJson: string = lastReceipt?.filesJson ?? "[]";
  let fileList: string[] = [];
  try { fileList = JSON.parse(filesJson); } catch { fileList = []; }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-semibold">Activity Settings</h1>

      {/* DB info */}
      {lastReceipt && (
        <div className="border rounded-lg p-4 bg-muted/50 text-sm space-y-1">
          <div className="font-medium">Last backup</div>
          <div className="text-muted-foreground">
            {new Date(lastReceipt.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}
            {lastReceipt.sizeBytes ? ` · ${Math.round(lastReceipt.sizeBytes / 1024)}KB` : ""}
          </div>
          {fileList.length > 0 && (
            <div className="text-muted-foreground">
              Files: {fileList.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Coach toggle */}
      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-medium">Coach activity summary</div>
        <div className="text-sm text-muted-foreground">
          When enabled, the Coach prompt includes a summary of time spent by category this week.
          Currently: <strong>{activitySummaryEnabled ? "On" : "Off"}</strong>.
        </div>
        <div className="text-xs text-muted-foreground">
          This is managed from <a href="/settings" className="underline">Settings → Coach</a>.
        </div>
      </div>

      {/* Categories */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-medium">Categories</div>
        <div className="divide-y">
          {categories?.map((c: any) => (
            <div key={c.id} className="py-1.5 text-sm">{c.name}</div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New category name"
            className="flex-1 border rounded px-2 py-1 text-sm bg-background"
          />
          <Button size="sm" onClick={() => addCatMut.mutate()} disabled={!newCatName.trim() || addCatMut.isPending}>
            Add
          </Button>
        </div>
      </div>

      {/* Subcategories */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-medium">Subcategories</div>
        <div className="divide-y">
          {subcategories?.map((s: any) => (
            <div key={s.id} className="py-1.5 text-sm">
              {s.name}
              <span className="text-xs text-muted-foreground ml-2">
                (cat #{s.categoryId})
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap mt-2">
          <select
            value={newSubCatId}
            onChange={(e) => setNewSubCatId(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
          >
            <option value="">Category…</option>
            {categories?.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            placeholder="New subcategory name"
            className="flex-1 border rounded px-2 py-1 text-sm bg-background min-w-[140px]"
          />
          <Button size="sm" onClick={() => addSubMut.mutate()} disabled={!newSubName.trim() || !newSubCatId || addSubMut.isPending}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
