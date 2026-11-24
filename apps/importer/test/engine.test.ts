import assert from "node:assert/strict";
import { test } from "node:test";
import { initialLoad } from "../src/usecases/initial-load.js";
import { importDocument, removeImportedDocument } from "../src/usecases/import-document.js";
import { makeDoc, makeHarness } from "./helpers.js";

test("imports a new document into both destinations", async () => {
  const harness = makeHarness();
  harness.html.set("d1", "<h1>Manual</h1>");

  const result = await importDocument(harness.deps, makeDoc("d1", "Manual"), "collection-1");

  assert.equal(result.outcome, "indexed");
  assert.equal(harness.created.length, 1);
  assert.equal(harness.created[0]?.collectionId, "collection-1");
  assert.equal(harness.workspace.length, 1);
  assert.equal(harness.records.get("d1")?.ragPath, "location-1");
});

test("is idempotent: same hash does not reindex", async () => {
  const harness = makeHarness();
  harness.html.set("d1", "<h1>Manual</h1>");
  const doc = makeDoc("d1", "Manual");

  await importDocument(harness.deps, doc, "collection-1");
  const second = await importDocument(harness.deps, doc, "collection-1");

  assert.equal(second.outcome, "unchanged");
  assert.equal(harness.created.length, 1);
  assert.equal(harness.workspace.length, 1);
});

test("updates Outline and swaps the vector when the content changes", async () => {
  const harness = makeHarness();
  harness.html.set("d1", "<h1>Manual</h1>");
  await importDocument(harness.deps, makeDoc("d1", "Manual"), "collection-1");

  harness.html.set("d1", "<h1>Manual v2</h1>");
  const changed = await importDocument(
    harness.deps,
    { ...makeDoc("d1", "Manual"), modifiedTime: "2026-11-24T00:00:00Z" },
    "collection-1",
  );

  assert.equal(changed.outcome, "indexed");
  assert.equal(harness.created.length, 1);
  assert.equal(harness.updated.length, 1);
  assert.deepEqual(harness.removed, ["location-1"]);
  assert.deepEqual(harness.records.get("d1")?.ragPath, "location-2");
});

test("rewrites inline images to the drive image proxy", async () => {
  const harness = makeHarness();
  harness.html.set("d1", '<h1>Manual</h1><p><img src="https://lh3.googleusercontent.com/x" alt="Fluxo"></p>');
  harness.deps.docs = {
    listImages: async () => [{ objectId: "kix1", title: "Fluxo", description: null }],
    getImage: async () => ({ bytes: new Uint8Array(), contentType: "image/png" }),
  };

  await importDocument(harness.deps, makeDoc("d1", "Manual"), "collection-1");

  assert.match(harness.created[0]?.markdown ?? "", /!\[Fluxo\]\(\/drive-image\/d1\/kix1\)/);
});

test("removes a document from Outline, index and state", async () => {
  const harness = makeHarness();
  harness.html.set("d1", "<h1>Manual</h1>");
  await importDocument(harness.deps, makeDoc("d1", "Manual"), "collection-1");

  assert.equal(await removeImportedDocument(harness.deps, "d1"), true);
  assert.deepEqual(harness.archived, ["outline-1"]);
  assert.deepEqual(harness.removed, ["location-1"]);
  assert.equal(harness.records.get("d1"), undefined);
  assert.equal(await removeImportedDocument(harness.deps, "missing"), false);
});

test("initial load skips ignored folders and reports counts", async () => {
  const harness = makeHarness();
  harness.docs = [
    makeDoc("d1", "Doc Geral", "folder-1", ["Geral"]),
    makeDoc("d2", "Doc n8n", "folder-2", ["drafts"]),
  ];
  harness.html.set("d1", "<h1>A</h1>");
  harness.html.set("d2", "<h1>B</h1>");

  const resolver = {
    resolve: async (folderId: string): Promise<string | null> => (folderId === "folder-2" ? null : "collection-1"),
  };

  const report = await initialLoad(harness.deps, resolver, "root", 0);

  assert.deepEqual(report, { driveDocs: 2, indexed: 1, unchanged: 0, ignored: 1, failed: 0 });
  assert.equal(harness.created.length, 1);
});
