import { createHash } from "node:crypto";

export function hashDocument(normalized: string, url: string): string {
  return createHash("sha256").update(`${normalized}\n${url}`, "utf8").digest("hex");
}
