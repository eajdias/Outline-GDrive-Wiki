import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteImageUrls } from "../src/domain/images.js";

test("rewrites markdown image URLs in document order", () => {
  const markdown = "![Fluxo](https://lh3.googleusercontent.com/a)\n![Escalonamento](https://lh3.googleusercontent.com/b)";
  const rewritten = rewriteImageUrls(markdown, "doc-1", ["kix1", "kix2"]);

  assert.equal(
    rewritten,
    "![Fluxo](/drive-image/doc-1/kix1)\n![Escalonamento](/drive-image/doc-1/kix2)",
  );
});

test("rejects a mismatch between images and inline objects", () => {
  assert.throws(() => rewriteImageUrls("![A](x)", "doc-1", []), /1 image.*0 inline/);
  assert.throws(() => rewriteImageUrls("![A](x)", "doc-1", ["kix1", "kix2"]), /1 image.*2 inline/);
});

test("leaves markdown without images unchanged", () => {
  assert.equal(rewriteImageUrls("# Manual", "doc-1", []), "# Manual");
});
