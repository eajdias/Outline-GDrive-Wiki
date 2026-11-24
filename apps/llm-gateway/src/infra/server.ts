import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { RequestKind } from "../domain/request-shaping.js";
import type { ProxyResult } from "../usecases/proxy.js";
import type { Runtime } from "./context.js";

export class BodyTooLargeError extends Error {}

interface Route {
  kind: RequestKind;
  requiresModel: boolean;
}

const ROUTES: Record<string, Route> = {
  "/v1/chat/completions": { kind: "chat", requiresModel: true },
  "/v1/embeddings": { kind: "embeddings", requiresModel: false },
};

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new BodyTooLargeError();
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function authorized(request: IncomingMessage, token: string | null): boolean {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

async function forward(
  proxy: ProxyResult,
  response: ServerResponse,
  context: { requestId: string; logger: Runtime["logger"]; startedAt: number },
): Promise<void> {
  const headers: Record<string, string> = {};
  if (proxy.reply.retryAfterSeconds) headers["Retry-After"] = proxy.reply.retryAfterSeconds;

  if (proxy.reply.stream) {
    response.writeHead(proxy.reply.status, { "Content-Type": proxy.reply.contentType, ...headers });
    for await (const chunk of proxy.reply.stream) {
      if (!response.write(chunk)) await new Promise((resolve) => response.once("drain", resolve));
    }
    response.end();
  } else {
    response.writeHead(proxy.reply.status, { "Content-Type": proxy.reply.contentType, ...headers });
    response.end(proxy.reply.text ?? "");
  }

  const level = proxy.reply.status >= 500 ? "error" : proxy.reply.status >= 400 ? "warn" : "info";
  context.logger[level]("upstream request finished", {
    requestId: context.requestId,
    upstream: proxy.upstream,
    keyIndex: proxy.keyIndex,
    status: proxy.reply.status,
    streamed: proxy.reply.stream !== null,
    durationMs: Date.now() - context.startedAt,
  });
}

export function createGatewayServer(runtime: Runtime): Server {
  const { config, logger, proxy } = runtime;

  const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz" && request.method === "GET") {
      sendJson(response, 200, { status: "ok", upstreams: proxy.status() });
      return;
    }

    const entry = ROUTES[url.pathname];
    if (!entry) {
      sendJson(response, 404, { error: "not_found", message: "Rota não encontrada." });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed", message: "Use POST." }, { Allow: "POST" });
      return;
    }
    if (!authorized(request, config.server.token)) {
      sendJson(response, 401, { error: "unauthorized", message: "Bearer token inválido." });
      return;
    }

    let body: string;
    try {
      body = await readBody(request, config.server.bodyLimitBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendJson(response, 413, { error: "too_large", message: "Corpo acima do limite." });
        return;
      }
      throw error;
    }

    const result = await proxy.handle(entry.kind, body);
    await forward(result, response, { requestId, logger, startedAt });
  };

  return createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      logger.error("request failed", { error });
      if (!response.headersSent) {
        sendJson(response, 500, { error: "internal", message: "Erro interno." });
      } else {
        response.end();
      }
    });
  });
}
