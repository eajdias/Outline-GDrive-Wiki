import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/infra/config.js";

const BASE_ENV = {
  ANYTHINGLLM_API_URL: "http://anythingllm:3001/",
  ANYTHINGLLM_API_KEY: "key",
  ANYTHINGLLM_WORKSPACE: "kb-wiki",
} satisfies NodeJS.ProcessEnv;

test("loads required values and applies defaults", () => {
  const config = loadConfig({ ...BASE_ENV });

  assert.equal(config.anythingllm.baseUrl, "http://anythingllm:3001");
  assert.equal(config.server.port, 8080);
  assert.equal(config.server.requestBodyLimitBytes, 8192);
  assert.equal(config.server.rateLimitMax, 10);
  assert.equal(config.server.maxQuestionChars, 1000);
  assert.deepEqual(config.anythingllm.workspaces, ["kb-wiki"]);
  assert.equal(config.anythingllm.timeoutMs, 60_000);
  assert.equal(config.anythingllm.minScore, 0.65);
  assert.equal(config.server.allowEmbed, false);
  assert.equal(config.outline.authUrl, "http://outline:3000");
  assert.equal(config.logLevel, "info");
});

test("reports every missing variable by name without values", () => {
  assert.throws(
    () => loadConfig({ ANYTHINGLLM_API_URL: BASE_ENV.ANYTHINGLLM_API_URL }),
    /ANYTHINGLLM_API_KEY/,
  );
});

test("rejects invalid numeric values", () => {
  assert.throws(() => loadConfig({ ...BASE_ENV, CHAT_PORT: "abc" }), /CHAT_PORT/);
  assert.throws(() => loadConfig({ ...BASE_ENV, CHAT_MIN_SCORE: "1.5" }), /CHAT_MIN_SCORE/);
  assert.throws(() => loadConfig({ ...BASE_ENV, CHAT_ALLOW_EMBED: "maybe" }), /CHAT_ALLOW_EMBED/);
  assert.throws(() => loadConfig({ ...BASE_ENV, LOG_LEVEL: "trace" }), /LOG_LEVEL/);
});

test("accepts a comma-separated workspace list", () => {
  const config = loadConfig({ ...BASE_ENV, ANYTHINGLLM_WORKSPACES: "kb-wiki, kb-drive" });
  assert.deepEqual(config.anythingllm.workspaces, ["kb-wiki", "kb-drive"]);
});

test("enables embed framing with the flag", () => {
  assert.equal(loadConfig({ ...BASE_ENV, CHAT_ALLOW_EMBED: "1" }).server.allowEmbed, true);
});

test("accepts an internal Outline auth URL", () => {
  assert.equal(
    loadConfig({ ...BASE_ENV, OUTLINE_AUTH_URL: "http://internal-outline:3000/" }).outline.authUrl,
    "http://internal-outline:3000",
  );
});
