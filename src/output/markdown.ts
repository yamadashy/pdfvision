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
    // The NonPrint column appears only when at least one page has any
    // non-printable code points (count > 0). Reading `count` instead of
    // `ratio` here catches sparse occurrences that would otherwise
    // round to 0% and hide the column for the whole document.
    const showNonPrint = result.pages.some((p) => p.nonPrintableCount > 0);
    // The Render column appears only when at least one page was rasterised
    // (--render or --ocr). Showing it on every doc would clutter the
    // overview with empty cells for the default text-only flow.
    const showRender = result.pages.some((p) => p.renderContentRatio !== undefined);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(
      `| Page | Chars | Images | Coverage |${showNonPrint ? ' NonPrint |' : ''}${showRender ? ' Render |' : ''} Size (pt) |${showBlocks ? ' Blocks |' : ''}`,
    );
    lines.push(
      `| ---: | ---: | ---: | ---: |${showNonPrint ? ' ---: |' : ''}${showRender ? ' ---: |' : ''} ---: |${showBlocks ? ' ---: |' : ''}`,
    );
    for (const page of result.pages) {
      const coveragePct = Math.round(page.textCoverage * 100);
      // Use `<1%` (instead of the rounded `0%`) when the page has *any*
      // non-printable chars — otherwise sparse occurrences like 2 bad
      // codepoints in a 5000-char body page silently render as `0%` and
      // the column-trigger above looks inconsistent.
      const nonPrintPct = Math.round(page.nonPrintableRatio * 100);
      const nonPrintCell = showNonPrint
        ? ` ${nonPrintPct === 0 && page.nonPrintableCount > 0 ? '<1%' : `${nonPrintPct}%`} |`
        : '';
      const renderCell = showRender
        ? // Two decimals as a percent so the agent sees the difference
          // between blank (0.00%) and sparse-marks (0.10%) — three or more
          // would clutter and reading <0.01% as "blank" is the heuristic.
          ` ${page.renderContentRatio !== undefined ? `${(page.renderContentRatio * 100).toFixed(2)}%` : '—'} |`
        : '';
      const blocksCell = showBlocks ? ` ${page.layout?.blocks.length ?? 0} |` : '';
      lines.push(
        `| ${page.page} | ${page.charCount} | ${page.imageCount} | ${coveragePct}% |${nonPrintCell}${renderCell} ${formatSize(page)} |${blocksCell}`,
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
    // Inline the nonPrint signal only when the page actually has any
    // non-printable code points (count > 0). Renders the rounded
    // percent, except <1% when sparse so the agent can tell "0 bad
    // chars" from "a few bad chars that round to 0%".
    const npPct = Math.round(page.nonPrintableRatio * 100);
    const nonPrintFragment = page.nonPrintableCount > 0 ? ` · nonPrint: ${npPct === 0 ? '<1%' : `${npPct}%`}` : '';
    // Inline the render-content ratio (when rasterised) so a single-page
    // run still surfaces it without the overview table. Two decimal
    // places match the column format above.
    const renderFragment =
      page.renderContentRatio !== undefined ? ` · render: ${(page.renderContentRatio * 100).toFixed(2)}%` : '';
    lines.push(
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%${nonPrintFragment}${renderFragment} · size: ${formatSize(page)}pt_`,
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
