import {
  nonNegativeInt,
  optional,
  optionalOrNull,
  parseLogLevel,
  positiveInt,
  stripTrailingSlash,
  type LogLevel,
} from "@repo/env";

export interface UpstreamConfig {
  name: string;
  baseUrl: string;
  apiKeys: string[];
  model: string | null;
  embeddingModel: string | null;
}

export interface GatewayConfig {
  server: {
    port: number;
    host: string;
    bodyLimitBytes: number;
    timeoutMs: number;
    keyCooldownMs: number;
    token: string | null;
  };
  embeddingDimensions: number | null;
  upstreams: UpstreamConfig[];
  logLevel: LogLevel;
}

export type { LogLevel };

interface ProviderSpec {
  baseEnv: string;
  keysEnv: string;
  modelEnv: string;
  embeddingModelEnv: string;
  defaultBaseUrl: string | null;
}

const PROVIDERS: Record<string, ProviderSpec> = {
  gemini: {
    baseEnv: "GEMINI_BASE_URL",
    keysEnv: "GEMINI_API_KEYS",
    modelEnv: "GEMINI_MODEL",
    embeddingModelEnv: "GEMINI_EMBEDDING_MODEL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  generic: {
    baseEnv: "GENERIC_BASE_URL",
    keysEnv: "GENERIC_API_KEYS",
    modelEnv: "GENERIC_MODEL",
    embeddingModelEnv: "GENERIC_EMBEDDING_MODEL",
    defaultBaseUrl: null,
  },
};

function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function upstreamFor(env: NodeJS.ProcessEnv, name: string): UpstreamConfig {
  const spec = PROVIDERS[name];
  if (!spec) {
    throw new Error(`Unknown LLM_GATEWAY_PROVIDERS entry: ${name} (known: ${Object.keys(PROVIDERS).join(", ")})`);
  }

  const apiKeys = splitList(env[spec.keysEnv] || env.GEMINI_API_KEY);
  if (apiKeys.length === 0) {
    throw new Error(`Missing required environment variable: ${spec.keysEnv} (comma-separated fallback keys)`);
  }

  const baseUrl = optionalOrNull(env, spec.baseEnv) ?? spec.defaultBaseUrl;
  if (!baseUrl) {
    throw new Error(`Missing required environment variable: ${spec.baseEnv}`);
  }

  return {
    name,
    baseUrl: stripTrailingSlash(baseUrl),
    apiKeys,
    model: optionalOrNull(env, spec.modelEnv),
    embeddingModel: optionalOrNull(env, spec.embeddingModelEnv),
  };
}

function parseUpstreams(env: NodeJS.ProcessEnv): UpstreamConfig[] {
  const names = splitList(env.LLM_GATEWAY_PROVIDERS ?? "gemini");
  if (names.length === 0) {
    throw new Error("LLM_GATEWAY_PROVIDERS must list at least one provider");
  }
  return names.map((name) => upstreamFor(env, name.toLowerCase()));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const embeddingDimensions = nonNegativeInt(env, "LLM_GATEWAY_EMBEDDING_DIMENSIONS", 2048);

  return {
    server: {
      port: positiveInt(env, "LLM_GATEWAY_PORT", 8090),
      host: optional(env, "LLM_GATEWAY_HOST", "0.0.0.0"),
      bodyLimitBytes: positiveInt(env, "LLM_GATEWAY_BODY_LIMIT_BYTES", 2_097_152),
      timeoutMs: positiveInt(env, "LLM_GATEWAY_TIMEOUT_MS", 120_000),
      keyCooldownMs: positiveInt(env, "LLM_GATEWAY_KEY_COOLDOWN_MS", 900_000),
      token: optionalOrNull(env, "LLM_GATEWAY_TOKEN"),
    },
    embeddingDimensions: embeddingDimensions === 0 ? null : embeddingDimensions,
    upstreams: parseUpstreams(env),
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}
