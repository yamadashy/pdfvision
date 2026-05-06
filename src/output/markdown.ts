import type { DocumentResult } from '../types/index.js';

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

  for (const page of result.pages) {
    const coveragePct = Math.round(page.textCoverage * 100);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Page ${page.page}`);
    lines.push('');
    lines.push(`_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%_`);
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
