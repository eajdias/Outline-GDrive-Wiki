import type { ImportDeps } from "./import-document.js";

export const PAGE_TOKEN_KEY = "drive_page_token";

export async function ensurePageToken(deps: ImportDeps): Promise<string> {
  const existing = deps.state.getMeta(PAGE_TOKEN_KEY);
  if (existing) return existing;

  const token = await deps.drive.startPageToken();
  deps.state.setMeta(PAGE_TOKEN_KEY, token);
  return token;
}
