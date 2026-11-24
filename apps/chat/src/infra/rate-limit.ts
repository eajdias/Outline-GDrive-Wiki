import type { Logger } from "@repo/logger";

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  take(key: string): Promise<RateLimitDecision>;
}

interface RedisLike {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

const WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
if current > tonumber(ARGV[1]) then
  local ttl = redis.call('PTTL', KEYS[1])
  return {0, ttl}
end
return {1, 0}
`;

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  async take(key: string, now = Date.now()): Promise<RateLimitDecision> {
    this.forgetExpired(now);

    const windowStart = now - this.windowMs;
    const recent = (this.windows.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= this.max) {
      const oldest = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.windows.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    this.windows.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  size(): number {
    return this.windows.size;
  }

  private forgetExpired(now: number): void {
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.windows) {
      if (timestamps.every((timestamp) => timestamp <= windowStart)) this.windows.delete(key);
    }
  }
}

export class RedisRateLimiter implements RateLimiter {
  private readonly memory: MemoryRateLimiter;

  constructor(
    private readonly redis: RedisLike,
    private readonly max: number,
    private readonly windowMs: number,
    private readonly prefix: string,
    private readonly logger: Logger,
  ) {
    this.memory = new MemoryRateLimiter(max, windowMs);
  }

  async take(key: string): Promise<RateLimitDecision> {
    const redisKey = `${this.prefix}:${key}`;
    try {
      const result = (await this.redis.eval(WINDOW_SCRIPT, [redisKey], [this.max, this.windowMs])) as [
        number,
        number,
      ];
      const [allowed, ttlMs] = result;
      if (allowed === 1) return { allowed: true, retryAfterSeconds: 0 };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
    } catch (error) {
      this.logger.warn("redis rate limit failed, using memory fallback", { key, error });
      return this.memory.take(key);
    }
  }
}
