export interface ImportRecord {
  driveFileId: string;
  outlineId: string | null;
  ragPath: string | null;
  sha256: string;
  webViewLink: string;
  modifiedTime: string;
  title: string;
  folderId: string;
}

export interface ImportState {
  get(driveFileId: string): ImportRecord | null;
  all(): ImportRecord[];
  upsert(record: ImportRecord): void;
  remove(driveFileId: string): void;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  markRun(kind: string, report: unknown): void;
  close(): void;
}
