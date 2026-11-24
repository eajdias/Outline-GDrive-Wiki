import type { Runtime } from "../infra/context.js";
import { verifyConvergence, type DivergenceReport } from "../usecases/verify-convergence.js";

export interface VerifyResult {
  report: DivergenceReport;
  exitCode: number;
}

export async function runVerify(runtime: Runtime): Promise<VerifyResult> {
  const report = await verifyConvergence(runtime, runtime.config.drive.rootFolderId);
  return { report, exitCode: report.converged ? 0 : 1 };
}
