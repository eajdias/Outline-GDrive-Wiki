import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "../src/domain/markdown.entry.js";

test("escapes raw HTML before rendering", () => {
  assert.equal(
    renderMarkdown('<script>alert("xss")</script>'),
    "<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>",
  );
});

test("renders the safe markdown subset", () => {
  assert.equal(renderMarkdown("**negrito** e `código`"), "<p><strong>negrito</strong> e <code>código</code></p>");
  assert.equal(renderMarkdown("## Título"), "<h3>Título</h3>");
  assert.equal(renderMarkdown("- um\n- dois"), "<ul><li>um</li><li>dois</li></ul>");
  assert.equal(renderMarkdown("1. um\n2. dois"), "<ol><li>um</li><li>dois</li></ol>");
  assert.equal(renderMarkdown("```\nconst x = 1;\n```"), "<pre><code>const x = 1;</code></pre>");
});

test("only links http and https URLs", () => {
  assert.equal(
    renderMarkdown("[wiki](https://wiki.example.test/doc/x)"),
    '<p><a href="https://wiki.example.test/doc/x" target="_blank" rel="noopener noreferrer">wiki</a></p>',
  );
  assert.equal(renderMarkdown("[x](javascript:alert(1))"), "<p>[x](javascript:alert(1))</p>");
});

test("keeps line breaks inside a paragraph", () => {
  assert.equal(renderMarkdown("linha 1\nlinha 2"), "<p>linha 1<br>linha 2</p>");
  assert.equal(renderMarkdown("   "), "");
});
