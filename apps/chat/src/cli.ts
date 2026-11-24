import { loadConfig } from "./infra/config.js";
import { createRuntime } from "./infra/context.js";
import { createChatServer } from "./infra/server.js";

const config = loadConfig();
const runtime = createRuntime(config);
const server = createChatServer(runtime);

function shutdown(signal: string): void {
  runtime.logger.info("shutting down", { signal });
  server.close(() => {
    void runtime.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(config.server.port, config.server.host, () => {
  runtime.logger.info("chat ui listening", {
    port: config.server.port,
    host: config.server.host,
    workspaces: config.anythingllm.workspaces,
  });
});
