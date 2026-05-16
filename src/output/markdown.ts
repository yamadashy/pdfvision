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
    // The Blocks column appears only when --layout was on (any page carries
    // a `layout` payload). Lets agents see at a glance how the doc breaks
    // down into structural pieces without scrolling into the body.
    const showBlocks = result.pages.some((p) => p.layout !== undefined);
    // The NonPrint column appears only when at least one page has a
    // non-zero ratio. Most PDFs are clean, so showing 0% on every row
    // would clutter the table without helping any agent decision.
    const showNonPrint = result.pages.some((p) => p.nonPrintableRatio > 0);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(
      `| Page | Chars | Images | Coverage |${showNonPrint ? ' NonPrint |' : ''} Size (pt) |${showBlocks ? ' Blocks |' : ''}`,
    );
    lines.push(`| ---: | ---: | ---: | ---: |${showNonPrint ? ' ---: |' : ''} ---: |${showBlocks ? ' ---: |' : ''}`);
    for (const page of result.pages) {
      const coveragePct = Math.round(page.textCoverage * 100);
      const nonPrintCell = showNonPrint ? ` ${Math.round(page.nonPrintableRatio * 100)}% |` : '';
      const blocksCell = showBlocks ? ` ${page.layout?.blocks.length ?? 0} |` : '';
      lines.push(
        `| ${page.page} | ${page.charCount} | ${page.imageCount} | ${coveragePct}% |${nonPrintCell} ${formatSize(page)} |${blocksCell}`,
      );
    }
  }

  for (const page of result.pages) {
    const coveragePct = Math.round(page.textCoverage * 100);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`## Page ${page.page}`);
    lines.push('');
    // Inline the nonPrint signal only when it's non-zero so clean PDFs
    // don't pay a noisy "nonPrint: 0%" suffix on every page header. The
    // ratio renders as a percent for parity with `coverage`.
    const nonPrintFragment =
      page.nonPrintableRatio > 0 ? ` · nonPrint: ${Math.round(page.nonPrintableRatio * 100)}%` : '';
    lines.push(
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%${nonPrintFragment} · size: ${formatSize(page)}pt_`,
    );
    if (page.text) {
      lines.push('');
      lines.push(page.text);
    }
    if (page.ocr) {
      // OCR sits below the native text so the agent reads pdfjs first
      // and only consults OCR when text is empty/garbled. The label
      // surfaces lang + confidence so a low-confidence page is obvious
      // without inspecting the JSON form.
      const confPct = Math.round(page.ocr.confidence * 100);
      lines.push('');
      lines.push(`### OCR (${page.ocr.lang}, confidence ${confPct}%)`);
      if (page.ocr.text) {
        lines.push('');
        lines.push(page.ocr.text);
      }
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
