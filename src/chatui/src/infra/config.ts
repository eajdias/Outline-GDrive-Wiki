export type LogLevel = "debug" | "info" | "warn" | "error";

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
  anythingllm: {
    baseUrl: string;
    apiKey: string;
    workspaces: string[];
    timeoutMs: number;
    minScore: number;
  };
  logLevel: LogLevel;
}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

function score(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Environment variable ${name} must be a number between 0 and 1`);
  }
  return parsed;
}

function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new Error(`Environment variable ${name} must be 1/true or 0/false`);
}

function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "info").trim().toLowerCase();
  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  throw new Error(`Environment variable LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}`);
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

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
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}
