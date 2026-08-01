import { formatPageRange } from '../core/options/pageRange.js';
import type { DocumentOutlineItem, DocumentResult, PageResult } from '../types/index.js';
import { escapeInline, escapeTableCell } from './markdown/helpers.js';

/**
 * A map of a document instead of its contents: metadata, native-text
 * quality and warning codes grouped into page ranges, and the outline.
 *
 * This is not the Markdown formatter with the body removed — the point is
 * aggregation. A 312-row Overview table is itself a size problem, so
 * repeated statuses collapse into `12-33` style ranges. Callers append
 * their own trailer (the MCP server suggests its next tool calls there);
 * this formatter only reports what the document is.
 */

/** Rows of per-value detail before the table is cut short. */
const MAX_DETAIL_ROWS = 40;

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
  for (const [value, pages] of rows.slice(0, MAX_DETAIL_ROWS)) {
    lines.push(`| \`${escapeTableCell(value)}\` | ${pages.length} | ${formatPageRange(pages)} |`);
  }
  if (rows.length > MAX_DETAIL_ROWS) {
    lines.push('', `_${rows.length - MAX_DETAIL_ROWS} further row(s) omitted._`);
  }
}

function appendOutline(lines: string[], outline: readonly DocumentOutlineItem[]): void {
  if (outline.length === 0) return;
  lines.push('', '## Outline', '');
  let emitted = 0;
  for (const item of outline) {
    if (emitted >= MAX_DETAIL_ROWS) {
      lines.push(`- _…${outline.length - emitted} further top-level entries omitted._`);
      break;
    }
    lines.push(`- ${escapeInline(item.title)}${item.page !== undefined ? ` — p.${item.page}` : ''}`);
    emitted += 1;
    // Depth 2 only: deeper bookmark trees are navigation noise at map scale.
    for (const child of item.items ?? []) {
      if (emitted >= MAX_DETAIL_ROWS) break;
      lines.push(`  - ${escapeInline(child.title)}${child.page !== undefined ? ` — p.${child.page}` : ''}`);
      emitted += 1;
    }
  }
}

export function formatDocumentMap(result: DocumentResult): string {
  const lines: string[] = [`# ${result.file}`, ''];
  lines.push(`- **Pages:** ${result.totalPages}`);
  if (result.metadata.title) lines.push(`- **Title:** ${escapeInline(result.metadata.title)}`);
  if (result.metadata.author) lines.push(`- **Author:** ${escapeInline(result.metadata.author)}`);
  if (result.metadata.subject) lines.push(`- **Subject:** ${escapeInline(result.metadata.subject)}`);
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

  lines.push('', '_Document map: page bodies are omitted._');

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

  return lines.join('\n');
}
