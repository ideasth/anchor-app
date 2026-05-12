// Stage 16 (2026-05-12) — Clarification banner shown when the server
// returns needsClarification: true.

interface Props {
  missing: string[];
}

const FIELD_LABELS: Record<string, string> = {
  duration: "duration (e.g. '45 minutes' or '1 hour')",
  dates: "dates or days (e.g. 'next Tuesday' or 'this Friday')",
  sources: "at least one calendar to search against",
  prompt_or_parsed: "a prompt or parsed payload",
};

export function ClarificationBanner({ missing }: Props) {
  if (missing.length === 0) return null;

  return (
    <div
      role="alert"
      data-testid="clarification-banner"
      className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 text-sm space-y-1"
    >
      <p className="font-medium text-amber-800 dark:text-amber-300">
        A few details are needed to search:
      </p>
      <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
        {missing.map((field) => (
          <li key={field} data-testid={`missing-${field}`}>
            Please specify the {FIELD_LABELS[field] ?? field}.
          </li>
        ))}
      </ul>
    </div>
  );
}
