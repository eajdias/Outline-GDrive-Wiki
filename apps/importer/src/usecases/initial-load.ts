import type { CollectionResolver } from "./collections.js";
import { importDocument, type ImportDeps } from "./import-document.js";
import { ensurePageToken } from "./page-token.js";

export interface SeedReport {
  driveDocs: number;
  indexed: number;
  unchanged: number;
  ignored: number;
  failed: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initialLoad(
  deps: ImportDeps,
  resolver: CollectionResolver,
  rootFolderId: string,
  delayMs: number,
): Promise<SeedReport> {
  await deps.rag.ensureWorkspace();
  await ensurePageToken(deps);

  const docs = await deps.drive.listDocs(rootFolderId);
  const report: SeedReport = {
    driveDocs: docs.length,
    indexed: 0,
    unchanged: 0,
    ignored: 0,
    failed: 0,
  };

  for (const doc of docs) {
    let collectionId: string | null;
    try {
      collectionId = await resolver.resolve(doc.folderId, doc.folderPath);
    } catch (error) {
      report.failed += 1;
      deps.logger.error("cannot resolve Outline collection", { title: doc.name, error });
      continue;
    }

    if (!collectionId) {
      report.ignored += 1;
      deps.logger.info("document ignored by folder rule", { title: doc.name, folderPath: doc.folderPath });
      continue;
    }

    try {
      const result = await importDocument(deps, doc, collectionId);
      if (result.outcome === "indexed") report.indexed += 1;
      else report.unchanged += 1;
    } catch (error) {
      report.failed += 1;
      deps.logger.error("failed to import document", { title: doc.name, driveFileId: doc.id, error });
    }

    if (delayMs > 0) await wait(delayMs);
  }

  deps.state.markRun("seed", report);
  return report;
}
