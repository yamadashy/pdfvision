import type { DocumentResult } from '../types/index.js';

export function formatText(result: DocumentResult): string {
  const lines: string[] = [];
  lines.push(`File: ${result.file}`);
  lines.push(`Pages: ${result.totalPages}`);
  if (result.metadata.title) lines.push(`Title: ${result.metadata.title}`);
  if (result.metadata.author) lines.push(`Author: ${result.metadata.author}`);
  lines.push('---');
  for (const page of result.pages) {
    const coveragePct = Math.round(page.textCoverage * 100);
    lines.push(
      `\n[Page ${page.page}] (chars: ${page.charCount}, images: ${page.imageCount}, coverage: ${coveragePct}%)\n`,
    );
    lines.push(page.text);
    if (page.image) lines.push(`\nImage: ${page.image}`);
  }
  return lines.join('\n');
}
