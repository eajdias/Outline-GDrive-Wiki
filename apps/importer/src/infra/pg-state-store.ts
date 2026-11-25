import type { ImportRecord, ImportState } from "../ports/state.js";

export const STATE_SCHEMA = "kb_importer";

interface PostgresClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRecord(row: Record<string, unknown>): ImportRecord {
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

const SCHEMA = `
  CREATE SCHEMA IF NOT EXISTS ${STATE_SCHEMA};
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
  CREATE TABLE IF NOT EXISTS dead_letters (
    drive_file_id TEXT PRIMARY KEY,
    reason        TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 1,
    payload       TEXT,
    created_at    TEXT NOT NULL DEFAULT (now()::text),
    updated_at    TEXT NOT NULL DEFAULT (now()::text)
  );
`;

export function createPostgresStateStore(client: PostgresClient): ImportState {
  let ensured: Promise<void> | null = null;
  let tail: Promise<void> = Promise.resolve();
  const query = (text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> => {
    const result = tail.then(() => client.query(text, params));
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const ensure = (): Promise<void> => {
    ensured ??= query(SCHEMA).then(() => undefined);
    return ensured;
  };

  return {
    async get(driveFileId) {
      await ensure();
      const { rows } = await query("SELECT * FROM imports WHERE drive_file_id = $1", [driveFileId]);
      const row = rows[0];
      return row ? toRecord(row) : null;
    },
    async all() {
      await ensure();
      const { rows } = await query("SELECT * FROM imports ORDER BY title");
      return rows.map(toRecord);
    },
    async upsert(record) {
      await ensure();
      await query(
        `INSERT INTO imports (drive_file_id, outline_id, rag_path, sha256, web_view_link, modified_time, title, folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(drive_file_id) DO UPDATE SET
           outline_id = excluded.outline_id,
           rag_path = excluded.rag_path,
           sha256 = excluded.sha256,
           web_view_link = excluded.web_view_link,
           modified_time = excluded.modified_time,
           title = excluded.title,
           folder_id = excluded.folder_id`,
        [
          record.driveFileId,
          record.outlineId,
          record.ragPath,
          record.sha256,
          record.webViewLink,
          record.modifiedTime,
          record.title,
          record.folderId,
        ],
      );
    },
    async remove(driveFileId) {
      await ensure();
      await query("DELETE FROM imports WHERE drive_file_id = $1", [driveFileId]);
    },
    async getMeta(key) {
      await ensure();
      const { rows } = await query("SELECT value FROM meta WHERE key = $1", [key]);
      return nullableText(rows[0]?.value);
    },
    async setMeta(key, value) {
      await ensure();
      await query(
        "INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    },
    async markRun(kind, report) {
      await ensure();
      const now = new Date().toISOString();
      await query(
        "INSERT INTO runs (id, kind, started_at, finished_at, report) VALUES (gen_random_uuid(), $1, $2, $3, $4)",
        [kind, now, now, JSON.stringify(report)],
      );
    },
    async deadLetter(entry, payload) {
      await ensure();
      await query(
        `INSERT INTO dead_letters (drive_file_id, reason, attempts, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(drive_file_id) DO UPDATE SET
           reason = excluded.reason,
           attempts = dead_letters.attempts + 1,
           payload = excluded.payload,
           updated_at = now()::text`,
        [entry.driveFileId, entry.reason, entry.attempts, payload === undefined ? null : JSON.stringify(payload)],
      );
    },
    async close() {
      await client.end?.();
    },
  };
}
