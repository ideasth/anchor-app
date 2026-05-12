// Stage 16 (2026-05-12) — Find a time page.
//
// Standalone page at /#/find-time AND a compact dialog mode
// (triggered from the Calendar page header via compact={true}).
//
// One component, two mounts.

import { useCallback, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { SourceChips } from "@/components/find-time/SourceChips";
import { PromptInput } from "@/components/find-time/PromptInput";
import {
  ParsedInterpretation,
  type ParsedScheduling,
} from "@/components/find-time/ParsedInterpretation";
import { CandidateSlots, type CandidateSlot } from "@/components/find-time/CandidateSlots";
import { ClarificationBanner } from "@/components/find-time/ClarificationBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SearchSuccess {
  needsClarification: false;
  parsed: ParsedScheduling;
  candidates: CandidateSlot[];
}

interface SearchClarification {
  needsClarification: true;
  missing: string[];
  parsed: Partial<ParsedScheduling>;
}

type SearchResponse = SearchSuccess | SearchClarification;

interface Props {
  /** When true, hides the page title / outer card chrome for dialog use. */
  compact?: boolean;
}

export default function FindTime({ compact = false }: Props) {
  const [prompt, setPrompt] = useState("");
  const [sources, setSources] = useState<string[]>(["outlook", "buoy"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);

  // Stable reference so SourceChips onChange doesn't cause extra renders.
  const sourcesRef = useRef<string[]>(sources);
  const handleSourcesChange = useCallback((s: string[]) => {
    sourcesRef.current = s;
    setSources(s);
  }, []);

  async function submit(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/scheduling/search", {
        ...body,
        sources: sourcesRef.current,
      });
      const json = (await res.json()) as SearchResponse | { error: string };
      if ("error" in json) {
        setError(json.error);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function handlePromptSubmit() {
    if (!prompt.trim()) return;
    setResult(null);
    submit({ prompt });
  }

  function handleRefinement(updated: ParsedScheduling) {
    submit({ parsed: updated });
  }

  const content = (
    <div className="space-y-4">
      <SourceChips onChange={handleSourcesChange} />
      <PromptInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={handlePromptSubmit}
        loading={loading}
      />

      {error && (
        <p className="text-sm text-destructive" data-testid="search-error">
          {error}
        </p>
      )}

      {result?.needsClarification && (
        <ClarificationBanner missing={result.missing} />
      )}

      {result && !result.needsClarification && (
        <>
          <ParsedInterpretation
            parsed={result.parsed}
            onRefinement={handleRefinement}
          />
          <CandidateSlots candidates={result.candidates} />
        </>
      )}

      {result?.needsClarification && result.parsed && Object.keys(result.parsed).length > 0 && (
        <ParsedInterpretation
          parsed={result.parsed as ParsedScheduling}
          onRefinement={handleRefinement}
        />
      )}
    </div>
  );

  if (compact) {
    return <div className="p-4">{content}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle data-testid="find-time-title">Find a time</CardTitle>
        </CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    </div>
  );
}
