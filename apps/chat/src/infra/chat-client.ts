import { ChatClientError } from "../domain/chat-failure.js";
import type { RawSource } from "../domain/citations.js";
import type { ChatAnswer, ChatClient } from "../ports/chat.js";
import type { Logger } from "@repo/logger";

interface ChatPayload {
  textResponse?: unknown;
  sources?: unknown;
  error?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourceFrom(value: unknown): RawSource | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    title: asString(record.title),
    description: asString(record.description),
    url: asString(record.url),
    score: asNumber(record.score),
    text: asString(record.text) ?? "",
  };
}

export class AnythingLLMClient implements ChatClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
    private readonly logger: Logger,
  ) {}

  async chat(workspace: string, question: string): Promise<ChatAnswer> {
    const url = `${this.baseUrl}/api/v1/workspace/${encodeURIComponent(workspace)}/chat`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: question, mode: "query" }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ChatClientError("timeout", `AnythingLLM did not answer within ${this.timeoutMs} ms`);
      }
      throw new ChatClientError("unavailable", `AnythingLLM is unreachable: ${String(error)}`);
    }

    if (response.status === 429) {
      throw new ChatClientError("rate_limit", "AnythingLLM rate limit reached", 429);
    }
    if (response.status === 503) {
      throw new ChatClientError("unavailable", "AnythingLLM is unavailable", 503);
    }
    if (!response.ok) {
      throw new ChatClientError("upstream", `AnythingLLM returned HTTP ${response.status}`, response.status);
    }

    let payload: ChatPayload;
    try {
      payload = (await response.json()) as ChatPayload;
    } catch {
      throw new ChatClientError("upstream", "AnythingLLM returned invalid JSON");
    }

    if (typeof payload.error === "string" && payload.error.length > 0) {
      throw new ChatClientError("upstream", `AnythingLLM returned an error: ${payload.error}`);
    }

    const text = asString(payload.textResponse);
    if (!text) {
      throw new ChatClientError("upstream", "AnythingLLM returned an empty textResponse");
    }

    const sources = Array.isArray(payload.sources)
      ? payload.sources.map(sourceFrom).filter((source): source is RawSource => source !== null)
      : [];

    this.logger.debug("anythingllm chat answered", { sources: sources.length, timeoutMs: this.timeoutMs });
    return { text, sources };
  }
}
