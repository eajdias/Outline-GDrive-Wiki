import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { AskUpstreamError, AskValidationError, askQuestion } from "../usecases/ask.js";
import type { Runtime } from "./context.js";
import { BodyTooLargeError, headerValue, isPrivatePeer, readBody } from "./request-body.js";
import { securityHeaders } from "./security-headers.js";
import { upstreamResponse } from "./upstream-errors.js";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../public");
const RENDER_JS = path.resolve(import.meta.dirname, "../domain/markdown.entry.js");

interface StaticFile {
  file: string;
  type: string;
}

function staticFiles(): Record<string, StaticFile> {
  return {
    "/": { file: path.join(PUBLIC_DIR, "index.html"), type: "text/html; charset=utf-8" },
    "/app.js": { file: path.join(PUBLIC_DIR, "app.js"), type: "text/javascript; charset=utf-8" },
    "/styles.css": { file: path.join(PUBLIC_DIR, "styles.css"), type: "text/css; charset=utf-8" },
    "/render.js": { file: RENDER_JS, type: "text/javascript; charset=utf-8" },
    "/widget.js": { file: path.join(PUBLIC_DIR, "widget.js"), type: "text/javascript; charset=utf-8" },
    "/embed-demo.html": { file: path.join(PUBLIC_DIR, "embed-demo.html"), type: "text/html; charset=utf-8" },
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isClientAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return error.name === "AbortError" || error.message === "aborted" || code === "ECONNRESET";
}

function clientIp(request: IncomingMessage): string {
  const realIp = headerValue(request, "x-real-ip");
  if (realIp) return realIp;

  const peer = request.socket.remoteAddress ?? undefined;
  if (!isPrivatePeer(peer)) return peer ?? "unknown";

  const hops = headerValue(request, "x-forwarded-for")?.split(",").map((hop) => hop.trim()).filter(Boolean);
  return hops?.at(-1) ?? peer ?? "unknown";
}

function questionFrom(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const question = (payload as Record<string, unknown>).question;
  return typeof question === "string" ? question : null;
}

export function createChatServer(runtime: Runtime): Server {
  const { config, logger, chat, limiter, auth } = runtime;
  const files = staticFiles();

  const serveStatic = async (entry: StaticFile, response: ServerResponse): Promise<void> => {
    try {
      const body = await readFile(entry.file);
      response.writeHead(200, { "Content-Type": entry.type, "Cache-Control": "no-cache" });
      response.end(body);
    } catch (error) {
      logger.error("static file missing", { file: entry.file, error });
      sendJson(response, 500, { error: "internal", message: "Arquivo estático ausente." });
    }
  };

  const handleAsk = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const ip = clientIp(request);
    const decision = await limiter.take(ip);

    if (!decision.allowed) {
      const retryAfter = decision.retryAfterSeconds;
      sendJson(
        response,
        429,
        {
          requestId,
          error: "rate_limited",
          message: `Muitas perguntas em pouco tempo. Tente de novo em ${retryAfter} s.`,
        },
        { "Retry-After": String(retryAfter) },
      );
      logger.warn("ask rate limited", { requestId, retryAfter });
      return;
    }

    let body: string;
    try {
      body = await readBody(request, config.server.requestBodyLimitBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendJson(response, 413, {
          requestId,
          error: "too_large",
          message: `O corpo da requisição passa de ${config.server.requestBodyLimitBytes} bytes.`,
        });
        logger.warn("ask body too large", { requestId });
        return;
      }
      throw error;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(response, 400, {
        requestId,
        error: "invalid_json",
        message: "Envie um JSON com o campo question.",
      });
      return;
    }

    const question = questionFrom(payload);
    if (question === null) {
      sendJson(response, 400, {
        requestId,
        error: "invalid_question",
        message: "O campo question é obrigatório e precisa ser texto.",
      });
      return;
    }

    try {
      const result = await askQuestion(chat, question, {
        maxQuestionChars: config.server.maxQuestionChars,
        minScore: config.anythingllm.minScore,
        workspaces: config.anythingllm.workspaces,
        onWorkspaceError: (workspace, error) => {
          logger.warn("workspace failed", { requestId, workspace, error });
        },
      });
      sendJson(response, 200, { requestId, ...result });
      logger.info("ask completed", {
        requestId,
        notFound: result.notFound,
        sources: result.sources.length,
        topScore: result.sources[0]?.score ?? null,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error instanceof AskValidationError) {
        sendJson(response, 400, { requestId, error: "invalid_question", message: error.message });
        return;
      }

      if (error instanceof AskUpstreamError) {
        const mapped = upstreamResponse(error.failure);
        sendJson(response, mapped.status, { requestId, error: mapped.error, message: mapped.message }, mapped.headers ?? {});
        logger.warn("ask upstream failed", { requestId, failure: error.failure, durationMs: Date.now() - startedAt });
        return;
      }

      logger.error("ask failed", { requestId, error, durationMs: Date.now() - startedAt });
      sendJson(response, 500, {
        requestId,
        error: "internal",
        message: "Erro interno ao consultar a base. Tente de novo.",
      });
    }
  };

  const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://localhost");
    for (const [name, value] of Object.entries(securityHeaders(url, config.server.allowEmbed))) {
      response.setHeader(name, value);
    }

    if (url.pathname === "/healthz" && request.method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (!(await auth.verify(request.headers.cookie))) {
      sendJson(response, 401, {
        error: "unauthorized",
        message: "Entre no Outline para usar o chat.",
      });
      return;
    }

    const entry = files[url.pathname];
    if (entry && request.method === "GET") {
      await serveStatic(entry, response);
      return;
    }

    if (url.pathname === "/ask") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "method_not_allowed", message: "Use POST /ask." }, { Allow: "POST" });
        return;
      }
      await handleAsk(request, response);
      return;
    }

    sendJson(response, 404, { error: "not_found", message: "Rota não encontrada." });
  };

  return createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      if (isClientAbort(error)) {
        logger.debug("request aborted by client");
        if (!response.headersSent) response.destroy();
        return;
      }

      logger.error("request failed", { error: errorMessage(error) });
      if (!response.headersSent) {
        sendJson(response, 500, { error: "internal", message: "Erro interno." });
      } else {
        response.end();
      }
    });
  });
}
