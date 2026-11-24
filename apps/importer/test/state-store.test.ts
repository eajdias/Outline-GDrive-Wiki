import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SqliteStateStore } from "../src/infra/state-store.js";
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

test("persists upsert, update, remove and meta across reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "import-drive-"));
  const dbPath = join(dir, "imports.db");

  try {
    const store = new SqliteStateStore(dbPath);
    store.upsert(RECORD);
    store.setMeta("drive_page_token", "token-1");
    store.markRun("seed", { indexed: 1 });

    assert.deepEqual(store.get("drive-1"), RECORD);
    assert.equal(store.all().length, 1);
    assert.equal(store.getMeta("drive_page_token"), "token-1");

    store.upsert({ ...RECORD, sha256: "def", ragPath: null });
    assert.equal(store.get("drive-1")?.sha256, "def");
    assert.equal(store.get("drive-1")?.ragPath, null);
    store.close();

    const reopened = new SqliteStateStore(dbPath);
    assert.equal(reopened.get("drive-1")?.sha256, "def");
    reopened.remove("drive-1");
    assert.equal(reopened.get("drive-1"), null);
    assert.equal(reopened.all().length, 0);
    reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
