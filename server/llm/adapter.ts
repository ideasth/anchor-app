// Feature 5 — LLM provider adapter interface.
//
// We currently support a single provider (Perplexity Sonar). This adapter
// abstraction means a future Anthropic adapter can plug in without touching
// the route layer.

export type CoachRole = "system" | "user" | "assistant";

export interface CoachMessage {
  role: CoachRole;
  content: string;
}

export interface StreamRequest {
  model: string;
  messages: CoachMessage[];
  /** 0..1, defaults to 0.4 — coaching is exploratory, not deterministic. */
  temperature?: number;
  /** Hard cap on response length. */
  maxTokens?: number;
  /**
   * If true, skip web search entirely (Sonar models). The coach is grounded in
   * the supplied context bundle, not the open web.
   */
  disableSearch?: boolean;
}

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StreamResult {
  fullText: string;
  usage: StreamUsage;
  /** Optional citations array returned by Sonar. */
  citations?: string[];
  modelUsed: string;
}

/** Async iterator yielding incremental text deltas. */
export type TokenStream = AsyncIterable<string>;

export interface LLMAdapter {
  /** Provider id, e.g. "perplexity" */
  readonly providerId: string;
  /** True if a key was baked/configured at boot. */
  isAvailable(): boolean;
  /**
   * Stream a chat completion. Yields incremental text deltas; the final value
   * (returned by `done`) carries the full text plus usage.
   */
  streamChat(req: StreamRequest): {
    stream: TokenStream;
    done: Promise<StreamResult>;
  };
  /** Non-streaming generation, used for summary creation. */
  complete(req: StreamRequest): Promise<StreamResult>;
}
