import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHtml } from "../src/domain/normalize.js";

const HTML = `<!DOCTYPE html><html><head><style>p{color:red}</style><script>bad()</script></head><body>
<h1>Manual</h1>
<h2>Instalação</h2>
<p>Execute <strong>agora</strong> e veja <a href="https://example.test/doc">o guia</a>.</p>
<ul><li>Primeiro</li><li>Segundo</li></ul>
<table><tr><td>Campo</td><td>Valor</td></tr><tr><td>Porta</td><td>8080</td></tr></table>
</body></html>`;

test("normalizes a Google Doc export to markdown", () => {
  const markdown = normalizeHtml(HTML);

  assert.match(markdown, /^# Manual$/m);
  assert.match(markdown, /^## Instalação$/m);
  assert.match(markdown, /Execute \*\*agora\*\* e veja \[o guia\]\(https:\/\/example\.test\/doc\)\./);
  assert.match(markdown, /^- Primeiro$/m);
  assert.match(markdown, /^- Segundo$/m);
  assert.match(markdown, /^\| Campo \| Valor \|$/m);
  assert.match(markdown, /^\| --- \| --- \|$/m);
  assert.match(markdown, /^\| Porta \| 8080 \|$/m);
});

test("drops head, style, script and decodes entities", () => {
  const markdown = normalizeHtml("<head><title>x</title></head><p>A&amp;B &lt;ok&gt;</p><script>run()</script>");
  assert.equal(markdown, "A&B <ok>");
});

test("decodes named entities used by Google Docs exports", () => {
  const markdown = normalizeHtml("<p>INFRA &mdash; Padroniza&ccedil;&atilde;o &hellip; 100&euro;</p>");
  assert.equal(markdown, "INFRA — Padronização … 100€");
});

test("keeps empty input empty", () => {
  assert.equal(normalizeHtml(""), "");
});
