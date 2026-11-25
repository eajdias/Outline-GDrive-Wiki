import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresStateStore } from "../src/infra/pg-state-store.js";
import type { ImportRecord } from "../src/ports/state.js";

const RECORD: ImportRecord = {
  driveFileId: "drive-1",
  outlineId: "outline-1",
  ragPath: "custom-documents/1.json",
  sha256: "abc",
  webViewLink: "https://drive.test/1",
  modifiedTime: "2026-11-23T00:00:00Z",
  title: "Manual",
  folderId: "folder-1",
};

function mockClient() {
  const imports = new Map<string, ImportRecord>();
  const meta = new Map<string, string>();
  const statements: string[] = [];

  function toRow(record: ImportRecord): Record<string, unknown> {
    return {
      drive_file_id: record.driveFileId,
      outline_id: record.outlineId,
      rag_path: record.ragPath,
      sha256: record.sha256,
      web_view_link: record.webViewLink,
      modified_time: record.modifiedTime,
      title: record.title,
      folder_id: record.folderId,
    };
  }

  return {
    statements,
    query: async (text: string, params: unknown[] = []) => {
      const normalized = text.trimStart().replace(/\s+/g, " ");
      statements.push(normalized.slice(0, 40));
      if (normalized.startsWith("CREATE TABLE")) return { rows: [] };
      if (normalized.startsWith("SELECT * FROM imports WHERE")) {
        const record = imports.get(params[0] as string);
        return { rows: record ? [toRow(record)] : [] };
      }
      if (normalized.startsWith("SELECT * FROM imports ORDER")) {
        return { rows: [...imports.values()].map(toRow) };
      }
      if (normalized.startsWith("INSERT INTO imports")) {
        const [driveFileId, outlineId, ragPath, sha256, webViewLink, modifiedTime, title, folderId] = params as [
          string,
          string | null,
          string | null,
          string,
          string,
          string,
          string,
          string,
        ];
        imports.set(driveFileId, {
          driveFileId,
          outlineId,
          ragPath,
          sha256,
          webViewLink,
          modifiedTime,
          title,
          folderId,
        });
        return { rows: [] };
      }
      if (normalized.startsWith("DELETE FROM imports")) {
        imports.delete(params[0] as string);
        return { rows: [] };
      }
      if (normalized.startsWith("SELECT value FROM meta")) {
        const value = meta.get(params[0] as string);
        return { rows: value ? [{ value }] : [] };
      }
      if (normalized.startsWith("INSERT INTO meta")) {
        meta.set(params[0] as string, params[1] as string);
        return { rows: [] };
      }
      if (normalized.startsWith("INSERT INTO runs")) return { rows: [] };
      if (normalized.startsWith("INSERT INTO dead_letters")) return { rows: [] };
      throw new Error(`unexpected query: ${normalized.slice(0, 80)}`);
    },
  };
}

test("upserts, reads, removes and tracks meta over the same store", async () => {
  const client = mockClient();
  const store = createPostgresStateStore(client);

  await store.upsert(RECORD);
  await store.setMeta("drive_page_token", "token-1");
  await store.markRun("seed", { indexed: 1 });

  assert.deepEqual(await store.get("drive-1"), RECORD);
  assert.equal((await store.all()).length, 1);
  assert.equal(await store.getMeta("drive_page_token"), "token-1");

  await store.upsert({ ...RECORD, sha256: "def", ragPath: null });
  assert.equal((await store.get("drive-1"))?.sha256, "def");
  assert.equal((await store.get("drive-1"))?.ragPath, null);

  await store.remove("drive-1");
  assert.equal(await store.get("drive-1"), null);
  assert.equal((await store.all()).length, 0);

  await store.close();
});

test("creates schema on first use", async () => {
  const client = mockClient();
  const store = createPostgresStateStore(client);

  await store.get("missing");

  assert.ok(client.statements.some((statement) => statement.startsWith("CREATE TABLE")));
  await store.close();
});

test("records dead letters without throwing", async () => {
  const client = mockClient();
  const store = createPostgresStateStore(client);

  await store.deadLetter({ driveFileId: "d9", reason: "import-failed", attempts: 1 }, { title: "Doc 9" });
  await store.deadLetter({ driveFileId: "d9", reason: "import-failed", attempts: 2 }, { title: "Doc 9" });

  assert.ok(
    client.statements.some((statement) => statement.startsWith("INSERT INTO dead_letters")),
  );
  await store.close();
});

test("serializes queries on the shared pg client", async () => {
  let active = 0;
  let maxActive = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const client = {
    query: async (text: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (text.startsWith("CREATE TABLE")) {
        active -= 1;
        return { rows: [] };
      }
      await gate;
      active -= 1;
      return { rows: [] };
    },
    end: async () => undefined,
  };

  const store = createPostgresStateStore(client);
  const first = store.get("drive-1");
  const second = store.get("drive-2");
  await new Promise<void>((resolve) => setImmediate(resolve));

  try {
    assert.equal(active, 1);
  } finally {
    release();
  }
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  await store.close();
});
