// Stage 16 (2026-05-12) — Scheduling search route handler.
//
// Accepts POST /api/scheduling/search with either:
//   { prompt: string, sources?: string[] }   — LLM parse then search
//   { parsed: ParsedScheduling, sources?: string[] } — skip parse, search directly
//
// Returns on success:
//   { parsed: ParsedScheduling, candidates: CandidateSlot[] }
//
// Returns on clarification needed (200, not 4xx):
//   { needsClarification: true, missing: string[], parsed: Partial<ParsedScheduling> }
//
// Returns 400 for empty sources (before attempting parse/search):
//   { needsClarification: true, missing: ['sources'], parsed: {} }
//
// Returns 401 when auth fails (handled by the caller via requireUserOrOrchestrator).

import type { CalEvent } from "./ics";
import {
  generateParsed,
  SchedulingParseError,
  type ParsedScheduling,
} from "./scheduling-parser";
import { searchSlots, type CandidateSlot } from "./scheduling-search";

// ---- Types ------------------------------------------------------------------

export interface SchedulingStorageFacade {
  /** Return all known ICS feed URLs keyed by source key. */
  getOutlookEvents(): CalEvent[];
  getBuoyEvents(): CalEvent[];
  getIcsEvents(feedId: string): CalEvent[];
}

export type SchedulingSuccess = {
  needsClarification: false;
  parsed: ParsedScheduling;
  candidates: CandidateSlot[];
};

export type SchedulingClarification = {
  needsClarification: true;
  missing: string[];
  parsed: Partial<ParsedScheduling>;
};

export type SchedulingHandlerResult =
  | { status: 200; body: SchedulingSuccess | SchedulingClarification }
  | { status: 400; body: SchedulingClarification }
  | { status: 401; body: { error: string } }
  | { status: 502; body: { error: string } };

// ---- Clarification detection ------------------------------------------------

function detectMissing(parsed: ParsedScheduling): string[] {
  const missing: string[] = [];
  if (!parsed.durationMinutes) missing.push("duration");
  if (parsed.dateConstraints.length === 0) missing.push("dates");
  return missing;
}

// ---- Main handler -----------------------------------------------------------

export interface SchedulingHandlerInput {
  body: Record<string, unknown>;
  /** Resolved events for enabled sources. Caller fetches these. */
  events: CalEvent[];
}

export async function handleSchedulingSearch(
  input: SchedulingHandlerInput,
): Promise<SchedulingHandlerResult> {
  const { body, events } = input;

  // Source validation — checked first, before any LLM call.
  const rawSources = body.sources;
  const sources: string[] =
    Array.isArray(rawSources)
      ? rawSources.filter((s): s is string => typeof s === "string")
      : [];

  if (sources.length === 0) {
    return {
      status: 200,
      body: {
        needsClarification: true,
        missing: ["sources"],
        parsed: {},
      },
    };
  }

  // Determine parsed payload.
  let parsed: ParsedScheduling;

  if (body.parsed !== undefined) {
    // Client sent a pre-parsed payload (refinement path — no LLM call).
    const raw = body.parsed as Record<string, unknown>;

    // Basic coercion / shape normalisation (the client sends camelCase).
    parsed = {
      activity: typeof raw.activity === "string" ? raw.activity : "meeting",
      durationMinutes:
        typeof raw.durationMinutes === "number" && raw.durationMinutes > 0
          ? raw.durationMinutes
          : null,
      locationType:
        (raw.locationType as ParsedScheduling["locationType"]) ?? "unspecified",
      locationLabel:
        typeof raw.locationLabel === "string" ? raw.locationLabel : null,
      travelMinutesBefore:
        typeof raw.travelMinutesBefore === "number" ? raw.travelMinutesBefore : 0,
      travelMinutesAfter:
        typeof raw.travelMinutesAfter === "number" ? raw.travelMinutesAfter : 0,
      dateConstraints: Array.isArray(raw.dateConstraints)
        ? (raw.dateConstraints as ParsedScheduling["dateConstraints"])
        : [],
      timePreferences: Array.isArray(raw.timePreferences)
        ? (raw.timePreferences as ParsedScheduling["timePreferences"])
        : null,
    };
  } else if (typeof body.prompt === "string" && body.prompt.trim()) {
    // LLM parse path.
    try {
      parsed = await generateParsed(body.prompt.trim());
    } catch (err) {
      if (err instanceof SchedulingParseError) {
        return { status: 502, body: { error: err.message } };
      }
      return {
        status: 502,
        body: {
          error: `Parse failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  } else {
    return {
      status: 400,
      body: {
        needsClarification: true,
        missing: ["prompt_or_parsed"],
        parsed: {},
      },
    };
  }

  // Clarification check.
  const missing = detectMissing(parsed);
  if (missing.length > 0) {
    return {
      status: 200,
      body: {
        needsClarification: true,
        missing,
        parsed,
      },
    };
  }

  // Search.
  const result = searchSlots(parsed, events);

  return {
    status: 200,
    body: {
      needsClarification: false,
      parsed,
      candidates: result.candidates,
    },
  };
}
