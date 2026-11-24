export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const PRUNE_THRESHOLD = 5000;

export class RateLimiter {
  private readonly windows = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): RateLimitDecision {
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
    if (this.windows.size > PRUNE_THRESHOLD) this.prune(windowStart);

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(windowStart: number): void {
    for (const [key, timestamps] of this.windows) {
      if (timestamps.every((timestamp) => timestamp <= windowStart)) this.windows.delete(key);
    }
  }
}
