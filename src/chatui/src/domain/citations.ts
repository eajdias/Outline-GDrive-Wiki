export interface RawSource {
  title: string | null;
  description: string | null;
  url: string | null;
  score: number | null;
  text: string;
}

export type SourceOrigin = "wiki" | "drive";

export interface Citation {
  title: string;
  url: string | null;
  score: number | null;
  snippet: string;
  origin: SourceOrigin;
}

const WEB_PREFIX = "web://";
const WEBSITE_SUFFIX = ".website";
const METADATA_BLOCK = /<document_metadata>[\s\S]*?<\/document_metadata>/gi;
const NO_DESCRIPTION = "no description found";
const MAX_SNIPPET_CHARS = 220;

export function citationUrl(raw: string | null): string | null {
  if (!raw) return null;

  let value = raw.trim();
  if (value.startsWith(WEB_PREFIX)) value = value.slice(WEB_PREFIX.length);
  if (value.endsWith(WEBSITE_SUFFIX)) value = value.slice(0, -WEBSITE_SUFFIX.length);

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function displayTitle(source: RawSource): string | null {
  const description = source.description?.trim();
  if (description && description.toLowerCase() !== NO_DESCRIPTION) return description;

  const title = source.title?.trim();
  if (!title) return null;

  return title
    .replace(/\.txt$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(text: string): string {
  const clean = text.replace(METADATA_BLOCK, " ").replace(/\s+/g, " ").trim();
  return clean.length > MAX_SNIPPET_CHARS ? `${clean.slice(0, MAX_SNIPPET_CHARS - 1)}…` : clean;
}

export function toCitations(rawSources: RawSource[], limit = 4, origin: SourceOrigin = "wiki"): Citation[] {
  const byKey = new Map<string, Citation>();

  for (const source of rawSources) {
    const title = displayTitle(source);
    const url = citationUrl(source.url);
    if (!title && !url) continue;

    const citation: Citation = {
      title: title ?? url ?? "Documento",
      url,
      score: source.score,
      snippet: snippet(source.text),
      origin,
    };
    const key = url ?? citation.title;
    const existing = byKey.get(key);
    if (!existing || (citation.score ?? 0) > (existing.score ?? 0)) {
      byKey.set(key, citation);
    }
  }

  return [...byKey.values()]
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, limit);
}

export function topScore(citations: Citation[]): number | null {
  let top: number | null = null;
  for (const citation of citations) {
    if (citation.score !== null && (top === null || citation.score > top)) top = citation.score;
  }
  return top;
}
