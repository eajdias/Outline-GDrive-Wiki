import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImportRecord } from "../src/ports/state.js";
import { verifyConvergence } from "../src/usecases/verify-convergence.js";
import { makeDoc, makeHarness } from "./helpers.js";

function record(overrides: Partial<ImportRecord> & Pick<ImportRecord, "driveFileId" | "title">): ImportRecord {
  return {
    outlineId: `outline-${overrides.driveFileId}`,
    ragPath: `location-${overrides.driveFileId}`,
    sha256: "hash",
    webViewLink: `https://drive.test/${overrides.driveFileId}`,
    modifiedTime: "2026-11-23T00:00:00Z",
    folderId: "folder-1",
    ...overrides,
  };
}

test("reports convergence when drive, state and workspace agree", async () => {
  const harness = makeHarness();
  harness.docs = [makeDoc("d1", "Manual")];
  harness.records.set("d1", record({ driveFileId: "d1", title: "Manual" }));
  harness.workspace.push({ location: "location-d1", title: "Manual" });

  const report = await verifyConvergence(harness.deps, "root");

  assert.equal(report.converged, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.stale, []);
  assert.deepEqual(report.workspaceMissing, []);
  assert.deepEqual(report.workspaceOrphan, []);
});

test("reports every class of divergence", async () => {
  const harness = makeHarness();
  harness.docs = [makeDoc("d1", "Manual"), makeDoc("d2", "Sem estado")];
  harness.records.set(
    "d1",
    record({ driveFileId: "d1", title: "Manual", modifiedTime: "2026-11-22T00:00:00Z", ragPath: "location-missing" }),
  );
  harness.records.set("d3", record({ driveFileId: "d3", title: "Fora do Drive", ragPath: null }));
  harness.workspace.push({ location: "orphan-location", title: null });

  const report = await verifyConvergence(harness.deps, "root");

  assert.equal(report.converged, false);
  assert.deepEqual(report.missing, ["Sem estado"]);
  assert.deepEqual(report.extra, ["Fora do Drive"]);
  assert.deepEqual(report.stale, ["Manual"]);
  assert.deepEqual(report.workspaceMissing, ["Manual"]);
  assert.deepEqual(report.workspaceOrphan, ["orphan-location"]);
});
