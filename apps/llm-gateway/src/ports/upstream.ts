import type { RequestKind } from "../domain/request-shaping.js";

export interface UpstreamTarget {
  name: string;
  baseUrl: string;
  apiKey: string;
}

export interface UpstreamRequest {
  kind: RequestKind;
  body: string;
}

export interface UpstreamReply {
  status: number;
  contentType: string;
  retryAfterSeconds: string | null;
  text: string | null;
  stream: AsyncIterable<Uint8Array> | null;
}

export type UpstreamSender = (target: UpstreamTarget, request: UpstreamRequest) => Promise<UpstreamReply>;
