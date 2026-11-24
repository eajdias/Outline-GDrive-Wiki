import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryRateLimiter, RedisRateLimiter } from "../src/infra/rate-limit.js";
import type { Logger } from "@repo/logger";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

test("memory limiter allows up to max per window then blocks with retry-after", async () => {
  const limiter = new MemoryRateLimiter(2, 60_000);
  assert.equal((await limiter.take("ip-1")).allowed, true);
  assert.equal((await limiter.take("ip-1")).allowed, true);
  const blocked = await limiter.take("ip-1");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("memory limiter tracks keys independently", async () => {
  const limiter = new MemoryRateLimiter(1, 60_000);
  assert.equal((await limiter.take("a")).allowed, true);
  assert.equal((await limiter.take("b")).allowed, true);
  assert.equal((await limiter.take("a")).allowed, false);
});

test("redis limiter allows and blocks via lua result", async () => {
  let calls = 0;
  const redis = {
    eval: async () => {
      calls += 1;
      return calls <= 2 ? [1, 0] : [0, 30_000];
    },
  };
  const limiter = new RedisRateLimiter(redis, 2, 60_000, "rl", silentLogger);

  assert.equal((await limiter.take("ip-1")).allowed, true);
  assert.equal((await limiter.take("ip-1")).allowed, true);
  const blocked = await limiter.take("ip-1");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 30);
});

test("redis limiter falls back to memory when redis fails", async () => {
  const redis = {
    eval: async (): Promise<unknown> => {
      throw new Error("redis down");
    },
  };
  const limiter = new RedisRateLimiter(redis, 1, 60_000, "rl", silentLogger);

  assert.equal((await limiter.take("ip-9")).allowed, true);
  assert.equal((await limiter.take("ip-9")).allowed, false);
});
