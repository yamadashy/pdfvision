import type { DocumentOutlineItem, DocumentResult, PageResult } from '../types/index.js';
import { SUMMARY_MAX_DETAIL_ROWS } from './limits.js';
import { formatPageRanges } from './ranges.js';

/**
 * The document map returned when `read_pdf` is called without `pages` on
 * a document too large to inline.
 *
 * This is not the Markdown formatter with the body removed. The whole
 * point is aggregation: a 312-row Overview table is itself a context
 * problem, so quality statuses and warning codes are grouped into page
 * ranges, and the response ends with the concrete calls worth making
 * next. The CLI never needs this because its caller can pipe and grep.
 */

/** Statuses that mean native text is missing or untrustworthy, in rough severity order. */
const OCR_WORTHY_STATUSES = new Set([
  'empty_but_visual_content',
  'unusable_glyph_indices',
  'mixed_glyph_indices',
  'sparse_text_with_visual_content',
]);

function cell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function groupByKey<T extends string>(pages: readonly PageResult[], key: (page: PageResult) => T[]): Map<T, number[]> {
  const grouped = new Map<T, number[]>();
  for (const page of pages) {
    for (const value of key(page)) {
      const bucket = grouped.get(value);
      if (bucket) bucket.push(page.page);
      else grouped.set(value, [page.page]);
    }
  }
  return grouped;
}

function appendGroupedTable(
  lines: string[],
  heading: string,
  columnLabel: string,
  grouped: Map<string, number[]>,
): void {
  if (grouped.size === 0) return;
  const rows = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  lines.push('', `## ${heading}`, '');
  lines.push(`| ${columnLabel} | Pages | Where |`);
  lines.push('| --- | ---: | --- |');
  for (const [value, pages] of rows.slice(0, SUMMARY_MAX_DETAIL_ROWS)) {
    lines.push(`| \`${cell(value)}\` | ${pages.length} | ${formatPageRanges(pages)} |`);
  }
  if (rows.length > SUMMARY_MAX_DETAIL_ROWS) {
    lines.push('', `_${rows.length - SUMMARY_MAX_DETAIL_ROWS} further row(s) omitted._`);
  }
}

function appendOutline(lines: string[], outline: readonly DocumentOutlineItem[]): void {
  if (outline.length === 0) return;
  lines.push('', '## Outline', '');
  let emitted = 0;
  for (const item of outline) {
    if (emitted >= SUMMARY_MAX_DETAIL_ROWS) {
      lines.push(`- _…${outline.length - emitted} further top-level entries omitted._`);
      break;
    }
    lines.push(`- ${cell(item.title)}${item.page !== undefined ? ` — p.${item.page}` : ''}`);
    emitted += 1;
    // Depth 2 only: deeper bookmark trees are navigation noise at map scale.
    for (const child of item.items ?? []) {
      if (emitted >= SUMMARY_MAX_DETAIL_ROWS) break;
      lines.push(`  - ${cell(child.title)}${child.page !== undefined ? ` — p.${child.page}` : ''}`);
      emitted += 1;
    }
  }
}

function appendNextSteps(lines: string[], result: DocumentResult): void {
  const ocrPages = result.pages
    .filter((page) => OCR_WORTHY_STATUSES.has(page.quality.nativeTextStatus))
    .map((page) => page.page);
  const firstPages = result.pages.slice(0, 10).map((page) => page.page);

  lines.push('', '## Next step', '');
  lines.push(`- \`read_pdf(pages: "${formatPageRanges(firstPages)}")\` — read from the start`);
  lines.push('- `search_pdf(query: "…")` — locate a term, then read or render only the pages it hits');
  if (ocrPages.length > 0) {
    lines.push(
      `- \`read_pdf(pages: "${formatPageRanges(ocrPages.slice(0, 5))}", ocr: "eng")\` — ${ocrPages.length} page(s) have no usable native text (set the language, e.g. \`"jpn+eng"\`)`,
    );
    lines.push(`- \`render_pdf(pages: "${ocrPages[0]}")\` — look at one of those pages instead`);
  }
}

export function renderSummary(result: DocumentResult): string {
  const lines: string[] = [`# ${result.file}`, ''];
  lines.push(`- **Pages:** ${result.totalPages}`);
  if (result.metadata.title) lines.push(`- **Title:** ${cell(result.metadata.title)}`);
  if (result.metadata.author) lines.push(`- **Author:** ${cell(result.metadata.author)}`);
  if (result.metadata.subject) lines.push(`- **Subject:** ${cell(result.metadata.subject)}`);
  if (result.outlineCount) lines.push(`- **Outline:** ${result.outlineCount} top-level entries`);
  if (result.attachmentCount) lines.push(`- **Attachments:** ${result.attachmentCount} embedded file(s)`);
  if (result.javascriptActionCount) {
    lines.push(`- **JavaScript:** ${result.javascriptActionCount} document-level action(s)`);
  }

  if (result.xfa) {
    lines.push(
      '',
      '> **XFA (LiveCycle) form.** The real content lives in an XML stream that standard PDF extraction never sees, so the text below may be only a viewer placeholder. Do not answer from it — report that the document needs Adobe Acrobat/Reader.',
    );
  }

  lines.push(
    '',
    '_Document map: `pages` was not given and the full body exceeds the response budget, so page bodies are omitted._',
  );

  appendGroupedTable(
    lines,
    'Native text quality',
    'Status',
    groupByKey(result.pages, (page) => [page.quality.nativeTextStatus]),
  );
  appendGroupedTable(
    lines,
    'Warnings',
    'Code',
    groupByKey(result.pages, (page) => (page.warnings ?? []).map((warning) => warning.code)),
  );
  if (result.outline) appendOutline(lines, result.outline);
  appendNextSteps(lines, result);

  return lines.join('\n');
}
