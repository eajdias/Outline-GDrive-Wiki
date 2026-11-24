import assert from "node:assert/strict";
import { test } from "node:test";
import { OutlineClient } from "../src/infra/outline-client.js";
import { createLogger } from "@repo/logger";

const logger = createLogger("test", "error");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("finds a collection by name ignoring emoji and accents", async () => {
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer outline-key");
    if (url.pathname === "/api/collections.list") {
      return json({ data: [{ id: "c1", name: "🎓 Treinamentos" }, { id: "c2", name: "General" }] });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };

  const client = new OutlineClient("http://outline.test", "outline-key", logger);
  assert.equal(await client.findCollectionByName("Treinamentos"), "c1");
  assert.equal(await client.findCollectionByName("General"), "c2");
  assert.equal(await client.findCollectionByName("Inexistente"), null);
});

test("creates, updates and archives documents", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (url.pathname === "/api/documents.create") {
      assert.equal(body.publish, true);
      assert.equal(body.collectionId, "c1");
      return json({ data: { id: "doc-1" } });
    }
    if (url.pathname === "/api/documents.update" || url.pathname === "/api/documents.archive") {
      assert.equal(body.id, "doc-1");
      return json({ data: { id: "doc-1" } });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };

  const client = new OutlineClient("http://outline.test", "outline-key", logger);
  assert.equal(await client.create({ title: "Manual", markdown: "# Manual", collectionId: "c1" }), "doc-1");
  await client.update("doc-1", { title: "Manual", markdown: "# Manual v2" });
  await client.archive("doc-1");

  assert.deepEqual(seen, ["/api/documents.create", "/api/documents.update", "/api/documents.archive"]);
});

test("translates a boundary error with the action", async () => {
  globalThis.fetch = async (): Promise<Response> => json({ error: "bad collection" }, 400);

  const client = new OutlineClient("http://outline.test", "outline-key", logger);
  await assert.rejects(
    () => client.create({ title: "Manual", markdown: "x", collectionId: "missing" }),
    /Outline create failed.*400/,
  );
});
