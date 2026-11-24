export type RequestKind = "chat" | "embeddings";

export interface Shape {
  model: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
}

export type ShapedBody = { ok: true; body: string } | { ok: false };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function shapeBody(kind: RequestKind, raw: string, shape: Shape): ShapedBody {
  const model = kind === "chat" ? shape.model : shape.embeddingModel;
  const dimensions = kind === "embeddings" ? shape.embeddingDimensions : null;

  if (model === null && dimensions === null) return { ok: true, body: raw };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const payload = asRecord(parsed);
  if (!payload) return { ok: false };

  if (model !== null) payload.model = model;
  if (dimensions !== null) payload.dimensions = dimensions;

  return { ok: true, body: JSON.stringify(payload) };
}
