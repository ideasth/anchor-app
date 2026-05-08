// Feature 5 — Perplexity (Sonar) provider implementation.
//
// API docs: https://docs.perplexity.ai/api-reference/chat-completions
//
// Streaming: Sonar returns SSE with chat.completion.chunk objects whose
// choices[0].delta.content carries the incremental text.

import { BAKED_PERPLEXITY_KEY } from "../baked-llm-keys";
import type {
  CoachMessage,
  LLMAdapter,
  StreamRequest,
  StreamResult,
  TokenStream,
} from "./adapter";

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

function getApiKey(): string {
  return process.env.PERPLEXITY_API_KEY || BAKED_PERPLEXITY_KEY || "";
}

function buildBody(req: StreamRequest, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.4,
    max_tokens: req.maxTokens ?? 1200,
    stream,
  };
  if (req.disableSearch) {
    // Per Perplexity Sonar API: turn off the web search component so the model
    // answers from the supplied messages only. Without this, sonar-reasoning-pro
    // pulls in arbitrary web search results that drown out the context bundle.
    body.disable_search = true;
  }
  return body;
}

interface SonarChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  citations?: string[];
}

interface SonarFinal {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  citations?: string[];
}

/**
 * Stream-parse a Server-Sent Events response body.
 * Yields each parsed JSON event payload (lines beginning with "data: ").
 */
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SonarChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload) as SonarChunk;
      } catch {
        // ignore malformed
      }
    }
  }
}

class PerplexityAdapter implements LLMAdapter {
  readonly providerId = "perplexity";

  isAvailable(): boolean {
    return getApiKey().length > 0;
  }

  streamChat(req: StreamRequest): { stream: TokenStream; done: Promise<StreamResult> } {
    const key = getApiKey();
    if (!key) {
      const err = new Error("Perplexity API key is not configured.");
      const empty: TokenStream = (async function* () {
        throw err;
      })();
      return { stream: empty, done: Promise.reject(err) };
    }

    let resolveDone: (r: StreamResult) => void = () => undefined;
    let rejectDone: (e: unknown) => void = () => undefined;
    const done = new Promise<StreamResult>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });

    const stream: TokenStream = (async function* () {
      const resp = await fetch(PERPLEXITY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          // Some intermediaries gzip the upstream SSE which kills incremental delivery.
          "Accept-Encoding": "identity",
        },
        body: JSON.stringify(buildBody(req, true)),
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        const err = new Error(
          `Perplexity stream HTTP ${resp.status}: ${text.slice(0, 300)}`,
        );
        rejectDone(err);
        throw err;
      }
      let full = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let citations: string[] | undefined;
      let modelUsed = req.model;
      try {
        for await (const chunk of parseSSE(resp.body)) {
          if (chunk.model) modelUsed = chunk.model;
          if (chunk.citations) citations = chunk.citations;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield delta;
          }
          if (chunk.usage) {
            if (typeof chunk.usage.prompt_tokens === "number")
              inputTokens = chunk.usage.prompt_tokens;
            if (typeof chunk.usage.completion_tokens === "number")
              outputTokens = chunk.usage.completion_tokens;
          }
        }
        resolveDone({
          fullText: full,
          usage: { inputTokens, outputTokens },
          citations,
          modelUsed,
        });
      } catch (err) {
        rejectDone(err);
        throw err;
      }
    })();

    return { stream, done };
  }

  async complete(req: StreamRequest): Promise<StreamResult> {
    const key = getApiKey();
    if (!key) throw new Error("Perplexity API key is not configured.");
    const resp = await fetch(PERPLEXITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildBody(req, false)),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `Perplexity HTTP ${resp.status}: ${text.slice(0, 300)}`,
      );
    }
    const data = (await resp.json()) as SonarFinal;
    const fullText = data.choices?.[0]?.message?.content ?? "";
    return {
      fullText,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      citations: data.citations,
      modelUsed: data.model ?? req.model,
    };
  }
}

let _instance: PerplexityAdapter | null = null;
export function getPerplexityAdapter(): PerplexityAdapter {
  if (!_instance) _instance = new PerplexityAdapter();
  return _instance;
}

export type { CoachMessage };
