export interface DriveDoc {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  folderId: string;
  folderPath: string[];
}

export interface DriveChanges {
  docs: DriveDoc[];
  removedIds: string[];
  nextToken: string;
}

export interface WatchResult {
  id: string;
  expiration: string | null;
}

export interface DrivePort {
  listDocs(rootFolderId: string): Promise<DriveDoc[]>;
  exportHtml(fileId: string): Promise<string>;
  startPageToken(): Promise<string>;
  changes(pageToken: string): Promise<DriveChanges>;
  watch(address: string, token: string, channelId: string): Promise<WatchResult>;
}
