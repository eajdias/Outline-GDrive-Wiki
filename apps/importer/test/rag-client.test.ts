import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "@repo/logger";
import { RagClient } from "../src/infra/rag-client.js";

const logger = createLogger("test", "error");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("ensureWorkspace reuses an existing workspace", async () => {
  let created = false;
  globalThis.fetch = async (input): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/workspace/kb-drive") return json({ workspace: [{ slug: "kb-drive" }] });
    if (url.pathname === "/api/v1/workspace/new") created = true;
    throw new Error(`unexpected request ${url.pathname}`);
  };

  const client = new RagClient("http://rag.test", "rag-key", "kb-drive", logger);
  await client.ensureWorkspace();
  assert.equal(created, false);
});

test("ensureWorkspace creates a missing workspace", async () => {
  let created = false;
  globalThis.fetch = async (input): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/workspace/kb-drive") return json({ error: "not found" }, 404);
    if (url.pathname === "/api/v1/workspace/new") {
      created = true;
      return json({ workspace: { slug: "kb-drive" } });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };

  const client = new RagClient("http://rag.test", "rag-key", "kb-drive", logger);
  await client.ensureWorkspace();
  assert.equal(created, true);
});

test("addRawText sends drive metadata and returns the location", async () => {
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v1/document/raw-text");
    const body = JSON.parse(String(init?.body)) as { textContent: string; metadata: Record<string, string> };
    assert.equal(body.textContent, "# Manual");
    assert.equal(body.metadata.origin, "drive");
    assert.equal(body.metadata.url, "https://drive.test/d1");
    return json({ documents: [{ location: "custom-documents/manual.json" }] });
  };

  const client = new RagClient("http://rag.test", "rag-key", "kb-drive", logger);
  const location = await client.addRawText({ title: "Manual", text: "# Manual", url: "https://drive.test/d1" });
  assert.equal(location, "custom-documents/manual.json");
});

test("updateEmbeddings, workspaceDocuments and removeDocuments use the workspace", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (url.pathname === "/api/v1/workspace/kb-drive/update-embeddings") {
      assert.deepEqual(body.adds, ["loc-2"]);
      assert.deepEqual(body.deletes, ["loc-1"]);
      return json({ workspace: [{ documents: [{ docpath: "loc-2", title: "Manual" }] }] });
    }
    if (url.pathname === "/api/v1/system/remove-documents") {
      assert.deepEqual(body.names, ["loc-1"]);
      return json({ success: true });
    }
    if (url.pathname === "/api/v1/workspace/kb-drive") {
      return json({ workspace: [{ documents: [{ docpath: "loc-1", title: "Antigo" }] }] });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };

  const client = new RagClient("http://rag.test", "rag-key", "kb-drive", logger);
  const workspace = await client.updateEmbeddings(["loc-2"], ["loc-1"]);
  assert.deepEqual(workspace, [{ location: "loc-2", title: "Manual" }]);

  assert.deepEqual(await client.workspaceDocuments(), [{ location: "loc-1", title: "Antigo" }]);
  await client.removeDocuments(["loc-1"]);
  assert.deepEqual(calls.sort(), [
    "DELETE /api/v1/system/remove-documents",
    "GET /api/v1/workspace/kb-drive",
    "POST /api/v1/workspace/kb-drive/update-embeddings",
  ]);
});
