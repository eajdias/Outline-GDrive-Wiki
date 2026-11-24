import assert from "node:assert/strict";
import { test } from "node:test";
import { citationUrl, toCitations, topScore, type RawSource } from "../src/domain/citations.js";

function source(overrides: Partial<RawSource> = {}): RawSource {
  return {
    title: "como-configurar-o-evo-abc123.txt",
    description: "Como configurar o Evo",
    url: "web://https://wiki.example.test/doc/como-configurar-o-evo-abc123.website",
    score: 0.8,
    text: "<document_metadata>sourceDocument: x</document_metadata>\n\nConteúdo útil sobre o Evo.",
    ...overrides,
  };
}

test("recovers the Outline URL from the AnythingLLM wrapper", () => {
  assert.equal(
    citationUrl("web://https://wiki.example.test/doc/como-configurar-o-evo-abc123.website"),
    "https://wiki.example.test/doc/como-configurar-o-evo-abc123",
  );
});

test("rejects non-http URLs", () => {
  assert.equal(citationUrl("file://como-configurar-o-evo.txt"), null);
  assert.equal(citationUrl("javascript:alert(1)"), null);
  assert.equal(citationUrl(null), null);
});

test("prefers the Outline title stored as description", () => {
  const [citation] = toCitations([source()]);
  assert.equal(citation?.title, "Como configurar o Evo");
});

test("falls back to a readable slug when description is absent", () => {
  const [citation] = toCitations([source({ description: "no description found" })]);
  assert.equal(citation?.title, "como configurar o evo abc123");
});

test("deduplicates by URL keeping the highest score", () => {
  const citations = toCitations([
    source({ score: 0.7 }),
    source({ score: 0.9, text: "versão melhor" }),
  ]);

  assert.equal(citations.length, 1);
  assert.equal(citations[0]?.score, 0.9);
  assert.match(citations[0]?.snippet ?? "", /versão melhor/);
});

test("strips document metadata from the snippet", () => {
  const [citation] = toCitations([source()]);
  assert.equal(citation?.snippet, "Conteúdo útil sobre o Evo.");
  assert.equal(topScore(toCitations([source({ score: 0.91 })])), 0.91);
});
