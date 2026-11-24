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

export interface DeadLetter {
  driveFileId: string;
  reason: string;
  attempts: number;
}

export interface ImportState {
  get(driveFileId: string): Promise<ImportRecord | null>;
  all(): Promise<ImportRecord[]>;
  upsert(record: ImportRecord): Promise<void>;
  remove(driveFileId: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  markRun(kind: string, report: unknown): Promise<void>;
  deadLetter(entry: DeadLetter, payload?: unknown): Promise<void>;
  close(): Promise<void> | void;
}
