import type { CollectionResolver } from "./collections.js";
import { importDocument, removeImportedDocument, type ImportDeps } from "./import-document.js";
import { ensurePageToken, PAGE_TOKEN_KEY } from "./page-token.js";

export interface ApplyReport {
  changes: number;
  indexed: number;
  unchanged: number;
  removed: number;
  ignored: number;
  failed: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function incrementalSync(
  deps: ImportDeps,
  resolver: CollectionResolver,
  delayMs: number,
): Promise<ApplyReport> {
  await deps.rag.ensureWorkspace();

  const pageToken = await ensurePageToken(deps);
  const changes = await deps.drive.changes(pageToken);
  const report: ApplyReport = {
    changes: changes.docs.length + changes.removedIds.length,
    indexed: 0,
    unchanged: 0,
    removed: 0,
    ignored: 0,
    failed: 0,
  };

  for (const driveFileId of changes.removedIds) {
    try {
      if (await removeImportedDocument(deps, driveFileId)) report.removed += 1;
    } catch (error) {
      report.failed += 1;
      deps.logger.error("failed to remove document", { driveFileId, error });
    }
  }

  for (const doc of changes.docs) {
    let collectionId: string | null;
    try {
      collectionId = await resolver.resolve(doc.folderId, doc.folderPath);
    } catch (error) {
      report.failed += 1;
      deps.logger.error("cannot resolve Outline collection", { title: doc.name, error });
      continue;
    }

    if (!collectionId) {
      try {
        if (await removeImportedDocument(deps, doc.id)) report.removed += 1;
        else report.ignored += 1;
      } catch (error) {
        report.failed += 1;
        deps.logger.error("failed to remove document after folder rule", { title: doc.name, error });
      }
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

  deps.state.setMeta(PAGE_TOKEN_KEY, changes.nextToken);
  deps.state.markRun("apply", report);
  return report;
}
