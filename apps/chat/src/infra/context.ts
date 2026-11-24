import { createLogger, type Logger } from "@repo/logger";
import type { ChatClient } from "../ports/chat.js";
import { AnythingLLMClient } from "./chat-client.js";
import type { Config } from "./config.js";
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from "./rate-limit.js";
import { createRedisClient } from "./redis-client.js";

export interface Runtime {
  config: Config;
  logger: Logger;
  chat: ChatClient;
  limiter: RateLimiter;
  close(): Promise<void>;
}

export function createRuntime(config: Config): Runtime {
  const logger = createLogger("chat", config.logLevel);

  let limiter: RateLimiter;
  let close: () => Promise<void>;
  if (config.redis.url) {
    const redis = createRedisClient(config.redis.url, logger);
    limiter = new RedisRateLimiter(redis, config.server.rateLimitMax, config.server.rateLimitWindowMs, "rl", logger);
    close = () => redis.quit();
  } else {
    logger.warn("REDIS_URL not set; rate limit is per-instance memory only");
    limiter = new MemoryRateLimiter(config.server.rateLimitMax, config.server.rateLimitWindowMs);
    close = async () => {};
  }

  return {
    config,
    logger,
    chat: new AnythingLLMClient(
      config.anythingllm.baseUrl,
      config.anythingllm.apiKey,
      config.anythingllm.timeoutMs,
      logger,
    ),
    limiter,
    close,
  };
}
