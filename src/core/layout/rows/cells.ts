import type { LayoutBlock, LayoutLine } from '../../../types/index.js';
import { mode, round2, unionBox } from '../geometry.js';

const LETTER_RE = /\p{L}/gu;
const RTL_RE = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/gu;

/**
 * The cells a row line was joined from. Checks that measure text against
 * painted geometry or table cells (a line no table row claims, a label
 * beside a bar, a tiny chart label) need the cells, not the row across them.
 */
const cellsByRow = new WeakMap<LayoutLine, readonly LayoutLine[]>();

export function rowCells(line: LayoutLine): readonly LayoutLine[] {
  return cellsByRow.get(line) ?? [line];
}

/** Every line of `blocks`, with each joined row split back into its cells. */
export function cellLines(blocks: readonly LayoutBlock[]): LayoutLine[] {
  return blocks.flatMap((block) => lineCells(block.lines));
}

/** `lines` with each joined row split back into its cells; `lines` itself when none is a row. */
export function lineCells(lines: readonly LayoutLine[]): readonly LayoutLine[] {
  return lines.some((line) => cellsByRow.has(line)) ? lines.flatMap(rowCells) : lines;
}

/**
 * One line for the row, its cells in reading order (right to left in a
 * right-to-left script) and set apart by a space.
 */
export function joinRow(cells: readonly LayoutLine[]): LayoutLine {
  const text = cells.map((cell) => cell.text).join('');
  const rtl = (text.match(RTL_RE)?.length ?? 0) > (text.match(LETTER_RE)?.length ?? 0) / 2;
  const ordered = rtl ? [...cells].reverse() : cells;
  const line: LayoutLine = {
    text: ordered
      .map((cell) => cell.text.trim())
      .filter((part) => part.length > 0)
      .join(' '),
    ...unionBox(cells),
    fontSize: round2(mode(cells.map((cell) => cell.fontSize))),
  };
  cellsByRow.set(line, cells);
  return line;
}
