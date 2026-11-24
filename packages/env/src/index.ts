import type { LogLevel } from "@repo/logger";

export type { LogLevel };

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optional(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export function optionalOrNull(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

export function nonNegativeInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer`);
  }
  return parsed;
}

export function score(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Environment variable ${name} must be a number between 0 and 1`);
  }
  return parsed;
}

export function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new Error(`Environment variable ${name} must be 1/true or 0/false`);
}

export function parseLogLevel(raw: string | undefined): LogLevel {
  const value = (raw ?? "info").trim().toLowerCase();
  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  throw new Error(`Environment variable LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}`);
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function parseList(raw: string | undefined, fallback: string): string[] {
  const value = raw && raw.trim().length > 0 ? raw : fallback;
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}
