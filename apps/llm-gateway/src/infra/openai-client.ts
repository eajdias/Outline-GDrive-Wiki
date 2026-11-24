import type { Logger } from "@repo/logger";
import type { UpstreamReply, UpstreamRequest, UpstreamSender, UpstreamTarget } from "../ports/upstream.js";

const PATHS: Record<UpstreamRequest["kind"], string> = {
  chat: "/chat/completions",
  embeddings: "/embeddings",
};

async function* chunks(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function failure(status: number, error: string, retryAfterSeconds: string | null = null): UpstreamReply {
  return {
    status,
    contentType: "application/json",
    retryAfterSeconds,
    text: JSON.stringify({ error }),
    stream: null,
  };
}

export function createOpenAiSender(timeoutMs: number, logger: Logger): UpstreamSender {
  return async (target: UpstreamTarget, request: UpstreamRequest): Promise<UpstreamReply> => {
    const url = `${target.baseUrl}${PATHS[request.kind]}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${target.apiKey}`,
          "Content-Type": "application/json",
          Accept: request.kind === "chat" ? "text/event-stream, application/json" : "application/json",
        },
        body: request.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      logger.warn("upstream unreachable", { upstream: target.name, kind: request.kind, error });
      return failure(502, "upstream_unreachable");
    }

    const contentType = response.headers.get("content-type") ?? "application/json";
    const retryAfterSeconds = response.headers.get("retry-after");

    if (contentType.includes("text/event-stream") && response.body) {
      return {
        status: response.status,
        contentType,
        retryAfterSeconds,
        text: null,
        stream: chunks(response.body),
      };
    }

    return {
      status: response.status,
      contentType,
      retryAfterSeconds,
      text: await response.text(),
      stream: null,
    };
  };
}
