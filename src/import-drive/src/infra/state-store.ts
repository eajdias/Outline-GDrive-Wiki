import { randomUUID } from "node:crypto";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import type { ImportRecord, ImportState } from "../ports/state.js";

type Row = Record<string, SQLOutputValue>;

function text(value: SQLOutputValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: SQLOutputValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function toRecord(row: Row): ImportRecord {
  return {
    driveFileId: text(row.drive_file_id),
    outlineId: nullableText(row.outline_id),
    ragPath: nullableText(row.rag_path),
    sha256: text(row.sha256),
    webViewLink: text(row.web_view_link),
    modifiedTime: text(row.modified_time),
    title: text(row.title),
    folderId: text(row.folder_id),
  };
}

export class SqliteStateStore implements ImportState {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imports (
        drive_file_id TEXT PRIMARY KEY,
        outline_id    TEXT,
        rag_path      TEXT,
        sha256        TEXT NOT NULL,
        web_view_link TEXT NOT NULL,
        modified_time TEXT NOT NULL,
        title         TEXT NOT NULL,
        folder_id     TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL,
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        report      TEXT
      );
    `);
  }

  get(driveFileId: string): ImportRecord | null {
    const row = this.db.prepare("SELECT * FROM imports WHERE drive_file_id = ?").get(driveFileId) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  all(): ImportRecord[] {
    const rows = this.db.prepare("SELECT * FROM imports ORDER BY title").all() as Row[];
    return rows.map(toRecord);
  }

  upsert(record: ImportRecord): void {
    this.db
      .prepare(
        `INSERT INTO imports (drive_file_id, outline_id, rag_path, sha256, web_view_link, modified_time, title, folder_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(drive_file_id) DO UPDATE SET
           outline_id = excluded.outline_id,
           rag_path = excluded.rag_path,
           sha256 = excluded.sha256,
           web_view_link = excluded.web_view_link,
           modified_time = excluded.modified_time,
           title = excluded.title,
           folder_id = excluded.folder_id`,
      )
      .run(
        record.driveFileId,
        record.outlineId,
        record.ragPath,
        record.sha256,
        record.webViewLink,
        record.modifiedTime,
        record.title,
        record.folderId,
      );
  }

  remove(driveFileId: string): void {
    this.db.prepare("DELETE FROM imports WHERE drive_file_id = ?").run(driveFileId);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as Row | undefined;
    return nullableText(row?.value);
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  markRun(kind: string, report: unknown): void {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO runs (id, kind, started_at, finished_at, report) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), kind, now, now, JSON.stringify(report));
  }

  close(): void {
    this.db.close();
  }
}
