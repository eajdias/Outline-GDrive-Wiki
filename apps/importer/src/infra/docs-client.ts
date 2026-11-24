import type { DocImageBytes, DocImageObject, DocsPort } from "../ports/docs.js";
import { HttpClient } from "@repo/http";
import type { Logger } from "@repo/logger";

const DOCS_BASE = "https://docs.googleapis.com";
const IMAGE_TTL_MS = 20 * 60 * 1000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

interface InlineImage {
  inlineObjectProperties?: {
    embeddedObject?: {
      title?: string;
      description?: string;
      imageProperties?: { contentUri?: string };
    };
  };
}

interface ParagraphElement {
  inlineObjectElement?: { inlineObjectId?: string };
}

interface StructuralElement {
  paragraph?: { elements?: ParagraphElement[] };
  table?: { tableRows?: Array<{ tableCells?: Array<{ content?: StructuralElement[] }> }> };
  tableOfContents?: { content?: StructuralElement[] };
}

interface DocsDocument {
  inlineObjects?: Record<string, InlineImage>;
  body?: { content?: StructuralElement[] };
}

interface CacheEntry {
  bytes: Uint8Array;
  contentType: string;
  expiresAt: number;
}

function collectInlineObjectIds(elements: StructuralElement[] | undefined, target: string[]): void {
  for (const element of elements ?? []) {
    for (const paragraphElement of element.paragraph?.elements ?? []) {
      const objectId = paragraphElement.inlineObjectElement?.inlineObjectId;
      if (objectId) target.push(objectId);
    }
    for (const row of element.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) {
        collectInlineObjectIds(cell.content, target);
      }
    }
    collectInlineObjectIds(element.tableOfContents?.content, target);
  }
}

function imageOf(document: DocsDocument, objectId: string): InlineImage["inlineObjectProperties"] | null {
  return document.inlineObjects?.[objectId]?.inlineObjectProperties ?? null;
}

export class DocsClient implements DocsPort {
  private readonly http: HttpClient;
  private readonly cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;

  constructor(
    private readonly tokens: { getToken(): Promise<string> },
    logger: Logger,
  ) {
    this.http = new HttpClient(logger);
  }

  private async getDocument(docId: string): Promise<DocsDocument> {
    const token = await this.tokens.getToken();
    return this.http.request<DocsDocument>("GET", `${DOCS_BASE}/v1/documents/${encodeURIComponent(docId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 30_000,
    });
  }

  async listImages(docId: string): Promise<DocImageObject[]> {
    const document = await this.getDocument(docId);
    const ids: string[] = [];
    collectInlineObjectIds(document.body?.content, ids);

    const images: DocImageObject[] = [];
    for (const objectId of ids) {
      const embedded = imageOf(document, objectId)?.embeddedObject;
      if (!embedded?.imageProperties?.contentUri) continue;
      images.push({
        objectId,
        title: embedded.title ?? null,
        description: embedded.description ?? null,
      });
    }
    return images;
  }

  async getImage(docId: string, objectId: string): Promise<DocImageBytes> {
    const key = `${docId}:${objectId}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { bytes: cached.bytes, contentType: cached.contentType };
    }
    if (cached) {
      this.cache.delete(key);
      this.cacheBytes -= cached.bytes.byteLength;
    }

    const document = await this.getDocument(docId);
    const contentUri = imageOf(document, objectId)?.embeddedObject?.imageProperties?.contentUri;
    if (!contentUri) {
      throw new Error(`Google Docs API returned no image ${objectId} for document ${docId}`);
    }

    const token = await this.tokens.getToken();
    let response: Response;
    try {
      response = await fetch(contentUri, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`Cannot fetch image ${objectId} from Google: ${String(error)}`);
    }
    if (!response.ok) {
      throw new Error(`Google image ${objectId} returned HTTP ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    if (bytes.byteLength > MAX_CACHE_BYTES) {
      return { bytes, contentType };
    }
    if (this.cacheBytes + bytes.byteLength > MAX_CACHE_BYTES) {
      this.cache.clear();
      this.cacheBytes = 0;
    }
    this.cache.set(key, { bytes, contentType, expiresAt: Date.now() + IMAGE_TTL_MS });
    this.cacheBytes += bytes.byteLength;
    return { bytes, contentType };
  }
}
