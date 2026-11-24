const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;

export function rewriteImageUrls(markdown: string, docId: string, objectIds: string[]): string {
  const found = [...markdown.matchAll(MARKDOWN_IMAGE)];
  if (found.length === 0) return markdown;

  if (found.length !== objectIds.length) {
    throw new Error(
      `Markdown has ${found.length} image(s) but Google Docs API returned ${objectIds.length} inline image(s)`,
    );
  }

  let index = 0;
  return markdown.replace(MARKDOWN_IMAGE, (_match, alt: string) => {
    const objectId = objectIds[index] ?? "";
    index += 1;
    return `![${alt}](/drive-image/${encodeURIComponent(docId)}/${encodeURIComponent(objectId)})`;
  });
}
