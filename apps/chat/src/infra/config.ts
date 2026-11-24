import { flag, optional, optionalOrNull, parseLogLevel, positiveInt, required, score, stripTrailingSlash, type LogLevel } from "@repo/env";

export interface Config {
  server: {
    port: number;
    host: string;
    requestBodyLimitBytes: number;
    rateLimitMax: number;
    rateLimitWindowMs: number;
    maxQuestionChars: number;
    allowEmbed: boolean;
  };
  redis: {
    url: string | null;
  };
  anythingllm: {
    baseUrl: string;
    apiKey: string;
    workspaces: string[];
    timeoutMs: number;
    minScore: number;
  };
  logLevel: LogLevel;
}

export type { LogLevel };

function parseWorkspaces(env: NodeJS.ProcessEnv): string[] {
  const raw = env.ANYTHINGLLM_WORKSPACES?.trim() || env.ANYTHINGLLM_WORKSPACE?.trim();
  if (!raw) {
    throw new Error("Missing required environment variable: ANYTHINGLLM_WORKSPACES (or ANYTHINGLLM_WORKSPACE)");
  }

  const workspaces = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (workspaces.length === 0) {
    throw new Error("ANYTHINGLLM_WORKSPACES must list at least one workspace slug");
  }
  return workspaces;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    server: {
      port: positiveInt(env, "CHAT_PORT", 8080),
      host: optional(env, "CHAT_HOST", "0.0.0.0"),
      requestBodyLimitBytes: positiveInt(env, "CHAT_BODY_LIMIT_BYTES", 8192),
      rateLimitMax: positiveInt(env, "CHAT_RATE_LIMIT_MAX", 10),
      rateLimitWindowMs: positiveInt(env, "CHAT_RATE_LIMIT_WINDOW_MS", 60_000),
      maxQuestionChars: positiveInt(env, "CHAT_MAX_QUESTION_CHARS", 1000),
      allowEmbed: flag(env, "CHAT_ALLOW_EMBED", false),
    },
    anythingllm: {
      baseUrl: stripTrailingSlash(required(env, "ANYTHINGLLM_API_URL")),
      apiKey: required(env, "ANYTHINGLLM_API_KEY"),
      workspaces: parseWorkspaces(env),
      timeoutMs: positiveInt(env, "CHAT_TIMEOUT_MS", 60_000),
      minScore: score(env, "CHAT_MIN_SCORE", 0.65),
    },
    redis: {
      url: optionalOrNull(env, "REDIS_URL"),
    },
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}
