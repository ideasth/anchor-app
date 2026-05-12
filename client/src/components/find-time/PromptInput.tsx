// Stage 16 (2026-05-12) — Natural-language prompt input.

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled?: boolean;
}

export function PromptInput({ value, onChange, onSubmit, loading, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!loading && !disabled && value.trim()) onSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={ref}
        data-testid="prompt-input"
        placeholder='Describe what you need, e.g. "Find time for a 60-minute online meeting next Friday morning"'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        className="resize-none"
        disabled={loading || disabled}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          data-testid="prompt-submit"
          onClick={onSubmit}
          disabled={loading || disabled || !value.trim()}
        >
          {loading ? "Searching…" : "Find a time"}
        </Button>
      </div>
    </div>
  );
}
