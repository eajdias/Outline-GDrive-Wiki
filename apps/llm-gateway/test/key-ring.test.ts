import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyRing } from "../src/domain/key-ring.js";

test("offers every key in order until each one cools down", () => {
  const ring = new KeyRing(["k1", "k2", "k3"]);
  assert.deepEqual(ring.available(0).map((entry) => entry.apiKey), ["k1", "k2", "k3"]);

  ring.markCooling(0, 1000);
  assert.deepEqual(ring.available(0).map((entry) => entry.index), [1, 2]);
  assert.deepEqual(ring.available(1000).map((entry) => entry.index), [0, 1, 2]);
});

test("reports how many keys are cooling and when the first returns", () => {
  const ring = new KeyRing(["k1", "k2"]);
  ring.markCooling(0, 5000);
  ring.markCooling(1, 9000);

  assert.deepEqual(ring.status(1000), { total: 2, cooling: 2, nextRetryMs: 4000 });
  assert.deepEqual(ring.status(9000), { total: 2, cooling: 0, nextRetryMs: 0 });
});
