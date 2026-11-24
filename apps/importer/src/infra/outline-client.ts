import type { CreateDocumentInput, OutlinePort, UpdateDocumentInput } from "../ports/outline.js";
import { HttpClient, wrapHttpError as wrap } from "@repo/http";
import type { Logger } from "@repo/logger";

const PAGE_SIZE = 100;

interface CollectionPayload {
  id?: string;
  name?: string;
}

interface CollectionListPayload {
  data?: CollectionPayload[];
}

interface DocumentPayload {
  id?: string;
}

interface DocumentResponse {
  data?: DocumentPayload;
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export class OutlineClient implements OutlinePort {
  private readonly http: HttpClient;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    logger: Logger,
  ) {
    this.http = new HttpClient(logger);
  }

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async findCollectionByName(name: string): Promise<string | null> {
    const wanted = normalizeName(name);

    try {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await this.http.request<CollectionListPayload>("POST", `${this.baseUrl}/api/collections.list`, {
          headers: this.headers,
          body: { limit: PAGE_SIZE, offset },
        });
        const collections = page.data ?? [];
        for (const collection of collections) {
          if (collection.id && collection.name && normalizeName(collection.name) === wanted) {
            return collection.id;
          }
        }
        if (collections.length < PAGE_SIZE) return null;
      }
    } catch (error) {
      throw wrap(error, `Outline collection lookup failed for "${name}"`);
    }
  }

  async create(input: CreateDocumentInput): Promise<string> {
    try {
      const response = await this.http.request<DocumentResponse>("POST", `${this.baseUrl}/api/documents.create`, {
        headers: this.headers,
        body: {
          title: input.title,
          text: input.markdown,
          collectionId: input.collectionId,
          publish: true,
        },
      });
      const id = response.data?.id;
      if (!id) {
        throw new Error("Outline returned no document id; check the collectionId and API token permissions");
      }
      return id;
    } catch (error) {
      throw wrap(error, `Outline create failed for "${input.title}"`);
    }
  }

  async update(id: string, input: UpdateDocumentInput): Promise<void> {
    try {
      await this.http.request<DocumentResponse>("POST", `${this.baseUrl}/api/documents.update`, {
        headers: this.headers,
        body: { id, title: input.title, text: input.markdown, publish: true },
      });
    } catch (error) {
      throw wrap(error, `Outline update failed for "${input.title}"`);
    }
  }

  async archive(id: string): Promise<void> {
    try {
      await this.http.request<DocumentResponse>("POST", `${this.baseUrl}/api/documents.archive`, {
        headers: this.headers,
        body: { id },
      });
    } catch (error) {
      throw wrap(error, `Outline archive failed for document ${id}`);
    }
  }
}
