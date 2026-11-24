import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { test } from "node:test";
import type { Logger } from "@repo/logger";
import { createRedisClient, tryParseReply } from "../src/infra/redis-client.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function fakeRedis(handler: (socket: Socket) => void): Promise<{ url: string; close: () => void }> {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ url: `redis://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

test("parses integer arrays, errors and bulk strings", () => {
  const parse = (raw: string) => tryParseReply(Buffer.from(raw));
  assert.deepEqual(parse("*2\r\n:1\r\n:0\r\n")?.value, [1, 0]);
  assert.equal(parse("+OK\r\n")?.value, "OK");
  assert.ok(parse("-ERR boom\r\n")?.value instanceof Error);
  assert.equal(parse("*2\r\n:1\r\n"), null);
});

test("resolves the reply from a healthy connection", async () => {
  const server = await fakeRedis((socket) => socket.once("data", () => socket.write("*2\r\n:1\r\n:0\r\n")));
  const client = createRedisClient(server.url, silentLogger);

  try {
    assert.deepEqual(await client.eval("return 1", [], []), [1, 0]);
  } finally {
    await client.quit();
    server.close();
  }
});

test("rejects instead of hanging when the connection closes without a reply", async () => {
  const server = await fakeRedis((socket) => socket.once("data", () => socket.end()));
  const client = createRedisClient(server.url, silentLogger);

  try {
    await assert.rejects(client.eval("return 1", [], []), /closed/);
  } finally {
    await client.quit();
    server.close();
  }
});

test("reconnects and serves the next command after a dropped connection", async () => {
  let connections = 0;
  const server = await fakeRedis((socket) => {
    connections += 1;
    socket.once("data", () => {
      if (connections === 1) socket.destroy();
      else socket.write(":7\r\n");
    });
  });
  const client = createRedisClient(server.url, silentLogger);

  try {
    await assert.rejects(client.eval("return 1", [], []));
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    assert.equal(await client.eval("return 7", [], []), 7);
  } finally {
    await client.quit();
    server.close();
  }
});
