import assert from "node:assert/strict";
import { test } from "node:test";
import { DriveClient } from "../src/infra/drive-client.js";
import { createLogger } from "@repo/logger";

const logger = createLogger("test", "error");
const tokens = { getToken: async (): Promise<string> => "test-token" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function doc(id: string, name: string, parents: string[]): Record<string, unknown> {
  return {
    id,
    name,
    mimeType: "application/vnd.google-apps.document",
    modifiedTime: "2026-11-23T00:00:00Z",
    webViewLink: `https://drive.test/${id}`,
    parents,
    trashed: false,
  };
}

function folder(id: string, name: string, parents: string[]): Record<string, unknown> {
  return { id, name, mimeType: "application/vnd.google-apps.folder", parents };
}

test("listDocs walks folders recursively, ignores non-docs and sends auth", async () => {
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get("authorization");
    assert.equal(auth, "Bearer test-token");

    if (url.pathname === "/drive/v3/files") {
      const q = url.searchParams.get("q") ?? "";
      if (q.includes("'root'")) {
        return json({
          files: [folder("f1", "Geral", ["root"]), doc("d1", "Doc 1", ["root"]), { id: "p1", name: "x.pdf", mimeType: "application/pdf" }],
        });
      }
      if (q.includes("'f1'")) return json({ files: [doc("d2", "Doc 2", ["f1"])] });
    }
    throw new Error(`unexpected request ${url.pathname}${url.search}`);
  };

  const client = new DriveClient(tokens, { driveId: "drive-1", rootFolderId: "root" }, logger);
  const docs = await client.listDocs("root");

  assert.deepEqual(docs.map((entry) => entry.id).sort(), ["d1", "d2"]);
  assert.deepEqual(docs.find((entry) => entry.id === "d2")?.folderPath, ["Geral"]);
  assert.deepEqual(docs.find((entry) => entry.id === "d1")?.folderPath, []);
});

test("exportHtml returns the raw HTML", async () => {
  globalThis.fetch = async (input): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/drive/v3/files/d1/export");
    return new Response("<h1>Manual</h1>", { status: 200 });
  };

  const client = new DriveClient(tokens, { driveId: null, rootFolderId: "root" }, logger);
  assert.equal(await client.exportHtml("d1"), "<h1>Manual</h1>");
});

test("changes paginates, resolves folder path and reports removals", async () => {
  let page = 0;
  globalThis.fetch = async (input): Promise<Response> => {
    const url = new URL(String(input));

    if (url.pathname === "/drive/v3/changes") {
      page += 1;
      if (page === 1) {
        return json({
          changes: [
            { fileId: "d1", file: doc("d1", "Doc 1", ["f1"]) },
            { fileId: "d2", removed: true },
          ],
          nextPageToken: "page-2",
        });
      }
      return json({
        changes: [{ fileId: "p1", file: { id: "p1", mimeType: "application/pdf" } }],
        newStartPageToken: "token-next",
      });
    }
    if (url.pathname === "/drive/v3/files/f1") return json(folder("f1", "Geral", ["root"]));
    throw new Error(`unexpected request ${url.pathname}`);
  };

  const client = new DriveClient(tokens, { driveId: "drive-1", rootFolderId: "root" }, logger);
  const result = await client.changes("token-1");

  assert.equal(result.nextToken, "token-next");
  assert.deepEqual(result.removedIds, ["d2"]);
  assert.equal(result.docs.length, 1);
  assert.deepEqual(result.docs[0]?.folderPath, ["Geral"]);
});

test("watch registers a web_hook channel", async () => {
  globalThis.fetch = async (input, init): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/drive/v3/changes/watch");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.type, "web_hook");
    assert.equal(body.address, "https://wiki.test/hooks/drive");
    assert.equal(body.token, "secret");
    return json({ id: body.id, expiration: "1893456000000" });
  };

  const client = new DriveClient(tokens, { driveId: "drive-1", rootFolderId: "root" }, logger);
  const result = await client.watch("https://wiki.test/hooks/drive", "secret", "channel-1");

  assert.deepEqual(result, { id: "channel-1", expiration: "1893456000000" });
});
