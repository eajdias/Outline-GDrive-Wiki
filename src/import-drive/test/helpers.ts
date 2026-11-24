import { createLogger } from "../src/infra/logger.js";
import type { DocsPort } from "../src/ports/docs.js";
import type { DriveDoc, DrivePort } from "../src/ports/drive.js";
import type { CreateDocumentInput, OutlinePort, UpdateDocumentInput } from "../src/ports/outline.js";
import type { RagDocument, RagPort } from "../src/ports/rag.js";
import type { ImportRecord, ImportState } from "../src/ports/state.js";
import type { ImportDeps } from "../src/usecases/import-document.js";

export interface Harness {
  deps: ImportDeps;
  docs: DriveDoc[];
  html: Map<string, string>;
  records: Map<string, ImportRecord>;
  created: CreateDocumentInput[];
  updated: UpdateDocumentInput[];
  archived: string[];
  workspace: RagDocument[];
  removed: string[];
}

export function makeDoc(id: string, name: string, folderId = "folder-1", folderPath = ["Geral"]): DriveDoc {
  return {
    id,
    name,
    mimeType: "application/vnd.google-apps.document",
    modifiedTime: "2026-11-23T00:00:00Z",
    webViewLink: `https://drive.test/${id}`,
    folderId,
    folderPath,
  };
}

export function makeHarness(): Harness {
  const records = new Map<string, ImportRecord>();
  const html = new Map<string, string>();
  const created: CreateDocumentInput[] = [];
  const updated: UpdateDocumentInput[] = [];
  const archived: string[] = [];
  const removed: string[] = [];
  const workspace: RagDocument[] = [];
  let counter = 0;

  const state: ImportState = {
    get: (driveFileId) => records.get(driveFileId) ?? null,
    all: () => [...records.values()],
    upsert: (record) => {
      records.set(record.driveFileId, record);
    },
    remove: (driveFileId) => {
      records.delete(driveFileId);
    },
    getMeta: () => null,
    setMeta: () => {},
    markRun: () => {},
    close: () => {},
  };

  const docs: DocsPort = {
    listImages: async () => [],
    getImage: async () => ({ bytes: new Uint8Array(), contentType: "image/png" }),
  };

  const drive: DrivePort = {
    listDocs: async () => harness.docs,
    exportHtml: async (fileId) => html.get(fileId) ?? "",
    startPageToken: async () => "token-0",
    changes: async () => ({ docs: [], removedIds: [], nextToken: "token-1" }),
    watch: async () => ({ id: "channel", expiration: null }),
  };

  const outline: OutlinePort = {
    findCollectionByName: async (name) => (name === "General" ? "collection-1" : null),
    create: async (input) => {
      created.push(input);
      return `outline-${created.length}`;
    },
    update: async (_id, input) => {
      updated.push(input);
    },
    archive: async (id) => {
      archived.push(id);
    },
  };

  const rag: RagPort = {
    ensureWorkspace: async () => {},
    addRawText: async () => {
      counter += 1;
      return `location-${counter}`;
    },
    updateEmbeddings: async (adds, deletes) => {
      for (const location of deletes) {
        const index = workspace.findIndex((entry) => entry.location === location);
        if (index >= 0) workspace.splice(index, 1);
      }
      for (const location of adds) workspace.push({ location, title: null });
      return workspace.map((entry) => ({ ...entry }));
    },
    removeDocuments: async (locations) => {
      removed.push(...locations);
    },
    workspaceDocuments: async () => workspace.map((entry) => ({ ...entry })),
  };

  const harness: Harness = {
    deps: { drive, docs, outline, rag, state, logger: createLogger("error") },
    docs: [],
    html,
    records,
    created,
    updated,
    archived,
    workspace,
    removed,
  };

  return harness;
}
