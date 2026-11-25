import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/infra/config.js";

test("prefers the plural key list when both are set", () => {
  const config = loadConfig({
    GEMINI_API_KEYS: "key-a,key-b",
    GEMINI_API_KEY: "legacy",
  });

  assert.deepEqual(config.upstreams[0]?.apiKeys, ["key-a", "key-b"]);
});

test("falls back to the singular key when the plural list is empty", () => {
  const config = loadConfig({
    GEMINI_API_KEYS: "",
    GEMINI_API_KEY: "legacy",
  });

  assert.deepEqual(config.upstreams[0]?.apiKeys, ["legacy"]);
});

test("rejects empty key lists from both variables", () => {
  assert.throws(
    () => loadConfig({ GEMINI_API_KEYS: " , ", GEMINI_API_KEY: "" }),
    /GEMINI_API_KEYS/,
  );
});
