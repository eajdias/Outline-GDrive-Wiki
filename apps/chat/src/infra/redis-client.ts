import { createConnection } from "node:net";
import type { Logger } from "@repo/logger";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

function encode(args: (string | number)[]): string {
  const parts: string[] = [`*${args.length}\r\n`];
  for (const arg of args) {
    const text = String(arg);
    parts.push(`$${Buffer.byteLength(text)}\r\n${text}\r\n`);
  }
  return parts.join("");
}

function tryParseReply(buffer: Uint8Array): { value: unknown; rest: Uint8Array } | null {
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

  const socket = createConnection({ host, port });
  socket.setKeepAlive(true);
  let buffer: Uint8Array = new Uint8Array(0);
  const queue: Pending[] = [];

  function append(chunk: Uint8Array): void {
    const next = new Uint8Array(buffer.length + chunk.length);
    next.set(buffer);
    next.set(chunk, buffer.length);
    buffer = next;
  }

  socket.on("data", (chunk: Buffer) => {
    append(chunk);
    for (;;) {
      const pending = queue[0];
      if (!pending) return;
      const parsedReply = tryParseReply(buffer);
      if (!parsedReply) return;
      buffer = parsedReply.rest;
      queue.shift();
      if (parsedReply.value instanceof Error) pending.reject(parsedReply.value);
      else pending.resolve(parsedReply.value);
    }
  });

  socket.on("error", (error) => {
    logger.warn("redis connection error", { error });
    for (const pending of queue.splice(0)) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

  function send(args: (string | number)[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject });
      socket.write(encode(args));
    });
  }

  return {
    eval: (script: string, keys: string[], args: (string | number)[]) =>
      send(["EVAL", script, String(keys.length), ...keys, ...args]),
    quit: () =>
      new Promise<void>((resolve) => {
        socket.end(() => resolve());
      }),
  };
}
