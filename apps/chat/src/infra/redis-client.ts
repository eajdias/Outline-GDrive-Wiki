import { createConnection, type Socket } from "node:net";
import type { Logger } from "@repo/logger";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const COMMAND_TIMEOUT_MS = 2_000;
const RECONNECT_DELAY_MS = 1_000;

function encode(args: (string | number)[]): string {
  const parts: string[] = [`*${args.length}\r\n`];
  for (const arg of args) {
    const text = String(arg);
    parts.push(`$${Buffer.byteLength(text)}\r\n${text}\r\n`);
  }
  return parts.join("");
}

export function tryParseReply(buffer: Uint8Array): { value: unknown; rest: Uint8Array } | null {
  const text = Buffer.from(buffer).toString("utf8");
  if (!text.startsWith("*") && !text.startsWith("$") && !text.startsWith(":") && !text.startsWith("+") && !text.startsWith("-")) {
    return null;
  }
  if (text.startsWith("+")) {
    const end = text.indexOf("\r\n");
    if (end < 0) return null;
    return { value: text.slice(1, end), rest: buffer.subarray(end + 2) };
  }
  if (text.startsWith("-")) {
    const end = text.indexOf("\r\n");
    return { value: new Error(text.slice(1, end < 0 ? undefined : end)), rest: new Uint8Array(0) };
  }
  if (text.startsWith(":")) {
    const end = text.indexOf("\r\n");
    if (end < 0) return null;
    return { value: Number.parseInt(text.slice(1, end), 10), rest: buffer.subarray(end + 2) };
  }
  if (text.startsWith("*")) {
    const headerEnd = text.indexOf("\r\n");
    if (headerEnd < 0) return null;
    const count = Number.parseInt(text.slice(1, headerEnd), 10);
    let rest = buffer.subarray(headerEnd + 2);
    const items: unknown[] = [];
    for (let i = 0; i < count; i += 1) {
      const parsed = tryParseReply(rest);
      if (!parsed) return null;
      items.push(parsed.value);
      rest = parsed.rest;
    }
    return { value: items, rest };
  }
  return null;
}

export interface RedisConnection {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
  quit(): Promise<void>;
}

export function createRedisClient(url: string, logger: Logger): RedisConnection {
  const parsed = new URL(url.replace(/^redis:\/\//, "http://"));
  const host = parsed.hostname || "127.0.0.1";
  const port = Number.parseInt(parsed.port || "6379", 10);

  let socket: Socket | null = null;
  let buffer: Uint8Array = new Uint8Array(0);
  const queue: Pending[] = [];
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function failQueue(reason: Error): void {
    for (const pending of queue.splice(0)) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
  }

  function connect(): void {
    buffer = new Uint8Array(0);
    const connection = createConnection({ host, port });
    socket = connection;

    connection.on("data", (chunk: Buffer) => {
      const next = new Uint8Array(buffer.length + chunk.length);
      next.set(buffer);
      next.set(chunk, buffer.length);
      buffer = next;

      for (;;) {
        const pending = queue[0];
        if (!pending) return;
        const parsedReply = tryParseReply(buffer);
        if (!parsedReply) return;
        buffer = parsedReply.rest;
        queue.shift();
        clearTimeout(pending.timeout);
        if (parsedReply.value instanceof Error) pending.reject(parsedReply.value);
        else pending.resolve(parsedReply.value);
      }
    });

    connection.on("error", (error) => {
      logger.warn("redis connection error", { error });
      failQueue(error instanceof Error ? error : new Error(String(error)));
    });

    connection.on("close", () => {
      failQueue(new Error("redis connection closed"));
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!closed) connect();
      }, RECONNECT_DELAY_MS);
      reconnectTimer.unref();
    });
  }

  connect();

  function send(args: (string | number)[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (closed || socket === null) {
        reject(new Error("redis client closed"));
        return;
      }

      const pending: Pending = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = queue.indexOf(pending);
          if (index >= 0) queue.splice(index, 1);
          reject(new Error(`redis command timed out after ${COMMAND_TIMEOUT_MS} ms`));
        }, COMMAND_TIMEOUT_MS),
      };
      pending.timeout.unref();
      queue.push(pending);
      socket.write(encode(args));
    });
  }

  return {
    eval: (script: string, keys: string[], args: (string | number)[]) =>
      send(["EVAL", script, String(keys.length), ...keys, ...args]),
    quit: () =>
      new Promise<void>((resolve) => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        failQueue(new Error("redis client closed"));
        if (socket === null) {
          resolve();
          return;
        }
        socket.end(() => resolve());
      }),
  };
}
