import assert from "node:assert/strict";
import { test } from "node:test";
import type { UpstreamReply, UpstreamTarget } from "../src/ports/upstream.js";
import { Proxy, type UpstreamConfig } from "../src/usecases/proxy.js";

const upstream = (name: string, baseUrl: string, apiKeys: string[]): UpstreamConfig => ({
  name,
  baseUrl,
  apiKeys,
  model: null,
  embeddingModel: null,
});

function ok(body = '{"done":true}'): UpstreamReply {
  return { status: 200, contentType: "application/json", retryAfterSeconds: null, text: body, stream: null };
}

function quota(): UpstreamReply {
  return {
    status: 429,
    contentType: "application/json",
    retryAfterSeconds: "30",
    text: '{"error":"quota"}',
    stream: null,
  };
}

test("returns the first successful answer without touching the fallback keys", async () => {
  const used: UpstreamTarget[] = [];
  const proxy = new Proxy([upstream("gemini", "https://a.test", ["k1", "k2"])], async (target) => {
    used.push(target);
    return ok();
  }, { keyCooldownMs: 60_000, embeddingDimensions: null });

  const result = await proxy.handle("chat", '{"messages":[]}');
  assert.equal(result.reply.status, 200);
  assert.equal(result.keyIndex, 0);
  assert.deepEqual(used.map((target) => target.apiKey), ["k1"]);
});

test("rotates to the next key on quota and remembers the cooldown", async () => {
  const used: UpstreamTarget[] = [];
  const proxy = new Proxy([upstream("gemini", "https://a.test", ["k1", "k2"])], async (target) => {
    used.push(target);
    return target.apiKey === "k1" ? quota() : ok();
  }, { keyCooldownMs: 60_000, embeddingDimensions: null });

  const first = await proxy.handle("chat", '{"messages":[]}', 1_000);
  assert.equal(first.keyIndex, 1);
  assert.deepEqual(used.map((target) => target.apiKey), ["k1", "k2"]);

  used.length = 0;
  await proxy.handle("chat", '{"messages":[]}', 2_000);
  assert.deepEqual(used.map((target) => target.apiKey), ["k2"]);
});

test("falls through to the next provider when every key of the first is exhausted", async () => {
  const used: UpstreamTarget[] = [];
  const proxy = new Proxy(
    [upstream("gemini", "https://a.test", ["k1"]), upstream("generic", "https://b.test", ["g1"])],
    async (target) => {
      used.push(target);
      return target.name === "gemini" ? quota() : ok();
    },
    { keyCooldownMs: 60_000, embeddingDimensions: null },
  );

  const result = await proxy.handle("chat", '{"messages":[]}');
  assert.equal(result.upstream, "generic");
  assert.deepEqual(used.map((target) => target.name), ["gemini", "generic"]);
});

test("answers 429 when every key and provider is exhausted", async () => {
  const proxy = new Proxy(
    [upstream("gemini", "https://a.test", ["k1"]), upstream("generic", "https://b.test", ["g1"])],
    async () => quota(),
    { keyCooldownMs: 60_000, embeddingDimensions: null },
  );

  const result = await proxy.handle("chat", '{"messages":[]}');
  assert.equal(result.reply.status, 429);
  assert.equal(result.reply.retryAfterSeconds, "30");
  assert.equal(result.upstream, "none");
});

test("injects the embedding dimensions and the configured model without breaking chat bodies", async () => {
  const bodies: string[] = [];
  const proxy = new Proxy(
    [{ ...upstream("gemini", "https://a.test", ["k1"]), embeddingModel: "embed-1", model: "chat-1" }],
    async (_target, request) => {
      bodies.push(request.body);
      return ok();
    },
    { keyCooldownMs: 60_000, embeddingDimensions: 2048 },
  );

  await proxy.handle("embeddings", '{"input":"texto"}');
  await proxy.handle("chat", '{"messages":[]}');

  assert.deepEqual(JSON.parse(bodies[0] ?? "{}"), { input: "texto", model: "embed-1", dimensions: 2048 });
  assert.deepEqual(JSON.parse(bodies[1] ?? "{}"), { messages: [], model: "chat-1" });
});

test("rejects a body that is not JSON instead of forwarding it", async () => {
  const proxy = new Proxy([upstream("gemini", "https://a.test", ["k1"])], async () => ok(), {
    keyCooldownMs: 60_000,
    embeddingDimensions: 2048,
  });

  const result = await proxy.handle("embeddings", "not json");
  assert.equal(result.reply.status, 400);
  assert.match(result.reply.text ?? "", /invalid_json_body/);
});
