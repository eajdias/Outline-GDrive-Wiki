export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  drive: {
    saKeyPath: string;
    driveId: string | null;
    rootFolderId: string;
    webhookUrl: string | null;
    webhookToken: string | null;
    port: number;
    debounceMs: number;
    documentDelayMs: number;
    pollIntervalMs: number;
    ignoreFolders: string[];
  };
  outline: {
    apiUrl: string;
    apiKey: string;
    publicUrl: string;
    collectionMap: Record<string, string>;
    defaultCollectionId: string | null;
  };
  rag: {
    baseUrl: string;
    apiKey: string;
    workspace: string;
  };
  state: {
    dbPath: string;
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

function optionalOrNull(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
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

function nonNegativeInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer`);
  }
  return parsed;
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

function parseCollectionMap(raw: string | undefined): Record<string, string> {
  if (!raw || raw.trim().length === 0) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OUTLINE_COLLECTION_MAP must be a JSON object mapping folderId to collectionId");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OUTLINE_COLLECTION_MAP must be a JSON object mapping folderId to collectionId");
  }

  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value.length > 0) map[key] = value;
  }
  return map;
}

function parseList(raw: string | undefined, fallback: string): string[] {
  const value = raw && raw.trim().length > 0 ? raw : fallback;
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const outlineApiUrl = stripTrailingSlash(required(env, "OUTLINE_API_URL"));
  const webhookUrl = optionalOrNull(env, "DRIVE_WEBHOOK_URL");

  return {
    drive: {
      saKeyPath: required(env, "DRIVE_SA_KEY_PATH"),
      driveId: optionalOrNull(env, "DRIVE_ID"),
      rootFolderId: required(env, "DRIVE_ROOT_FOLDER_ID"),
      webhookUrl,
      webhookToken: optionalOrNull(env, "DRIVE_WEBHOOK_TOKEN"),
      port: positiveInt(env, "IMPORT_DRIVE_PORT", 8787),
      debounceMs: nonNegativeInt(env, "IMPORT_DEBOUNCE_MS", 2000),
      documentDelayMs: nonNegativeInt(env, "IMPORT_DOCUMENT_DELAY_MS", 0),
      pollIntervalMs: nonNegativeInt(env, "DRIVE_POLL_INTERVAL_MS", 900_000),
      ignoreFolders: parseList(env.IMPORT_DRIVE_IGNORE_FOLDERS, "drafts"),
    },
    outline: {
      apiUrl: outlineApiUrl,
      apiKey: required(env, "OUTLINE_API_KEY"),
      publicUrl: stripTrailingSlash(optional(env, "OUTLINE_PUBLIC_URL", outlineApiUrl)),
      collectionMap: parseCollectionMap(env.OUTLINE_COLLECTION_MAP),
      defaultCollectionId: optionalOrNull(env, "OUTLINE_DEFAULT_COLLECTION_ID"),
    },
    rag: {
      baseUrl: stripTrailingSlash(required(env, "ANYTHINGLLM_API_URL")),
      apiKey: required(env, "ANYTHINGLLM_API_KEY"),
      workspace: optional(env, "IMPORT_DRIVE_RAG_WORKSPACE", "kb-drive"),
    },
    state: {
      dbPath: optional(env, "IMPORTS_DB_PATH", "imports.db"),
    },
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
}
