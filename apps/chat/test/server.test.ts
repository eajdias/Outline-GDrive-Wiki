import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import type { RawSource } from "../src/domain/citations.js";
import type { Config } from "../src/infra/config.js";
import type { Runtime } from "../src/infra/context.js";
import type { Logger } from "@repo/logger";
import { createChatServer } from "../src/infra/server.js";
import { MemoryRateLimiter } from "../src/infra/rate-limit.js";
import type { ChatAnswer, ChatClient } from "../src/ports/chat.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function config(overrides: Partial<Config["server"]> = {}): Config {
  return {
    server: {
      port: 0,
      host: "127.0.0.1",
      requestBodyLimitBytes: 8192,
      rateLimitMax: 10,
      rateLimitWindowMs: 60_000,
      maxQuestionChars: 1000,
      allowEmbed: false,
      ...overrides,
    },
    anythingllm: {
      baseUrl: "http://anythingllm.test",
      apiKey: "key",
      workspaces: ["kb-wiki", "kb-drive"],
      timeoutMs: 5000,
      minScore: 0.65,
    },
    redis: {
      url: null,
    },
    logLevel: "error",
  };
}

function source(score: number): RawSource {
  return {
    title: "doc.txt",
    description: "Documento certo",
    url: "web://https://wiki.example.test/doc/doc.website",
    score,
    text: "trecho relevante",
  };
}

class StubChat implements ChatClient {
  readonly questions: string[] = [];
  constructor(private readonly answer: ChatAnswer | Error) {}

  async chat(_workspace: string, question: string): Promise<ChatAnswer> {
    this.questions.push(question);
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
}

const servers: ReturnType<typeof createChatServer>[] = [];

async function start(chat: ChatClient, serverConfig: Partial<Config["server"]> = {}): Promise<string> {
  const cfg = config(serverConfig);
  const runtime: Runtime = {
    config: cfg,
    logger: silentLogger,
    chat,
    limiter: new MemoryRateLimiter(cfg.server.rateLimitMax, cfg.server.rateLimitWindowMs),
    close: async () => {},
  };
  const server = createChatServer(runtime);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function post(base: string, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

after(() => {
  for (const server of servers) server.close();
});

test("answers with text and citations when the score passes the threshold", async () => {
  const base = await start(new StubChat({ text: "Resposta.", sources: [source(0.8)] }));

  const response = await post(base, JSON.stringify({ question: "Como configurar o Evo?" }));
  const payload = (await response.json()) as { answer: string; notFound: boolean; sources: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(payload.answer, "Resposta.");
  assert.equal(payload.notFound, false);
  assert.equal(payload.sources.length, 1);
});

test("returns an explicit not found when every source is below the threshold", async () => {
  const chat = new StubChat({ text: "Não sei.", sources: [source(0.4)] });
  const base = await start(chat);

  const response = await post(base, JSON.stringify({ question: "Qual a capital da França?" }));
  const payload = (await response.json()) as { notFound: boolean; answer: string; sources: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(payload.notFound, true);
  assert.equal(payload.answer, "");
  assert.deepEqual(payload.sources, []);
});

test("rejects invalid JSON, missing question and out-of-range questions with 400", async () => {
  const chat = new StubChat({ text: "x", sources: [source(0.9)] });
  const base = await start(chat);

  assert.equal((await post(base, "{")).status, 400);
  assert.equal((await post(base, JSON.stringify({ question: 42 }))).status, 400);
  assert.equal((await post(base, JSON.stringify({ question: "oi" }))).status, 400);
  assert.equal((await post(base, JSON.stringify({ question: "x".repeat(1001) }))).status, 400);
  assert.equal(chat.questions.length, 0);
});

test("rejects bodies above the configured limit with 413", async () => {
  const base = await start(new StubChat({ text: "x", sources: [source(0.9)] }), {
    requestBodyLimitBytes: 64,
  });

  const response = await post(base, JSON.stringify({ question: "x".repeat(200) }));
  assert.equal(response.status, 413);
});

test("rate limits a single IP with Retry-After", async () => {
  const base = await start(new StubChat({ text: "x", sources: [source(0.9)] }), {
    rateLimitMax: 2,
  });

  assert.equal((await post(base, JSON.stringify({ question: "primeira pergunta" }))).status, 200);
  assert.equal((await post(base, JSON.stringify({ question: "segunda pergunta" }))).status, 200);

  const blocked = await post(base, JSON.stringify({ question: "terceira pergunta" }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
});

test("serves health, static assets and the expected 404/405", async () => {
  const base = await start(new StubChat({ text: "x", sources: [source(0.9)] }));

  const health = await fetch(`${base}/healthz`);
  assert.equal(health.status, 200);

  const widget = await fetch(`${base}/widget.js`);
  assert.equal(widget.status, 200);
  assert.match(widget.headers.get("content-type") ?? "", /javascript/);
  assert.match(await widget.text(), /kb-chat-bubble/);

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /Base de conhecimento/);

  const render = await fetch(`${base}/render.js`);
  assert.equal(render.status, 200);
  assert.match(render.headers.get("content-type") ?? "", /javascript/);

  const wrapper = await fetch(`${base}/ask`);
  assert.equal(wrapper.status, 405);

  const missing = await fetch(`${base}/api/v1/workspace`);
  assert.equal(missing.status, 404);
});

test("denies framing by default, including embed mode", async () => {
  const chat = new StubChat({ text: "x", sources: [source(0.9)] });
  const base = await start(chat);

  for (const path of ["/", "/?embed=1"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  }
});

test("allows framing of embed mode only when the flag is on", async () => {
  const chat = new StubChat({ text: "x", sources: [source(0.9)] });
  const base = await start(chat, { allowEmbed: true });

  const embedded = await fetch(`${base}/?embed=1`);
  assert.equal(embedded.status, 200);
  assert.equal(embedded.headers.get("x-frame-options"), null);
  assert.match(embedded.headers.get("content-security-policy") ?? "", /frame-ancestors \*/);

  const full = await fetch(`${base}/`);
  assert.equal(full.headers.get("x-frame-options"), "DENY");
});
