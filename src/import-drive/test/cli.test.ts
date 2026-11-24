import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand } from "../src/cli.js";

test("parses the supported commands", () => {
  assert.equal(parseCommand(["seed"]), "seed");
  assert.equal(parseCommand(["apply"]), "apply");
  assert.equal(parseCommand(["verify"]), "verify");
  assert.equal(parseCommand(["serve"]), "serve");
});

test("rejects unknown or missing commands", () => {
  assert.equal(parseCommand([]), null);
  assert.equal(parseCommand(["deploy"]), null);
});
