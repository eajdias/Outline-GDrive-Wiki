import { GOOGLE_DOC_MIME } from "../domain/google.js";
import type { DriveChanges, DriveDoc, DrivePort, WatchResult } from "../ports/drive.js";
import {
  CHANGE_FIELDS,
  resolveFolderPath,
  sharedDriveParams,
  toDoc,
  listAllDocs,
  buildUrl,
  type ChangesPayload,
  type FolderCache,
  type Params,
  type RequestFn,
} from "./drive-support.js";
import { HttpClient } from "@repo/http";
import type { Logger } from "@repo/logger";

const API_BASE = "https://www.googleapis.com";

interface StartTokenPayload {
  startPageToken?: string;
}

interface WatchPayload {
  id?: string;
  expiration?: string;
}

export interface DriveClientOptions {
  driveId: string | null;
  rootFolderId: string;
  baseUrl?: string;
}

export class DriveClient implements DrivePort {
  private readonly request: RequestFn;
  private readonly requestText: (path: string, params?: Params) => Promise<string>;
  private readonly cache: FolderCache = new Map();

  constructor(
    tokens: { getToken(): Promise<string> },
    private readonly options: DriveClientOptions,
    logger: Logger,
  ) {
    const http = new HttpClient(logger);
    const baseUrl = options.baseUrl ?? API_BASE;
    const headers = async (): Promise<Record<string, string>> => ({
      Authorization: `Bearer ${await tokens.getToken()}`,
    });

    this.request = async <T>(method: string, path: string, params: Params = {}, body?: unknown): Promise<T> => {
      const authHeaders = await headers();
      const requestOptions = body === undefined ? { headers: authHeaders } : { headers: authHeaders, body };
      return http.request<T>(method, buildUrl(baseUrl, path, params), requestOptions);
    };

    this.requestText = async (path: string, params: Params = {}): Promise<string> => {
      return http.requestText("GET", buildUrl(baseUrl, path, params), { headers: await headers() });
    };
  }

  async listDocs(rootFolderId: string): Promise<DriveDoc[]> {
    return listAllDocs(this.request, rootFolderId, this.options.driveId);
  }

  async exportHtml(fileId: string): Promise<string> {
    return this.requestText(`/drive/v3/files/${fileId}/export`, {
      mimeType: "text/html",
      supportsAllDrives: "true",
    });
  }

  async startPageToken(): Promise<string> {
    const response = await this.request<StartTokenPayload>(
      "GET",
      "/drive/v3/changes/startPageToken",
      sharedDriveParams(this.options.driveId, false),
    );
    if (!response.startPageToken) {
      throw new Error("Google Drive returned no startPageToken; check DRIVE_ID and service account access");
    }
    return response.startPageToken;
  }

  async changes(pageToken: string): Promise<DriveChanges> {
    const docs: DriveDoc[] = [];
    const removedIds: string[] = [];
    let token = pageToken;
    let nextToken = pageToken;

    for (;;) {
      const page = await this.request<ChangesPayload>("GET", "/drive/v3/changes", {
        pageToken: token,
        pageSize: "1000",
        includeRemoved: "true",
        fields: CHANGE_FIELDS,
        ...sharedDriveParams(this.options.driveId, false),
      });

      for (const change of page.changes ?? []) {
        const fileId = change.fileId ?? change.file?.id;
        if (!fileId) continue;

        if (change.removed || change.file?.trashed) {
          removedIds.push(fileId);
          continue;
        }

        const file = change.file;
        if (!file || file.mimeType !== GOOGLE_DOC_MIME) continue;

        const folderId = file.parents?.[0] ?? this.options.rootFolderId;
        const path = await resolveFolderPath(this.request, this.options.rootFolderId, this.cache, folderId);
        if (path === null) {
          removedIds.push(fileId);
          continue;
        }
        const doc = toDoc(file, folderId, path);
        if (doc) docs.push(doc);
      }

      if (page.nextPageToken) {
        token = page.nextPageToken;
        continue;
      }
      nextToken = page.newStartPageToken ?? token;
      break;
    }

    return { docs, removedIds, nextToken };
  }

  async watch(address: string, token: string, channelId: string): Promise<WatchResult> {
    const response = await this.request<WatchPayload>(
      "POST",
      "/drive/v3/changes/watch",
      sharedDriveParams(this.options.driveId, false),
      { id: channelId, type: "web_hook", address, token },
    );
    return { id: response.id ?? channelId, expiration: response.expiration ?? null };
  }
}
