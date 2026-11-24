import { createLogger, type Logger } from "@repo/logger";
import type { GatewayConfig } from "./config.js";
import { createOpenAiSender } from "./openai-client.js";
import { Proxy } from "../usecases/proxy.js";

export interface Runtime {
  config: GatewayConfig;
  logger: Logger;
  proxy: Proxy;
}

export function createRuntime(config: GatewayConfig): Runtime {
  const logger = createLogger("llm-gateway", config.logLevel);
  const proxy = new Proxy(config.upstreams, createOpenAiSender(config.server.timeoutMs, logger), {
    keyCooldownMs: config.server.keyCooldownMs,
    embeddingDimensions: config.embeddingDimensions,
  });

  return { config, logger, proxy };
}
