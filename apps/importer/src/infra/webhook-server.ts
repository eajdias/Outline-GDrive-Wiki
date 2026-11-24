import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Logger } from "@repo/logger";

export interface WebhookStatus {
  channelId: string | null;
  expiration: string | null;
  lastEventAt: string | null;
  lastApplyAt: string | null;
  lastApplyReport: unknown;
}

export interface ImageRequest {
  docId: string;
  objectId: string;
}

export interface ImageResult {
  bytes: Uint8Array;
  contentType: string;
}

export interface WebhookServerOptions {
  port: number;
  expectedToken: string | null;
  logger: Logger;
  onEvent: () => void;
  status: () => WebhookStatus;
  onImage?: (request: ImageRequest) => Promise<ImageResult>;
  isKnownDoc?: (docId: string) => boolean | Promise<boolean>;
}

export interface WebhookServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  port(): number;
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function respondBytes(response: ServerResponse, image: ImageResult): void {
  response.writeHead(200, {
    "Content-Type": image.contentType,
    "Content-Length": image.bytes.byteLength,
    "Cache-Control": "private, max-age=1200",
  });
  response.end(Buffer.from(image.bytes));
}

function handle(request: IncomingMessage, response: ServerResponse, options: WebhookServerOptions): void {
  const url = request.url ?? "/";

  if (request.method === "GET" && url === "/healthz") {
    respond(response, 200, options.status());
    return;
  }

  const imageMatch = /^\/drive-image\/([^/]+)\/([^/]+)$/.exec(url);
  if (request.method === "GET" && imageMatch) {
    const docId = decodeURIComponent(imageMatch[1] ?? "");
    const objectId = decodeURIComponent(imageMatch[2] ?? "");

    if (!options.onImage) {
      respond(response, 404, { error: "image not found" });
      return;
    }

    void Promise.resolve(options.isKnownDoc?.(docId) ?? true).then((known) => {
      if (!known) {
        if (!response.headersSent) respond(response, 404, { error: "image not found" });
        return;
      }
      void options
        .onImage?.({ docId, objectId })
        .then((image) => {
          if (!response.headersSent) respondBytes(response, image);
        })
        .catch((error: unknown) => {
          options.logger.warn("drive image proxy failed", { docId, objectId, error });
          if (!response.headersSent) respond(response, 502, { error: "image unavailable" });
        });
    });
    return;
  }

  if (request.method !== "POST" || url !== "/hooks/drive") {
    respond(response, 404, { error: "not found" });
    return;
  }

  if (options.expectedToken && request.headers["x-goog-channel-token"] !== options.expectedToken) {
    options.logger.warn("drive webhook rejected: invalid channel token");
    respond(response, 401, { error: "invalid channel token" });
    return;
  }

  const state = request.headers["x-goog-resource-state"];
  request.resume();

  if (state !== "change") {
    respond(response, 200, { ignored: state ?? "unknown" });
    return;
  }

  options.logger.info("drive change notification received");
  respond(response, 202, { accepted: true });
  options.onEvent();
}

export function createWebhookServer(options: WebhookServerOptions): WebhookServer {
  const server = createServer((request, response) => handle(request, response, options));

  return {
    listen: (): Promise<void> =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, "0.0.0.0", () => resolve());
      }),
    close: (): Promise<void> =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    port: (): number => {
      const address = server.address();
      return typeof address === "object" && address !== null ? address.port : 0;
    },
  };
}
