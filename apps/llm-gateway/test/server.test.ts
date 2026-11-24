import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import type { Logger } from "@repo/logger";
import type { GatewayConfig } from "../src/infra/config.js";
import type { Runtime } from "../src/infra/context.js";
import { createGatewayServer } from "../src/infra/server.js";
import type { UpstreamReply } from "../src/ports/upstream.js";
import { Proxy } from "../src/usecases/proxy.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function config(overrides: Partial<GatewayConfig["server"]> = {}): GatewayConfig {
  return {
    server: {
      port: 0,
      host: "127.0.0.1",
      bodyLimitBytes: 4096,
      timeoutMs: 5000,
      keyCooldownMs: 60_000,
      token: null,
      ...overrides,
    },
    embeddingDimensions: 2048,
    upstreams: [{ name: "gemini", baseUrl: "https://gemini.test", apiKeys: ["k1", "k2"], model: null, embeddingModel: null }],
    logLevel: "error",
  };
}

function json(status: number, body: unknown): UpstreamReply {
  return {
    status,
    contentType: "application/json",
    retryAfterSeconds: status === 429 ? "42" : null,
    text: JSON.stringify(body),
    stream: null,
  };
}

const servers: ReturnType<typeof createGatewayServer>[] = [];

async function start(cfg: GatewayConfig, statuses: number[]): Promise<string> {
  let call = 0;
  const proxy = new Proxy(cfg.upstreams, async () => {
    const status = statuses[Math.min(call, statuses.length - 1)] ?? 200;
    call += 1;
    return json(status, { status });
  }, { keyCooldownMs: cfg.server.keyCooldownMs, embeddingDimensions: cfg.embeddingDimensions });

  const runtime: Runtime = { config: cfg, logger: silentLogger, proxy };
  const server = createGatewayServer(runtime);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function post(base: string, path: string, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

after(() => {
  for (const server of servers) server.close();
});

test("forwards chat completions and only retries on quota", async () => {
  const base = await start(config(), [429, 200]);

  const response = await post(base, "/v1/chat/completions", '{"messages":[]}');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 200 });
});

test("propagates Retry-After when every key is exhausted", async () => {
  const base = await start(config(), [429]);

  const response = await post(base, "/v1/embeddings", '{"input":"texto"}');
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
});

test("requires the bearer token when one is configured", async () => {
  const base = await start(config({ token: "gateway-secret" }), [200]);

  const anonymous = await post(base, "/v1/chat/completions", '{"messages":[]}');
  assert.equal(anonymous.status, 401);

  const authorized = await post(base, "/v1/chat/completions", '{"messages":[]}', {
    Authorization: "Bearer gateway-secret",
  });
  assert.equal(authorized.status, 200);
});

test("rejects bodies above the limit and unknown routes", async () => {
  const base = await start(config({ bodyLimitBytes: 32 }), [200]);

  assert.equal((await post(base, "/v1/chat/completions", `{"messages":"${"x".repeat(64)}"}`)).status, 413);
  assert.equal((await post(base, "/v1/unknown", "{}")).status, 404);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});
