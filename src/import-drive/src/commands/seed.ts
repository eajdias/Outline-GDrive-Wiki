import type { Runtime } from "../infra/context.js";
import { initialLoad, type SeedReport } from "../usecases/initial-load.js";

export function runSeed(runtime: Runtime): Promise<SeedReport> {
  return initialLoad(
    runtime,
    runtime.resolver,
    runtime.config.drive.rootFolderId,
    runtime.config.drive.documentDelayMs,
  );
}
