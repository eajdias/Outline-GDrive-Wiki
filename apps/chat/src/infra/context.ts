import { createLogger, type Logger } from "@repo/logger";
import type { ChatClient } from "../ports/chat.js";
import { AnythingLLMClient } from "./chat-client.js";
import type { Config } from "./config.js";

export interface Runtime {
  config: Config;
  logger: Logger;
  chat: ChatClient;
}

export function createRuntime(config: Config): Runtime {
  const logger = createLogger("chat", config.logLevel);

  return {
    config,
    logger,
    chat: new AnythingLLMClient(
      config.anythingllm.baseUrl,
      config.anythingllm.apiKey,
      config.anythingllm.timeoutMs,
      logger,
    ),
  };
}
