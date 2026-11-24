import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import type { Config } from "../src/infra/config.js";
import type { Runtime } from "../src/infra/context.js";
import { MemoryRateLimiter } from "../src/infra/rate-limit.js";
import { createChatServer } from "../src/infra/server.js";
import type { ChatAnswer, ChatClient } from "../src/ports/chat.js";
import type { Logger } from "@repo/logger";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

class StubChat implements ChatClient {
  async chat(): Promise<ChatAnswer> {
    return { text: "ok", sources: [] };
  }
}

const servers: ReturnType<typeof createChatServer>[] = [];

async function start(rateLimitMax: number): Promise<string> {
  const config: Config = {
    server: {
      port: 0,
      host: "127.0.0.1",
      requestBodyLimitBytes: 8192,
      rateLimitMax,
      rateLimitWindowMs: 60_000,
      maxQuestionChars: 1000,
      allowEmbed: false,
    },
    anythingllm: {
      baseUrl: "http://anythingllm.test",
      apiKey: "key",
      workspaces: ["kb-drive"],
      timeoutMs: 5000,
      minScore: 0.65,
    },
    redis: { url: null },
    logLevel: "error",
  };

  const runtime: Runtime = {
    config,
    logger: silentLogger,
    chat: new StubChat(),
    limiter: new MemoryRateLimiter(rateLimitMax, config.server.rateLimitWindowMs),
    close: async () => {},
  };

  const server = createChatServer(runtime);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function ask(base: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question: "como configurar o evo?" }),
  });
}

after(() => {
  for (const server of servers) server.close();
});

test("spoofing the first hops of X-Forwarded-For does not bypass the rate limit", async () => {
  const base = await start(1);

  assert.equal((await ask(base, { "x-forwarded-for": "10.9.9.9, 198.51.100.1" })).status, 200);
  assert.equal((await ask(base, { "x-forwarded-for": "172.16.0.1, 198.51.100.1" })).status, 429);
  assert.equal((await ask(base, { "x-forwarded-for": "192.0.2.9, 198.51.100.2" })).status, 200);
});

test("trusts the address the edge overwrote in X-Real-IP", async () => {
  const base = await start(1);

  assert.equal((await ask(base, { "x-real-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" })).status, 200);
  assert.equal((await ask(base, { "x-real-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.2" })).status, 429);
  assert.equal((await ask(base, { "x-real-ip": "203.0.113.8" })).status, 200);
});
