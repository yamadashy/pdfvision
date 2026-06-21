import type { PageResult } from '../../types/index.js';
import { escapeAttr, escapeText } from './helpers.js';

export function appendPageLayoutSections(out: string[], page: PageResult): void {
  appendSpans(out, page);
  appendLayout(out, page);
  appendImageBoxes(out, page);
  appendVectorBoxes(out, page);
}

function appendSpans(out: string[], page: PageResult): void {
  if (!page.spans || page.spans.length === 0) return;

  out.push('<spans>');
  for (const span of page.spans) {
    const spanAttrs = [
      `text="${escapeAttr(span.text)}"`,
      `x="${span.x}"`,
      `y="${span.y}"`,
      `width="${span.width}"`,
      `height="${span.height}"`,
      `fontSize="${span.fontSize}"`,
    ];
    if (span.fontName) spanAttrs.push(`fontName="${escapeAttr(span.fontName)}"`);
    out.push(`<span ${spanAttrs.join(' ')}/>`);
  }
  out.push('</spans>');
}

function appendLayout(out: string[], page: PageResult): void {
  if (!page.layout) return;

  if (page.layout.blocks.length === 0 && (!page.layout.tables || page.layout.tables.length === 0)) {
    // Mirror the <imageBoxes/> pattern: a self-closing tag tells
    // downstream agents "we ran the layout pass and found nothing"
    // rather than "layout was not requested".
    out.push('<layout/>');
    return;
  }

  out.push('<layout>');
  appendLayoutBlocks(out, page);
  appendLayoutTables(out, page);
  out.push('</layout>');
}

function appendLayoutBlocks(out: string[], page: PageResult): void {
  if (!page.layout || page.layout.blocks.length === 0) return;

  for (const block of page.layout.blocks) {
    const blockAttrs = [`x="${block.x}"`, `y="${block.y}"`, `width="${block.width}"`, `height="${block.height}"`];
    if (block.role) blockAttrs.push(`role="${block.role}"`);
    if (block.level !== undefined) blockAttrs.push(`level="${block.level}"`);
    if (block.roleConfidence !== undefined) blockAttrs.push(`roleConfidence="${block.roleConfidence}"`);
    if (block.writingMode) blockAttrs.push(`writingMode="${block.writingMode}"`);
    if (block.repeated) blockAttrs.push('repeated="true"');
    out.push(`<block ${blockAttrs.join(' ')}>`);
    for (const line of block.lines) {
      const lineAttrs = [
        `x="${line.x}"`,
        `y="${line.y}"`,
        `width="${line.width}"`,
        `height="${line.height}"`,
        `fontSize="${line.fontSize}"`,
      ];
      if (line.writingMode) lineAttrs.push(`writingMode="${line.writingMode}"`);
      out.push(`<line ${lineAttrs.join(' ')}>${escapeText(line.text)}</line>`);
    }
    out.push('</block>');
  }
}

function appendLayoutTables(out: string[], page: PageResult): void {
  if (!page.layout?.tables || page.layout.tables.length === 0) return;

  out.push('<tables>');
  for (const table of page.layout.tables) {
    out.push(
      `<table x="${table.x}" y="${table.y}" width="${table.width}" height="${table.height}" rowCount="${table.rowCount}" columnCount="${table.columnCount}">`,
    );
    for (const row of table.rows) {
      out.push(`<row y="${row.y}" height="${row.height}">`);
      for (const cell of row.cells) {
        out.push(
          `<cell x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}">${escapeText(cell.text)}</cell>`,
        );
      }
      out.push('</row>');
    }
    out.push('</table>');
  }
  out.push('</tables>');
}

function appendImageBoxes(out: string[], page: PageResult): void {
  if (!page.imageBoxes) return;

  if (page.imageBoxes.length === 0) {
    out.push('<imageBoxes/>');
    return;
  }

  out.push('<imageBoxes>');
  for (const box of page.imageBoxes) {
    out.push(`<imageBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
  }
  out.push('</imageBoxes>');
}

function appendVectorBoxes(out: string[], page: PageResult): void {
  if (!page.vectorBoxes) return;

  if (page.vectorBoxes.length === 0) {
    out.push('<vectorBoxes/>');
    return;
  }

  out.push('<vectorBoxes>');
  for (const box of page.vectorBoxes) {
    out.push(`<vectorBox x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`);
  }
  out.push('</vectorBoxes>');
}
