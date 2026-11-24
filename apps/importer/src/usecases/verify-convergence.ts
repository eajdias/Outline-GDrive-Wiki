import type { ImportDeps } from "./import-document.js";

export interface DivergenceReport {
  driveDocs: number;
  stateDocs: number;
  workspaceDocs: number;
  missing: string[];
  extra: string[];
  stale: string[];
  workspaceMissing: string[];
  workspaceOrphan: string[];
  converged: boolean;
}

export async function verifyConvergence(deps: ImportDeps, rootFolderId: string): Promise<DivergenceReport> {
  const docs = await deps.drive.listDocs(rootFolderId);
  const records = deps.state.all();
  const workspace = await deps.rag.workspaceDocuments();

  const docIds = new Set(docs.map((doc) => doc.id));
  const workspaceLocations = new Set(workspace.map((document) => document.location));
  const stateLocations = new Set(
    records.map((record) => record.ragPath).filter((location): location is string => location !== null),
  );

  const missing: string[] = [];
  const stale: string[] = [];

  for (const doc of docs) {
    const record = deps.state.get(doc.id);
    if (!record) {
      missing.push(doc.name);
      continue;
    }
    if (record.modifiedTime !== doc.modifiedTime) stale.push(doc.name);
  }

  const extra = records.filter((record) => !docIds.has(record.driveFileId)).map((record) => record.title);
  const workspaceMissing = records
    .filter((record) => record.ragPath !== null && !workspaceLocations.has(record.ragPath))
    .map((record) => record.title);
  const workspaceOrphan = workspace
    .filter((document) => !stateLocations.has(document.location))
    .map((document) => document.location);

  const report: DivergenceReport = {
    driveDocs: docs.length,
    stateDocs: records.length,
    workspaceDocs: workspace.length,
    missing,
    extra,
    stale,
    workspaceMissing,
    workspaceOrphan,
    converged: false,
  };

  report.converged =
    missing.length === 0 &&
    extra.length === 0 &&
    stale.length === 0 &&
    workspaceMissing.length === 0 &&
    workspaceOrphan.length === 0;

  return report;
}
