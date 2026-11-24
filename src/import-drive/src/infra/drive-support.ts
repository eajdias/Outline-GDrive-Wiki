import { GOOGLE_DOC_MIME, GOOGLE_FOLDER_MIME } from "../domain/google.js";
import type { DriveDoc } from "../ports/drive.js";

export const FILE_FIELDS = "files(id,name,mimeType,modifiedTime,webViewLink,parents,trashed),nextPageToken";
export const CHANGE_FIELDS =
  "changes(changeType,fileId,removed,file(id,name,mimeType,modifiedTime,webViewLink,parents,trashed))," +
  "nextPageToken,newStartPageToken";

export interface DriveFilePayload {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  trashed?: boolean;
}

export interface FileListPayload {
  files?: DriveFilePayload[];
  nextPageToken?: string;
}

export interface ChangePayload {
  fileId?: string;
  removed?: boolean;
  file?: DriveFilePayload;
}

export interface ChangesPayload {
  changes?: ChangePayload[];
  nextPageToken?: string;
  newStartPageToken?: string;
}

export type Params = Record<string, string>;
export type RequestFn = <T>(method: string, path: string, params?: Params, body?: unknown) => Promise<T>;
export type FolderCache = Map<string, string[] | null>;

export function buildUrl(baseUrl: string, path: string, params: Params): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function sharedDriveParams(driveId: string | null, includeCorpora: boolean): Params {
  const params: Params = { supportsAllDrives: "true", includeItemsFromAllDrives: "true" };
  if (driveId) {
    params.driveId = driveId;
    if (includeCorpora) params.corpora = "drive";
  }
  return params;
}

export function toDoc(file: DriveFilePayload, folderId: string, folderPath: string[]): DriveDoc | null {
  if (!file.id || !file.name || !file.mimeType || !file.modifiedTime || !file.webViewLink) return null;
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    folderId,
    folderPath,
  };
}

export async function resolveFolderPath(
  request: RequestFn,
  rootFolderId: string,
  cache: FolderCache,
  folderId: string,
): Promise<string[] | null> {
  if (folderId === rootFolderId) return [];

  const cached = cache.get(folderId);
  if (cached !== undefined) return cached;

  const file = await request<DriveFilePayload>("GET", `/drive/v3/files/${folderId}`, {
    fields: "id,name,mimeType,parents",
    supportsAllDrives: "true",
  });

  const parentId = file.parents?.[0];
  if (file.mimeType !== GOOGLE_FOLDER_MIME || !parentId) {
    cache.set(folderId, null);
    return null;
  }

  const parentPath = await resolveFolderPath(request, rootFolderId, cache, parentId);
  const path = parentPath === null ? null : [...parentPath, file.name ?? ""];
  cache.set(folderId, path);
  return path;
}

export async function listAllDocs(
  request: RequestFn,
  rootFolderId: string,
  driveId: string | null,
): Promise<DriveDoc[]> {
  const docs: DriveDoc[] = [];
  const seen = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = [{ id: rootFolderId, path: [] }];

  while (queue.length > 0) {
    const folder = queue.shift();
    if (!folder) break;

    let pageToken: string | null = null;
    do {
      const params: Params = {
        q: `'${folder.id}' in parents and trashed=false`,
        fields: FILE_FIELDS,
        pageSize: "1000",
        ...sharedDriveParams(driveId, true),
      };
      if (pageToken) params.pageToken = pageToken;

      const page = await request<FileListPayload>("GET", "/drive/v3/files", params);
      for (const file of page.files ?? []) {
        if (!file.id) continue;
        if (file.mimeType === GOOGLE_FOLDER_MIME) {
          if (!seen.has(file.id)) {
            seen.add(file.id);
            queue.push({ id: file.id, path: [...folder.path, file.name ?? ""] });
          }
          continue;
        }
        if (file.mimeType !== GOOGLE_DOC_MIME) continue;
        const doc = toDoc(file, folder.id, folder.path);
        if (doc) docs.push(doc);
      }
      pageToken = page.nextPageToken ?? null;
    } while (pageToken);
  }

  return docs;
}
