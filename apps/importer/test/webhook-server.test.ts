import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "@repo/logger";
import { createWebhookServer, type WebhookStatus } from "../src/infra/webhook-server.js";

const logger = createLogger("test", "error");

test("proxies images for known documents and rejects unknown ones", async () => {
  const status: WebhookStatus = {
    channelId: null,
    expiration: null,
    lastEventAt: null,
    lastApplyAt: null,
    lastApplyReport: null,
  };

  const server = createWebhookServer({
    port: 0,
    expectedToken: null,
    logger,
    onEvent: () => {},
    status: () => status,
    onImage: async ({ docId, objectId }) => {
      assert.equal(docId, "d1");
      assert.equal(objectId, "kix1");
      return { bytes: new Uint8Array([137, 80, 78, 71]), contentType: "image/png" };
    },
    isKnownDoc: (docId) => docId === "d1",
  });

  await server.listen();
  const base = `http://127.0.0.1:${server.port()}`;

  try {
    const known = await fetch(`${base}/drive-image/d1/kix1`);
    assert.equal(known.status, 200);
    assert.equal(known.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await known.arrayBuffer()), new Uint8Array([137, 80, 78, 71]));

    const unknown = await fetch(`${base}/drive-image/d2/kix1`);
    assert.equal(unknown.status, 404);
  } finally {
    await server.close();
  }
});

test("rejects every notification when no token is configured", async () => {
  let events = 0;
  const status: WebhookStatus = {
    channelId: null,
    expiration: null,
    lastEventAt: null,
    lastApplyAt: null,
    lastApplyReport: null,
  };

  const server = createWebhookServer({
    port: 0,
    expectedToken: null,
    logger,
    onEvent: () => {
      events += 1;
    },
    status: () => status,
  });

  await server.listen();
  const base = `http://127.0.0.1:${server.port()}`;

  try {
    const withoutToken = await fetch(`${base}/hooks/drive`, {
      method: "POST",
      headers: { "x-goog-resource-state": "change" },
    });
    assert.equal(withoutToken.status, 401);

    const anyToken = await fetch(`${base}/hooks/drive`, {
      method: "POST",
      headers: { "x-goog-resource-state": "change", "x-goog-channel-token": "guess" },
    });
    assert.equal(anyToken.status, 401);
    assert.equal(events, 0);
  } finally {
    await server.close();
  }
});

test("accepts change events, rejects bad token and exposes health", async () => {
  let events = 0;
  const status: WebhookStatus = {
    channelId: "channel-1",
    expiration: "1893456000000",
    lastEventAt: null,
    lastApplyAt: null,
    lastApplyReport: null,
  };

  const server = createWebhookServer({
    port: 0,
    expectedToken: "secret",
    logger,
    onEvent: () => {
      events += 1;
    },
    status: () => status,
  });

  await server.listen();
  const base = `http://127.0.0.1:${server.port()}`;

  try {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), status);

    const badToken = await fetch(`${base}/hooks/drive`, {
      method: "POST",
      headers: { "x-goog-resource-state": "change", "x-goog-channel-token": "wrong" },
    });
    assert.equal(badToken.status, 401);
    assert.equal(events, 0);

    const sync = await fetch(`${base}/hooks/drive`, {
      method: "POST",
      headers: { "x-goog-resource-state": "sync", "x-goog-channel-token": "secret" },
    });
    assert.equal(sync.status, 200);
    assert.equal(events, 0);

    const change = await fetch(`${base}/hooks/drive`, {
      method: "POST",
      headers: { "x-goog-resource-state": "change", "x-goog-channel-token": "secret" },
    });
    assert.equal(change.status, 202);
    assert.equal(events, 1);

    const missing = await fetch(`${base}/other`);
    assert.equal(missing.status, 404);
  } finally {
    await server.close();
  }
});
