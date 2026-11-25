import assert from "node:assert/strict";
import { test } from "node:test";
import { hashDocument } from "../src/domain/hash.js";

test("is stable for the same content and url", () => {
  assert.equal(hashDocument("texto", "https://drive.test/1"), hashDocument("texto", "https://drive.test/1"));
});

test("changes when the url changes", () => {
  assert.notEqual(hashDocument("texto", "https://drive.test/1"), hashDocument("texto", "https://drive.test/2"));
});

test("changes when the content changes", () => {
  assert.notEqual(hashDocument("texto", "https://drive.test/1"), hashDocument("texto 2", "https://drive.test/1"));
});

test("changes when the citation schema changes", () => {
  assert.notEqual(
    hashDocument("texto", "https://drive.test/1", "1"),
    hashDocument("texto", "https://drive.test/1", "2"),
  );
});

test("changes when the public citation base url changes", () => {
  assert.notEqual(
    hashDocument("texto", "https://drive.test/1", "2", "https://wiki.test"),
    hashDocument("texto", "https://drive.test/1", "2", "https://wiki.test:8443"),
  );
});
