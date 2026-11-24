import assert from "node:assert/strict";
import { test } from "node:test";
import { DocsClient } from "../src/infra/docs-client.js";
import { createLogger } from "@repo/logger";

const logger = createLogger("test", "error");
const tokens = { getToken: async (): Promise<string> => "docs-token" };

const DOCUMENT = {
  inlineObjects: {
    kix1: { inlineObjectProperties: { embeddedObject: { title: "Fluxo", imageProperties: { contentUri: "https://lh3.googleusercontent.com/1" } } } },
    kix2: { inlineObjectProperties: { embeddedObject: { title: "Escalonamento", imageProperties: { contentUri: "https://lh3.googleusercontent.com/2" } } } },
  },
  body: {
    content: [
      { paragraph: { elements: [{ inlineObjectElement: { inlineObjectId: "kix1" } }] } },
      {
        table: {
          tableRows: [
            { tableCells: [{ content: [{ paragraph: { elements: [{ inlineObjectElement: { inlineObjectId: "kix2" } }] } }] }] },
          ],
        },
      },
    ],
  },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("lists inline images in document order and streams their bytes", async () => {
  let imageFetches = 0;
  globalThis.fetch = async (input): Promise<Response> => {
    const url = new URL(String(input));
    if (url.hostname === "docs.googleapis.com") return json(DOCUMENT);
    if (url.hostname === "lh3.googleusercontent.com") {
      imageFetches += 1;
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    throw new Error(`unexpected request ${url.href}`);
  };

  const client = new DocsClient(tokens, logger);
  const images = await client.listImages("doc-1");
  assert.deepEqual(
    images.map((image) => image.objectId),
    ["kix1", "kix2"],
  );

  const first = await client.getImage("doc-1", "kix1");
  assert.equal(first.contentType, "image/png");
  assert.deepEqual([...first.bytes], [137, 80, 78, 71]);
  assert.equal(imageFetches, 1);

  const cached = await client.getImage("doc-1", "kix1");
  assert.deepEqual([...cached.bytes], [137, 80, 78, 71]);
  assert.equal(imageFetches, 1, "second read should hit the in-memory cache");
});

test("fails with a clear error for a missing inline object", async () => {
  globalThis.fetch = async (): Promise<Response> => json({ inlineObjects: {}, body: { content: [] } });

  const client = new DocsClient(tokens, logger);
  await assert.rejects(() => client.getImage("doc-1", "kix-missing"), /no image kix-missing/);
});
