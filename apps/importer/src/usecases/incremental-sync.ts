import type { CollectionResolver } from "./collections.js";
import { importDocument, removeImportedDocument, type ImportDeps } from "./import-document.js";
import { ensurePageToken, PAGE_TOKEN_KEY } from "./page-token.js";
import type { DriveDoc } from "../ports/drive.js";

export interface ApplyReport {
  changes: number;
  indexed: number;
  unchanged: number;
  removed: number;
  ignored: number;
  failed: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(null).map(async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function incrementalSync(
  deps: ImportDeps,
  resolver: CollectionResolver,
  delayMs: number,
  concurrency = 4,
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

  const removals = await mapLimit(changes.removedIds, concurrency, async (driveFileId) => {
    try {
      return (await removeImportedDocument(deps, driveFileId)) ? "removed" : "missing";
    } catch (error) {
      deps.logger.error("failed to remove document", { driveFileId, error });
      await deps.state.deadLetter({ driveFileId, reason: "remove-failed", attempts: 1 }, String(error));
      return "failed";
    }
  });
  for (const outcome of removals) {
    if (outcome === "removed") report.removed += 1;
    else if (outcome === "failed") report.failed += 1;
  }

  const outcomes = await mapLimit(changes.docs, concurrency, async (doc: DriveDoc) => {
    let collectionId: string | null;
    try {
      collectionId = await resolver.resolve(doc.folderId, doc.folderPath);
    } catch (error) {
      deps.logger.error("cannot resolve Outline collection", { title: doc.name, error });
      await deps.state.deadLetter({ driveFileId: doc.id, reason: "collection-unresolved", attempts: 1 });
      return "failed";
    }

    if (!collectionId) {
      try {
        if (await removeImportedDocument(deps, doc.id)) return "removed";
        return "ignored";
      } catch (error) {
        deps.logger.error("failed to remove document after folder rule", { title: doc.name, error });
        await deps.state.deadLetter({ driveFileId: doc.id, reason: "remove-after-rule-failed", attempts: 1 });
        return "failed";
      }
    }

    try {
      const result = await importDocument(deps, doc, collectionId);
      return result.outcome;
    } catch (error) {
      deps.logger.error("failed to import document", { title: doc.name, driveFileId: doc.id, error });
      await deps.state.deadLetter({ driveFileId: doc.id, reason: "import-failed", attempts: 1 }, { title: doc.name });
      return "failed";
    }
  });

  for (const outcome of outcomes) {
    if (outcome === "indexed") report.indexed += 1;
    else if (outcome === "unchanged") report.unchanged += 1;
    else if (outcome === "removed") report.removed += 1;
    else if (outcome === "ignored") report.ignored += 1;
    else report.failed += 1;
  }

  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

  await deps.state.setMeta(PAGE_TOKEN_KEY, changes.nextToken);
  await deps.state.markRun("apply", report);
  return report;
}
