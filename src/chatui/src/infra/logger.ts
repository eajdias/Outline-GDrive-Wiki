import type { LogLevel } from "./config.js";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info;

  const write = (entryLevel: LogLevel, message: string, context: Record<string, unknown> = {}): void => {
    if ((LEVEL_WEIGHT[entryLevel] ?? LEVEL_WEIGHT.info) < threshold) return;

    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: entryLevel,
      service: "chatui",
      message,
    };
    for (const [key, value] of Object.entries(context)) {
      entry[key] = serialize(value);
    }
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  };

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
  };
}
