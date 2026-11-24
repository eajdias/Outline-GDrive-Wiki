import { randomUUID } from "node:crypto";
import { loadConfig } from "./infra/config.js";
import { createRuntime } from "./infra/context.js";
import { createGatewayServer } from "./infra/server.js";

const config = loadConfig();
const runtime = createRuntime(config);
const server = createGatewayServer(runtime);

function shutdown(signal: string): void {
  runtime.logger.info("shutting down", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(config.server.port, config.server.host, () => {
  runtime.logger.info("llm gateway listening", {
    port: config.server.port,
    upstreams: config.upstreams.map((upstream) => ({ name: upstream.name, keys: upstream.apiKeys.length })),
    embeddingDimensions: config.embeddingDimensions,
    bootId: randomUUID(),
  });
});
