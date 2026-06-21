import type { LayoutBlock } from '../../types/index.js';
import { median } from './geometry.js';

const COLUMN_BOTTOM_NOTE_MIN_Y_RATIO = 0.78;
const COLUMN_BOTTOM_NOTE_FONT_RATIO = 0.82;
const COLUMN_BOTTOM_NOTE_MIN_CHARS = 40;

export function sortColumnRun(
  pending: LayoutBlock[],
  columnOf: ReadonlyMap<LayoutBlock, number>,
  pageHeight: number,
): void {
  const bottomNotes = new Set(detectColumnBottomNotes(pending, columnOf, pageHeight));
  pending.sort((a, b) => {
    const aBottomNote = bottomNotes.has(a);
    const bBottomNote = bottomNotes.has(b);
    if (aBottomNote !== bBottomNote) return aBottomNote ? 1 : -1;
    const ca = columnOf.get(a) ?? 0;
    const cb = columnOf.get(b) ?? 0;
    return ca - cb || a.y - b.y;
  });
}

function detectColumnBottomNotes(
  pending: readonly LayoutBlock[],
  columnOf: ReadonlyMap<LayoutBlock, number>,
  pageHeight: number,
): LayoutBlock[] {
  if (pageHeight <= 0 || pending.length < 3) return [];
  const fontSizes = pending.flatMap((block) => block.lines.map((line) => line.fontSize).filter((size) => size > 0));
  if (fontSizes.length === 0) return [];
  const bodyFontSize = median(fontSizes);
  if (bodyFontSize <= 0) return [];

  const isSmallBottomBlock = (block: LayoutBlock): boolean => {
    const column = columnOf.get(block);
    if (column === undefined) return false;
    if (block.y < pageHeight * COLUMN_BOTTOM_NOTE_MIN_Y_RATIO) return false;
    const blockFontSize = median(block.lines.map((line) => line.fontSize).filter((size) => size > 0));
    if (blockFontSize <= 0 || blockFontSize > bodyFontSize * COLUMN_BOTTOM_NOTE_FONT_RATIO) return false;
    return pending.some((other) => {
      if (other === block) return false;
      const otherColumn = columnOf.get(other);
      return otherColumn !== undefined && otherColumn !== column && other.y < block.y;
    });
  };
  const anchors = pending.filter(
    (block) => isSmallBottomBlock(block) && block.text.replace(/\s/g, '').length >= COLUMN_BOTTOM_NOTE_MIN_CHARS,
  );
  if (anchors.length === 0) return [];
  const anchorColumns = new Set(
    anchors.map((block) => columnOf.get(block)).filter((column): column is number => column !== undefined),
  );
  return pending.filter((block) => {
    const column = columnOf.get(block);
    return column !== undefined && isSmallBottomBlock(block) && anchorColumns.has(column);
  });
}
