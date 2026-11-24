import { createCollectionResolver, type CollectionResolver } from "../usecases/collections.js";
import type { ImportDeps } from "../usecases/import-document.js";
import { createLogger, type Logger } from "@repo/logger";
import type { Config } from "./config.js";
import { DocsClient } from "./docs-client.js";
import { DriveClient } from "./drive-client.js";
import { GoogleTokenProvider } from "./drive-auth.js";
import { OutlineClient } from "./outline-client.js";
import { RagClient } from "./rag-client.js";
import { SqliteStateStore } from "./state-store.js";

export interface Runtime extends ImportDeps {
  config: Config;
  logger: Logger;
  resolver: CollectionResolver;
  close(): void;
}

export function createRuntime(config: Config): Runtime {
  const logger = createLogger("importer", config.logLevel);
  const tokens = new GoogleTokenProvider(config.drive.saKeyPath);
  const drive = new DriveClient(
    tokens,
    { driveId: config.drive.driveId, rootFolderId: config.drive.rootFolderId },
    logger,
  );
  const docs = new DocsClient(tokens, logger);
  const outline = new OutlineClient(config.outline.apiUrl, config.outline.apiKey, logger);
  const rag = new RagClient(config.rag.baseUrl, config.rag.apiKey, config.rag.workspace, logger);
  const state = new SqliteStateStore(config.state.dbPath);
  const resolver = createCollectionResolver(outline, {
    collectionMap: config.outline.collectionMap,
    defaultCollectionId: config.outline.defaultCollectionId,
    ignoreFolders: config.drive.ignoreFolders,
  });

  return {
    config,
    logger,
    drive,
    docs,
    outline,
    rag,
    state,
    resolver,
    close: () => state.close(),
  };
}
