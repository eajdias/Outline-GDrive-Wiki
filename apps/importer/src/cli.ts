import { pathToFileURL } from "node:url";
import { runApply } from "./commands/apply.js";
import { runSeed } from "./commands/seed.js";
import { runServe } from "./commands/serve.js";
import { runVerify } from "./commands/verify.js";
import { loadConfig } from "./infra/config.js";
import { createRuntime, type Runtime } from "./infra/context.js";

export type Command = "seed" | "apply" | "verify" | "serve";

export function parseCommand(argv: string[]): Command | null {
  const [command] = argv;
  if (command === "seed" || command === "apply" || command === "verify" || command === "serve") {
    return command;
  }
  return null;
}

function serveUntilSignal(runtime: Runtime): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    runServe(runtime)
      .then((running) => {
        const shutdown = (): void => {
          void running.close().finally(() => resolve());
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
      })
      .catch(reject);
  });
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));
  if (!command) {
    process.stderr.write("usage: import-drive <seed|apply|verify|serve>\n");
    process.exitCode = 2;
    return;
  }

  const runtime = await createRuntime(loadConfig());

  try {
    if (command === "serve") {
      await serveUntilSignal(runtime);
      return;
    }
    if (command === "seed") {
      runtime.logger.info("seed finished", { ...(await runSeed(runtime)) });
      return;
    }
    if (command === "apply") {
      runtime.logger.info("apply finished", { ...(await runApply(runtime)) });
      return;
    }

    const result = await runVerify(runtime);
    runtime.logger.info("verify finished", { ...result.report });
    process.exitCode = result.exitCode;
  } finally {
    await runtime.close();
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
