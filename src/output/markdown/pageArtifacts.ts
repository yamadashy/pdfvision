import { READING_ORDER_REMEDY } from '../../core/warnings/readingOrder/remedy.js';
import type { PageResult, PageWarning } from '../../types/index.js';
import { escapeInline, formatJavaScriptActions } from './helpers.js';

export function appendJavaScriptActions(lines: string[], page: PageResult): void {
  if (!page.jsActions) return;

  lines.push('');
  lines.push('### JavaScript actions');
  lines.push('');
  lines.push(`- ${escapeInline(formatJavaScriptActions(page.jsActions))}`);
}

/**
 * What a Markdown reader should do about a reading-order divergence,
 * given that the body above it is the rebuilt order.
 *
 * The core default — "prefer layout.blocks order" — names an artifact
 * this surface never emits and a step it has already taken. An MCP
 * caller reading it either discounts correct output or goes looking for
 * a parameter that does not exist; both cost tokens and confidence for
 * no gain.
 */
const READING_ORDER_REMEDY_APPLIED =
  'the body above is that reading order, rebuilt from the layout — render the page when exact sequence is critical';

function warningMessage(warning: PageWarning, layoutRebuilt: boolean): string {
  if (!layoutRebuilt || warning.code !== 'reading_order_divergence') return warning.message;
  if (!warning.message.endsWith(READING_ORDER_REMEDY)) return warning.message;
  return `${warning.message.slice(0, -READING_ORDER_REMEDY.length)}${READING_ORDER_REMEDY_APPLIED}`;
}

export function appendWarnings(lines: string[], page: PageResult, layoutRebuilt = false): void {
  if (!page.warnings || page.warnings.length === 0) return;

  lines.push('');
  lines.push('### Warnings');
  lines.push('');
  for (const warning of page.warnings) {
    lines.push(`> **${warning.severity}** (${warning.code}): ${warningMessage(warning, layoutRebuilt)}`);
  }
}

export function appendOcr(lines: string[], page: PageResult): void {
  if (!page.ocr) return;

  const confPct = Math.round(page.ocr.confidence * 100);
  lines.push('');
  lines.push(`### OCR (${page.ocr.lang}, confidence ${confPct}%)`);
  if (page.ocr.text) {
    lines.push('');
    lines.push(page.ocr.text);
  }
}

export function appendPageImage(lines: string[], page: PageResult): void {
  if (!page.image) return;

  lines.push('');
  lines.push(`![Page ${page.page}](<${page.image}>)`);
}
