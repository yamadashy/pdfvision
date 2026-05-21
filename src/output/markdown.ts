import type { DocumentResult, PageResult } from '../types/index.js';

/** Options that influence the Markdown rendering without changing the
 *  underlying `DocumentResult`. JSON / XML formatters don't need them
 *  because they already expose the same metadata (e.g. `repeated: true`)
 *  for downstream consumers to filter themselves; Markdown is read by
 *  humans / LLMs that benefit from the filtering being pre-applied. */
export interface MarkdownOptions {
  /** Drop blocks flagged `repeated: true` (running header / footer /
   *  page number, etc.) from the per-page body. Requires the document
   *  to have been extracted with `layout: true`; throws otherwise so
   *  silent no-ops don't mask a misconfigured call. */
  stripRepeated?: boolean;
}

/** "595×842" — drops trailing .00 so integer dimensions stay readable. */
function formatSize(page: PageResult): string {
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return `${trim(page.width)}×${trim(page.height)}`;
}

/** Body text for a page: either the pdf.js-derived `page.text` (default),
 *  or — when `stripRepeated` is on — a layout-driven rebuild that filters
 *  out the blocks the cross-page pass tagged as repeated chrome. */
function pageBody(page: PageResult, options: MarkdownOptions): string {
  if (!options.stripRepeated) return page.text;
  if (!page.layout) {
    // Caller asked to strip repeated chrome but the document carries no
    // layout — `repeated: true` is only set during the cross-page
    // layout pass, so there is no way to filter without it. Fail loud
    // rather than silently emitting the unfiltered text.
    throw new Error('stripRepeated requires layout extraction (pass layout: true to processDocument)');
  }
  // Rebuild the body from non-repeated blocks. Use double-newline
  // separators so consecutive paragraphs / heading + body don't run
  // together when their original spacing came from layout gaps rather
  // than literal newlines.
  return page.layout.blocks
    .filter((b) => !b.repeated)
    .map((b) => b.text)
    .join('\n\n');
}

/**
 * Markdown variant of the formatter, intended for agents that already speak
 * Markdown (Claude / Cursor / chat UIs). Each page becomes its own `## Page N`
 * heading so callers can jump or chunk by page, and density metadata stays
 * visible as a single italic line to keep the silent-failure signal close to
 * the text.
 */
export function formatMarkdown(result: DocumentResult, options: MarkdownOptions = {}): string {
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
    // The Warnings column appears only when at least one page carries
    // a non-empty `warnings` array. Like NonPrint / Render, the column
    // only shows up when there's actual signal — otherwise the table
    // grows a column of zeroes for the default extraction.
    const showWarnings = result.pages.some((p) => p.warnings && p.warnings.length > 0);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(
      `| Page | Chars | Images | Coverage |${showNonPrint ? ' NonPrint |' : ''}${showRender ? ' Render |' : ''} Size (pt) |${showBlocks ? ' Blocks |' : ''}${showWarnings ? ' Warnings |' : ''}`,
    );
    lines.push(
      `| ---: | ---: | ---: | ---: |${showNonPrint ? ' ---: |' : ''}${showRender ? ' ---: |' : ''} ---: |${showBlocks ? ' ---: |' : ''}${showWarnings ? ' ---: |' : ''}`,
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
      const warningsCell = showWarnings ? ` ${page.warnings?.length ?? 0} |` : '';
      lines.push(
        `| ${page.page} | ${page.charCount} | ${page.imageCount} | ${coveragePct}% |${nonPrintCell}${renderCell} ${formatSize(page)} |${blocksCell}${warningsCell}`,
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
    // chars" from "a few bad chars that round to 0%". Append the raw
    // count in parentheses — for unusable_glyph_indices PDFs the
    // absolute count (e.g. "1706") is more actionable than the rounded
    // percentage.
    const npPct = Math.round(page.nonPrintableRatio * 100);
    const nonPrintFragment =
      page.nonPrintableCount > 0 ? ` · nonPrint: ${npPct === 0 ? '<1%' : `${npPct}%`} (${page.nonPrintableCount})` : '';
    // Inline the render-content ratio (when rasterised) so a single-page
    // run still surfaces it without the overview table. Two decimal
    // places match the column format above.
    const renderFragment =
      page.renderContentRatio !== undefined ? ` · render: ${(page.renderContentRatio * 100).toFixed(2)}%` : '';
    // Surface the derived quality classification when it's abnormal so
    // the LLM-facing markdown carries the same dispatch signal that
    // JSON / XML expose. `nativeTextStatus === 'ok'` and an `'empty'`
    // page with no visual content are normal flows; the other states
    // are the ones an agent reader needs to react to.
    const showNative =
      page.quality.nativeTextStatus === 'unusable_glyph_indices' ||
      page.quality.nativeTextStatus === 'empty_but_visual_content';
    const nativeFragment = showNative ? ` · native: ${page.quality.nativeTextStatus}` : '';
    const visualFragment = page.quality.visualStatus === 'blank' ? ` · visual: blank` : '';
    // Inline the warnings count when the page has any. Mirrors the
    // nonPrint / render fragments — the per-page density line is the
    // first thing an agent sees inside a `## Page N` section, so
    // surfacing the count there gives them an immediate "this page
    // had geometry issues" signal before they read the body.
    const warningCount = page.warnings?.length ?? 0;
    const warningsFragment = warningCount > 0 ? ` · warnings: ${warningCount}` : '';
    lines.push(
      `_chars: ${page.charCount} · images: ${page.imageCount} · coverage: ${coveragePct}%${nonPrintFragment}${renderFragment}${nativeFragment}${visualFragment}${warningsFragment} · size: ${formatSize(page)}pt_`,
    );
    const body = pageBody(page, options);
    if (body) {
      lines.push('');
      lines.push(body);
    }
    if (page.warnings && page.warnings.length > 0) {
      // Per-warning blockquote section. Placed after the body so the
      // agent reads the page content first and only sees the anomaly
      // list when it specifically looks for problems. Blockquote `>`
      // is visually distinct from body paragraphs and parses cleanly
      // in both plain Markdown viewers and LLM contexts.
      lines.push('');
      lines.push('### Warnings');
      lines.push('');
      for (const w of page.warnings) {
        // Severity goes first as a bold label so a quick scan
        // separates `error` (likely render-broken / data-integrity)
        // from `warning` (typesetting concern). Code follows in
        // parentheses for the machine-readable handle.
        lines.push(`> **${w.severity}** (${w.code}): ${w.message}`);
      }
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
