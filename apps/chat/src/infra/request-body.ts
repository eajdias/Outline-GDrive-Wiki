import type { IncomingMessage } from "node:http";

export class BodyTooLargeError extends Error {}

export async function readBody(request: IncomingMessage, limit: number): Promise<string> {
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

export function headerValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

const PRIVATE_PEER =
  /^(::1|::ffff:127\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fe80:)/i;

export function isPrivatePeer(address: string | undefined): boolean {
  return address !== undefined && PRIVATE_PEER.test(address);
}
