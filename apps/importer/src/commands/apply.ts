import type { Runtime } from "../infra/context.js";
import { incrementalSync, type ApplyReport } from "../usecases/incremental-sync.js";

export function runApply(runtime: Runtime): Promise<ApplyReport> {
  return incrementalSync(runtime, runtime.resolver, runtime.config.drive.documentDelayMs, runtime.config.drive.concurrency);
}
