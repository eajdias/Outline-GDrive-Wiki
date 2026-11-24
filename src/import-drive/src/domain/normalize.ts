import { decodeEntities } from "./entities.js";

const HEAD_OR_SCRIPT = /<(head|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const TABLE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
const HEADING = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
const LIST_ITEM = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
const LIST_TAG = /<\/?(?:ul|ol)\b[^>]*>/gi;
const LINK = /<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
const IMAGE = /<img\b[^>]*>/gi;
const BR = /<br\b[^>]*\/?>/gi;
const PARAGRAPH = /<\/?p\b[^>]*>/gi;
const DIV = /<\/?div\b[^>]*>/gi;
const STRONG = /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi;
const EM = /<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi;
const CODE = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
const PRE = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
const ANY_TAG = /<[^>]+>/g;
const MANY_BLANK_LINES = /\n{3,}/g;
const TRAILING_SPACES = /[ \t]+$/gm;

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ?? "";
}

function inline(html: string): string {
  return decodeEntities(
    html
      .replace(BR, "\n")
      .replace(STRONG, (_match, inner: string) => `**${inline(inner).trim()}**`)
      .replace(EM, (_match, inner: string) => `*${inline(inner).trim()}*`)
      .replace(CODE, (_match, inner: string) => `\`${decodeEntities(inner).trim()}\``)
      .replace(LINK, (_match, href: string, label: string) => {
        const text = inline(label).trim() || href;
        return href ? `[${text}](${href})` : text;
      })
      .replace(IMAGE, (tag: string) => {
        const src = attribute(tag, "src");
        const alt = attribute(tag, "alt");
        return src ? `![${alt}](${src})` : "";
      })
      .replace(ANY_TAG, ""),
  );
}

function tables(html: string): string {
  return html.replace(TABLE, (table: string) => {
    const lines: string[] = [];
    let headerDone = false;

    for (const row of table.matchAll(ROW)) {
      const cells = [...(row[1] ?? "").matchAll(CELL)].map((cell) => inline(cell[1] ?? "").replace(/\s+/g, " ").trim());
      if (cells.length === 0) continue;
      lines.push(`| ${cells.join(" | ")} |`);
      if (!headerDone) {
        lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
        headerDone = true;
      }
    }

    return `\n\n${lines.join("\n")}\n\n`;
  });
}

function lists(html: string): string {
  return html
    .replace(LIST_ITEM, (_match, inner: string) => `\n- ${inline(inner).replace(/\s+/g, " ").trim()}`)
    .replace(LIST_TAG, "\n");
}

function headings(html: string): string {
  return html.replace(HEADING, (_match, level: string, inner: string) => {
    return `\n\n${"#".repeat(Number(level))} ${inline(inner).replace(/\s+/g, " ").trim()}\n\n`;
  });
}

function preformatted(html: string): string {
  return html.replace(PRE, (_match, inner: string) => `\n\n\`\`\`\n${decodeEntities(inner).trim()}\n\`\`\`\n\n`);
}

export function normalizeHtml(html: string): string {
  let text = html.replace(HEAD_OR_SCRIPT, "").replace(HTML_COMMENT, "");
  text = preformatted(text);
  text = tables(text);
  text = headings(text);
  text = lists(text);
  text = text.replace(PARAGRAPH, "\n\n").replace(DIV, "\n");
  text = inline(text);
  text = text.replace(TRAILING_SPACES, "");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(MANY_BLANK_LINES, "\n\n");

  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}
