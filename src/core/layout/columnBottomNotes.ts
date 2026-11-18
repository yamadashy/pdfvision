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
  // The notes are moved after the columns, but not past a folio below them
  // (a page number under a footnote): that still comes last.
  const notesBottom =
    bottomNotes.size > 0
      ? Math.max(...[...bottomNotes].map((block) => block.y + block.height))
      : Number.POSITIVE_INFINITY;
  const foot = new Set(
    pending.filter((block) => !bottomNotes.has(block) && block.y >= notesBottom && isFolioBlock(block)),
  );
  const rank = (block: LayoutBlock) => (foot.has(block) ? 2 : bottomNotes.has(block) ? 1 : 0);
  pending.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ca = columnOf.get(a) ?? 0;
    const cb = columnOf.get(b) ?? 0;
    return ca - cb || a.y - b.y;
  });
}

const FOLIO_MAX_CHARS = 8;

/** A page number or a short folio line (`12`, `- 12 -`, `Page 3`). */
function isFolioBlock(block: LayoutBlock): boolean {
  return (
    block.lines.length === 1 && /\p{N}/u.test(block.text) && block.text.replace(/\s/g, '').length <= FOLIO_MAX_CHARS
  );
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
