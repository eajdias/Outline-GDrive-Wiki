import { createHash } from "node:crypto";

export function hashDocument(normalized: string, url: string, schema = "1", citationBaseUrl = ""): string {
  return createHash("sha256").update(`${schema}\n${normalized}\n${url}\n${citationBaseUrl}`, "utf8").digest("hex");
}
