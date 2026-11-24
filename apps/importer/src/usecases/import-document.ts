import { hashDocument } from "../domain/hash.js";
import { rewriteImageUrls } from "../domain/images.js";
import { normalizeHtml } from "../domain/normalize.js";
import type { Logger } from "@repo/logger";
import type { DocsPort } from "../ports/docs.js";
import type { DriveDoc, DrivePort } from "../ports/drive.js";
import type { OutlinePort } from "../ports/outline.js";
import type { RagPort } from "../ports/rag.js";
import type { ImportState } from "../ports/state.js";

export type ImportOutcome = "indexed" | "unchanged";

export interface ImportDeps {
  drive: DrivePort;
  docs: DocsPort;
  outline: OutlinePort;
  rag: RagPort;
  state: ImportState;
  logger: Logger;
}

export interface ImportResult {
  outcome: ImportOutcome;
  driveFileId: string;
  title: string;
}

export async function importDocument(
  deps: ImportDeps,
  doc: DriveDoc,
  collectionId: string,
): Promise<ImportResult> {
  const existing = deps.state.get(doc.id);
  let markdown = normalizeHtml(await deps.drive.exportHtml(doc.id));

  if (markdown.includes("![")) {
    const images = await deps.docs.listImages(doc.id);
    markdown = rewriteImageUrls(
      markdown,
      doc.id,
      images.map((image) => image.objectId),
    );
  }

  const hash = hashDocument(markdown, doc.webViewLink);

  if (existing && existing.sha256 === hash && existing.outlineId && existing.ragPath) {
    if (existing.modifiedTime !== doc.modifiedTime || existing.title !== doc.name) {
      deps.state.upsert({
        ...existing,
        modifiedTime: doc.modifiedTime,
        title: doc.name,
        folderId: doc.folderId,
      });
    }
    return { outcome: "unchanged", driveFileId: doc.id, title: doc.name };
  }

  let outlineId = existing?.outlineId ?? null;
  if (outlineId) {
    await deps.outline.update(outlineId, { title: doc.name, markdown });
  } else {
    outlineId = await deps.outline.create({ title: doc.name, markdown, collectionId });
  }

  deps.state.upsert({
    driveFileId: doc.id,
    outlineId,
    ragPath: null,
    sha256: hash,
    webViewLink: doc.webViewLink,
    modifiedTime: doc.modifiedTime,
    title: doc.name,
    folderId: doc.folderId,
  });

  const location = await deps.rag.addRawText({ title: doc.name, text: markdown, url: doc.webViewLink });
  const previous = existing?.ragPath ?? null;

  let workspace;
  try {
    workspace = await deps.rag.updateEmbeddings([location], previous ? [previous] : []);
  } catch (error) {
    await deps.rag.removeDocuments([location]).catch((cleanupError: unknown) => {
      deps.logger.error("failed to roll back unembedded document", {
        driveFileId: doc.id,
        location,
        error: cleanupError,
      });
    });
    throw error;
  }

  if (!workspace.some((entry) => entry.location === location)) {
    await deps.rag.removeDocuments([location]).catch((cleanupError: unknown) => {
      deps.logger.error("failed to roll back unembedded document", {
        driveFileId: doc.id,
        location,
        error: cleanupError,
      });
    });
    throw new Error(
      `AnythingLLM did not register "${doc.name}"; the embedding step failed or the document was dropped`,
    );
  }

  if (previous && previous !== location) {
    await deps.rag.removeDocuments([previous]);
  }

  deps.state.upsert({
    driveFileId: doc.id,
    outlineId,
    ragPath: location,
    sha256: hash,
    webViewLink: doc.webViewLink,
    modifiedTime: doc.modifiedTime,
    title: doc.name,
    folderId: doc.folderId,
  });

  deps.logger.info("document indexed", {
    driveFileId: doc.id,
    title: doc.name,
    location,
    replaced: previous,
  });

  return { outcome: "indexed", driveFileId: doc.id, title: doc.name };
}

export async function removeImportedDocument(deps: ImportDeps, driveFileId: string): Promise<boolean> {
  const record = deps.state.get(driveFileId);
  if (!record) return false;

  if (record.outlineId) {
    await deps.outline.archive(record.outlineId);
  }
  if (record.ragPath) {
    await deps.rag.updateEmbeddings([], [record.ragPath]);
    await deps.rag.removeDocuments([record.ragPath]);
  }
  deps.state.remove(driveFileId);
  deps.logger.info("document removed from destinations", {
    driveFileId,
    title: record.title,
  });
  return true;
}
