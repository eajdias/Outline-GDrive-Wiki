import { KeyRing, type RingStatus } from "../domain/key-ring.js";
import { shapeBody, type RequestKind } from "../domain/request-shaping.js";
import type { UpstreamReply, UpstreamSender } from "../ports/upstream.js";

export interface UpstreamConfig {
  name: string;
  baseUrl: string;
  apiKeys: string[];
  model: string | null;
  embeddingModel: string | null;
}

export interface ProxyOptions {
  keyCooldownMs: number;
  embeddingDimensions: number | null;
}

export interface ProxyResult {
  reply: UpstreamReply;
  upstream: string;
  keyIndex: number;
}

export interface ProxyStatus {
  name: string;
  keys: RingStatus;
}

function reply(status: number, error: string): UpstreamReply {
  return {
    status,
    contentType: "application/json",
    retryAfterSeconds: null,
    text: JSON.stringify({ error }),
    stream: null,
  };
}

export class Proxy {
  private readonly rings: KeyRing[];

  constructor(
    private readonly upstreams: UpstreamConfig[],
    private readonly send: UpstreamSender,
    private readonly options: ProxyOptions,
  ) {
    this.rings = upstreams.map((upstream) => new KeyRing(upstream.apiKeys));
  }

  async handle(kind: RequestKind, rawBody: string, now = Date.now()): Promise<ProxyResult> {
    let quotaReply: UpstreamReply | null = null;

    for (const [position, upstream] of this.upstreams.entries()) {
      const shaped = shapeBody(kind, rawBody, {
        model: upstream.model,
        embeddingModel: upstream.embeddingModel,
        embeddingDimensions: kind === "embeddings" ? this.options.embeddingDimensions : null,
      });
      if (!shaped.ok) return { reply: reply(400, "invalid_json_body"), upstream: upstream.name, keyIndex: -1 };

      const ring = this.rings[position];
      if (!ring) continue;

      for (const { apiKey, index } of ring.available(now)) {
        const result = await this.send(
          { name: upstream.name, baseUrl: upstream.baseUrl, apiKey },
          { kind, body: shaped.body },
        );

        if (result.status !== 429) return { reply: result, upstream: upstream.name, keyIndex: index };

        ring.markCooling(index, now + this.options.keyCooldownMs);
        quotaReply = result;
      }
    }

    return {
      reply: quotaReply ?? reply(429, "quota_exhausted"),
      upstream: "none",
      keyIndex: -1,
    };
  }

  status(now = Date.now()): ProxyStatus[] {
    return this.upstreams.map((upstream, index) => ({
      name: upstream.name,
      keys: this.rings[index]?.status(now) ?? { total: 0, cooling: 0, nextRetryMs: 0 },
    }));
  }
}
