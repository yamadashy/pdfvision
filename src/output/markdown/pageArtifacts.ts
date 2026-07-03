import type { PageResult } from '../../types/index.js';
import { escapeInline, formatJavaScriptActions } from './helpers.js';

export function appendJavaScriptActions(lines: string[], page: PageResult): void {
  if (!page.jsActions) return;

  lines.push('');
  lines.push('### JavaScript actions');
  lines.push('');
  lines.push(`- ${escapeInline(formatJavaScriptActions(page.jsActions))}`);
}

export function appendWarnings(lines: string[], page: PageResult): void {
  if (!page.warnings || page.warnings.length === 0) return;

  lines.push('');
  lines.push('### Warnings');
  lines.push('');
  for (const warning of page.warnings) {
    lines.push(`> **${warning.severity}** (${warning.code}): ${warning.message}`);
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
