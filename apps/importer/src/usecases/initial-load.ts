import type { CollectionResolver } from "./collections.js";
import { importDocument, type ImportDeps } from "./import-document.js";
import { ensurePageToken } from "./page-token.js";
import type { DriveDoc } from "../ports/drive.js";

export interface SeedReport {
  driveDocs: number;
  indexed: number;
  unchanged: number;
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

export async function initialLoad(
  deps: ImportDeps,
  resolver: CollectionResolver,
  rootFolderId: string,
  delayMs: number,
  concurrency = 4,
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

  const outcomes = await mapLimit(docs, concurrency, async (doc: DriveDoc) => {
    let collectionId: string | null;
    try {
      collectionId = await resolver.resolve(doc.folderId, doc.folderPath);
    } catch (error) {
      deps.logger.error("cannot resolve Outline collection", { title: doc.name, error });
      await deps.state.deadLetter({ driveFileId: doc.id, reason: "collection-unresolved", attempts: 1 });
      return "failed";
    }

    if (!collectionId) {
      deps.logger.info("document ignored by folder rule", { title: doc.name, folderPath: doc.folderPath });
      return "ignored";
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
    else if (outcome === "ignored") report.ignored += 1;
    else report.failed += 1;
  }

  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

  await deps.state.markRun("seed", report);
  return report;
}
