import type { RagDocument, RagPort, RawTextInput } from "../ports/rag.js";
import { HttpError, HttpClient } from "./http.js";
import type { Logger } from "./logger.js";

interface WorkspacePayload {
  workspace?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function workspaceOf(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  const workspace = record?.workspace;
  if (Array.isArray(workspace)) return asRecord(workspace[0]);
  return asRecord(workspace);
}

function workspaceDocumentsFrom(payload: unknown): RagDocument[] {
  const workspace = workspaceOf(payload);
  const documents = workspace?.documents;
  if (!Array.isArray(documents)) return [];

  const result: RagDocument[] = [];
  for (const entry of documents) {
    const record = asRecord(entry);
    const location = asString(record?.docpath);
    if (!location) continue;
    result.push({ location, title: asString(record?.title) });
  }
  return result;
}

function wrap(error: unknown, action: string): Error {
  if (error instanceof HttpError) {
    return new Error(`${action}: ${error.message} — ${error.body.slice(0, 200)}`);
  }
  return error instanceof Error ? error : new Error(`${action}: ${String(error)}`);
}

export class RagClient implements RagPort {
  private readonly http: HttpClient;
  private readonly workspacePath: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly workspace: string,
    logger: Logger,
  ) {
    this.http = new HttpClient(logger);
    this.workspacePath = `${baseUrl}/api/v1/workspace/${encodeURIComponent(workspace)}`;
  }

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async ensureWorkspace(): Promise<void> {
    try {
      const existing = await this.http.request<WorkspacePayload>("GET", this.workspacePath, { headers: this.headers });
      if (workspaceOf(existing)) return;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status >= 500) {
        throw wrap(error, `AnythingLLM workspace lookup failed for "${this.workspace}"`);
      }
    }

    try {
      await this.http.request<WorkspacePayload>("POST", `${this.baseUrl}/api/v1/workspace/new`, {
        headers: this.headers,
        body: { name: this.workspace },
      });
    } catch (error) {
      throw wrap(error, `AnythingLLM workspace creation failed for "${this.workspace}"`);
    }
  }

  async addRawText(input: RawTextInput): Promise<string> {
    try {
      const response = await this.http.request<{ documents?: unknown[] }>(
        "POST",
        `${this.baseUrl}/api/v1/document/raw-text`,
        {
          headers: this.headers,
          body: {
            textContent: input.text,
            metadata: { title: input.title, url: input.url, description: input.title, origin: "drive" },
          },
        },
      );
      const documents = Array.isArray(response.documents) ? response.documents : [];
      const location = asString(asRecord(documents[0])?.location);
      if (!location) {
        throw new Error("AnythingLLM returned no document location; check the workspace and embedding configuration");
      }
      return location;
    } catch (error) {
      throw wrap(error, `AnythingLLM raw-text failed for "${input.title}"`);
    }
  }

  async updateEmbeddings(adds: string[], deletes: string[]): Promise<RagDocument[]> {
    if (adds.length === 0 && deletes.length === 0) return [];

    try {
      const response = await this.http.request<unknown>("POST", `${this.workspacePath}/update-embeddings`, {
        headers: this.headers,
        body: { adds, deletes },
      });
      return workspaceDocumentsFrom(response);
    } catch (error) {
      throw wrap(error, `AnythingLLM update-embeddings failed for workspace "${this.workspace}"`);
    }
  }

  async removeDocuments(locations: string[]): Promise<void> {
    if (locations.length === 0) return;

    try {
      await this.http.request<unknown>("DELETE", `${this.baseUrl}/api/v1/system/remove-documents`, {
        headers: this.headers,
        body: { names: locations },
      });
    } catch (error) {
      throw wrap(error, `AnythingLLM remove-documents failed for workspace "${this.workspace}"`);
    }
  }

  async workspaceDocuments(): Promise<RagDocument[]> {
    try {
      const response = await this.http.request<unknown>("GET", this.workspacePath, { headers: this.headers });
      return workspaceDocumentsFrom(response);
    } catch (error) {
      throw wrap(error, `AnythingLLM workspace read failed for "${this.workspace}"`);
    }
  }
}
