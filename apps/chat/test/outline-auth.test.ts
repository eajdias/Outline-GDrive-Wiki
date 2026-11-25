import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { test } from "node:test";
import type { Logger } from "@repo/logger";
import { OutlineSessionVerifier } from "../src/infra/outline-auth.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function outline(status: number): Promise<{ url: string; cookies: string[]; close(): Promise<void> }> {
  const cookies: string[] = [];
  const server = createServer((request, response) => {
    cookies.push(request.headers.cookie ?? "");
    response.writeHead(status);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    cookies,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("forwards only the Outline session cookie and accepts a valid session", async () => {
  const upstream = await outline(200);
  try {
    const verifier = new OutlineSessionVerifier(upstream.url, silentLogger);
    const allowed = await verifier.verify("theme=dark; accessToken=head.payload.sig; sessions=%7B%7D");

    assert.equal(allowed, true);
    assert.deepEqual(upstream.cookies, ["accessToken=head.payload.sig"]);
  } finally {
    await upstream.close();
  }
});

test("rejects missing, malformed or invalid sessions", async () => {
  const upstream = await outline(401);
  try {
    const verifier = new OutlineSessionVerifier(upstream.url, silentLogger);

    assert.equal(await verifier.verify(undefined), false);
    assert.equal(await verifier.verify("theme=dark"), false);
    assert.equal(await verifier.verify("accessToken=bad;token"), false);
    assert.equal(await verifier.verify("accessToken=invalid.token"), false);
    assert.equal(await verifier.verify("accessToken=bad.header.sig"), false);
    assert.deepEqual(upstream.cookies, ["accessToken=bad.header.sig"]);
  } finally {
    await upstream.close();
  }
});
