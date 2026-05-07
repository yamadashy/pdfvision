import type { DocumentResult, PageResult } from '../types/index.js';

/** "595×842" — drops trailing .00 so integer dimensions stay readable. */
function formatSize(page: PageResult): string {
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `${trim(page.width)}×${trim(page.height)}`;
}

/**
 * Markdown variant of the formatter, intended for agents that already speak
 * Markdown (Claude / Cursor / chat UIs). Each page becomes its own `## Page N`
 * heading so callers can jump or chunk by page, and density metadata stays
 * visible as a single italic line to keep the silent-failure signal close to
 * the text.
 */
export function formatMarkdown(result: DocumentResult): string {
  const lines: string[] = [];
  lines.push(`# ${result.file}`);
  lines.push('');
  lines.push(`- **Pages:** ${result.totalPages}`);
  if (result.metadata.title) lines.push(`- **Title:** ${result.metadata.title}`);
  if (result.metadata.author) lines.push(`- **Author:** ${result.metadata.author}`);
  if (result.metadata.subject) lines.push(`- **Subject:** ${result.metadata.subject}`);
  if (result.metadata.creator) lines.push(`- **Creator:** ${result.metadata.creator}`);

  // Overview table: density signal aggregation across the selected pages.
  // Lets an agent eyeball outliers (image-flattened slides, blank pages,
  // unusually dense pages) before scrolling through the body. Skipped for
  // single-page outputs where a one-row table is just noise. The Size
  // column carries width×height in PDF points so portrait-vs-landscape and
  // slide-vs-document layouts are obvious from the same glance.
  if (result.pages.length > 1) {
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push('| Page | Chars | Images | Coverage | Size (pt) |');
    lines.push('| ---: | ---: | ---: | ---: | ---: |');
    for (const page of result.pages) {
      const coveragePct = Math.round(page.textCoverage * 100);
      lines.push(`| ${page.page} | ${page.charCount} | ${page.imageCount} | ${coveragePct}% | ${formatSize(page)} |`);
    }
  }

  for (const page of result.pages) {
    const coveragePct = Math.round(page.textCoverage * 100);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Page ${page.page}`);
    lines.push('');
    lines.push(
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}% · size: ${formatSize(page)}pt_`,
    );
    if (page.text) {
      lines.push('');
      lines.push(page.text);
    }
    if (page.image) {
      lines.push('');
      // Use the <...> link destination form so paths with spaces or
      // parentheses (common with `--render-output ./my (drafts)/`) don't
      // break the image link. Filesystem paths effectively never contain
      // `<` or `>`, so no further escaping is needed.
      lines.push(`![Page ${page.page}](<${page.image}>)`);
    }
  }
  return lines.join('\n');
}
