import type { LayoutBlock, LayoutLine } from '../../types/index.js';
import { sortColumnRun } from './columnBottomNotes.js';
import { median } from './geometry.js';

/** Horizontal band a column's text occupies. */
interface ColumnExtent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const EDGE_TOLERANCE_PT = 1;
const SPLICE_ROW_OVERLAP_RATIO = 0.6;
/** Justified word spaces that split a line run to a few em; a gap wider
 *  than this is layout, not a word space. */
const SPLICE_MAX_GAP_EM = 6;
const SHORT_FRAGMENT_MAX_CHARS = 24;
const LABEL_MAX_CHARS = 8;
const LETTER_RE = /\p{L}/u;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

/**
 * Column membership after the x-cluster pass, refined so that what
 * interrupts a column does not cut it:
 *
 * - A column whose band lies inside another column's band, and whose
 *   blocks never sit beside that column's blocks (or which is a lone
 *   region unit, see regionOrder.ts), is the same column
 *   narrowed — text run around an inset photo — and is merged into it,
 *   so the narrowed segment is read in its place down the column instead
 *   of after the whole column.
 * - A narrow block that belongs to no column but lies within one column's
 *   band (or bands nested in it) running past it (a justified word cut off its line, a right-aligned jump
 *   line, a pull-quote credit) joins that column. Left out, it would end
 *   the column run and every column would be read segment by segment. A
 *   one-line fragment on the baseline of a line it continues is spliced
 *   back onto that line and returned in `spliced`.
 */
export function refineColumnMembership(
  narrow: readonly LayoutBlock[],
  columnOf: Map<LayoutBlock, number>,
  columnCount: number,
  separators: ReadonlySet<LayoutBlock>,
  units: ReadonlySet<LayoutBlock> = new Set(),
): { extents: ColumnExtent[]; spliced: Set<LayoutBlock> } {
  let extents = columnExtents(columnOf, columnCount);
  const spliced = new Set<LayoutBlock>();
  const remap = nestedColumnRemap(columnOf, extents, units);
  if (remap) {
    const resolve = (column: number): number => (remap[column] === column ? column : resolve(remap[column]));
    for (const [block, column] of columnOf) columnOf.set(block, resolve(column));
    extents = columnExtents(columnOf, columnCount);
  }
  for (const block of narrow) {
    if (columnOf.has(block) || separators.has(block)) continue;
    const overlapping = extents.flatMap((extent, column) =>
      extent.right > extent.left && overlapsBand(block, extent) && activeAt(block, extent) ? [column] : [],
    );
    // Bands nested in one another (a column and the indented band of its
    // continuation lines) are one place on the page: the widest is the column.
    if (overlapping.length === 0 || sideBySideCount(new Set(overlapping), extents) !== 1) continue;
    const column = overlapping.reduce((best, c) =>
      extents[c].right - extents[c].left > extents[best].right - extents[best].left ? c : best,
    );
    columnOf.set(block, column);
    if (spliceOntoLine(block, column, columnOf)) spliced.add(block);
  }
  // A short one-line block inside a column's band, on the baseline of one
  // of its lines, is a word cut off that line — even when it happens to
  // line up with another stray and form a "column" of its own.
  for (const block of narrow) {
    if (spliced.has(block) || separators.has(block) || !isShortFragment(block)) continue;
    const own = columnOf.get(block);
    for (let column = 0; column < extents.length; column++) {
      if (column === own || !withinBand(block, extents[column]) || !activeAt(block, extents[column])) continue;
      if (spliceOntoLine(block, column, columnOf)) {
        spliced.add(block);
        break;
      }
    }
  }
  for (const block of spliced) columnOf.delete(block);
  return { extents, spliced };
}

/**
 * Put a one-line fragment back on the line it was cut from: the last word
 * of a justified line set with word spaces wide enough to split the line
 * (`telephone 555–0142, email`). The fragment sits on that line's baseline,
 * to the right of where it ends, in the same column.
 */
function spliceOntoLine(fragment: LayoutBlock, column: number, columnOf: ReadonlyMap<LayoutBlock, number>): boolean {
  if (fragment.lines.length !== 1 || !LETTER_RE.test(fragment.text)) return false;
  const piece = fragment.lines[0];
  let best: { block: LayoutBlock; line: LayoutLine; gap: number } | undefined;
  for (const [block, c] of columnOf) {
    if (c !== column || block === fragment || block.writingMode) continue;
    for (const line of block.lines) {
      // The cut-off piece is a word; a bare currency sign or rule character
      // beside it is a table cell, not the rest of its line.
      if (!WORD_CHAR_RE.test(line.text)) continue;
      const gap = piece.x - (line.x + line.width);
      if (gap < -EDGE_TOLERANCE_PT || gap > Math.max(piece.fontSize, 1) * SPLICE_MAX_GAP_EM) continue;
      const overlap = Math.min(line.y + line.height, piece.y + piece.height) - Math.max(line.y, piece.y);
      if (overlap < Math.min(line.height, piece.height) * SPLICE_ROW_OVERLAP_RATIO) continue;
      if (Math.abs(line.fontSize - piece.fontSize) > Math.max(line.fontSize, piece.fontSize) * 0.1) continue;
      if (!best || gap < best.gap) best = { block, line, gap };
    }
  }
  if (!best) return false;
  const { block, line } = best;
  // A new line object: table detection already holds the original lines.
  const joined: LayoutLine = { ...line, text: `${line.text} ${piece.text}`, width: piece.x + piece.width - line.x };
  block.lines = block.lines.map((l) => (l === line ? joined : l));
  block.text = block.lines.map((l) => l.text).join('\n');
  const right = Math.max(block.x + block.width, joined.x + joined.width);
  block.width = right - block.x;
  return true;
}

/**
 * Walk y-ordered blocks, buffering column members and emitting them by
 * (column, y) when a separator arrives. A separator does not cut a column
 * it leaves alone and that runs on beside it (a sidebar next to a
 * full-width abstract, the next column beside a section heading): that
 * column stays buffered whole and is read after the separator, instead of
 * being split around it. A short label on the separator's first line (a
 * list or section number) does not count as running beside it. A
 * separator that crosses no column (a margin note, a side table's header)
 * ends the run as before.
 */
export function walkColumnRuns(
  blocks: readonly LayoutBlock[],
  columnOf: ReadonlyMap<LayoutBlock, number>,
  extents: readonly ColumnExtent[],
  isSeparator: (block: LayoutBlock) => boolean,
  pageHeight: number,
): LayoutBlock[] {
  const out: LayoutBlock[] = [];
  let pending: LayoutBlock[] = [];
  for (const block of blocks) {
    if (!isSeparator(block)) {
      pending.push(block);
      continue;
    }
    const crossed = new Set(extents.flatMap((extent, column) => (overlapsBand(block, extent) ? [column] : [])));
    const besideColumns = new Set<number>();
    // A block that spans columns side by side (a full-width abstract) leaves
    // alone the columns running beside it on either side. A block inside one
    // column (a section heading, a stray fragment) leaves alone only the
    // columns to its right, which are read after its column anyway; a column
    // to its left is read first, so it is cut as before.
    const spread = sideBySideCount(crossed, extents);
    if (spread >= 1) {
      const crossedRight = Math.max(...[...crossed].map((c) => extents[c].right));
      for (const member of pending) {
        const column = columnOf.get(member);
        if (column === undefined || crossed.has(column)) continue;
        if (spread === 1 && extents[column].left < crossedRight - EDGE_TOLERANCE_PT) continue;
        if (!besideSeparator(member, block, spread) || labelsFirstRow(member, block)) continue;
        besideColumns.add(column);
      }
    }
    const cut: LayoutBlock[] = [];
    const kept: LayoutBlock[] = [];
    for (const member of pending) {
      if (besideColumns.has(columnOf.get(member) ?? -1)) kept.push(member);
      else cut.push(member);
    }
    sortColumnRun(cut, columnOf, pageHeight);
    out.push(...cut, block);
    pending = kept;
  }
  sortColumnRun(pending, columnOf, pageHeight);
  out.push(...pending);
  return out;
}

/** How many of `columns` sit side by side: bands that overlap each other
 *  (a column and an indented band inside it) count once. */
function sideBySideCount(columns: ReadonlySet<number>, extents: readonly ColumnExtent[]): number {
  const bands = [...columns].map((c) => extents[c]).sort((a, b) => a.left - b.left);
  let count = 0;
  let right = Number.NEGATIVE_INFINITY;
  for (const band of bands) {
    if (band.left >= right - EDGE_TOLERANCE_PT) count++;
    right = Math.max(right, band.right);
  }
  return count;
}

function columnExtents(columnOf: ReadonlyMap<LayoutBlock, number>, columnCount: number): ColumnExtent[] {
  const members: LayoutBlock[][] = Array.from({ length: columnCount }, () => []);
  for (const [block, column] of columnOf) members[column]?.push(block);
  return members.map((list) =>
    list.length === 0
      ? { left: 0, right: 0, top: 0, bottom: 0 }
      : {
          left: median(list.map((b) => b.x)),
          right: median(list.map((b) => b.x + b.width)),
          top: Math.min(...list.map((b) => b.y)),
          bottom: Math.max(...list.map((b) => b.y + b.height)),
        },
  );
}

function nestedColumnRemap(
  columnOf: ReadonlyMap<LayoutBlock, number>,
  extents: ColumnExtent[],
  units: ReadonlySet<LayoutBlock>,
): number[] | undefined {
  const members: LayoutBlock[][] = extents.map(() => []);
  for (const [block, column] of columnOf) members[column]?.push(block);
  const remap = extents.map((_, i) => i);
  let changed = false;
  for (let inner = 0; inner < extents.length; inner++) {
    for (let outer = 0; outer < extents.length; outer++) {
      if (outer === inner || remap[outer] !== outer) continue;
      const a = extents[inner];
      const b = extents[outer];
      // A lone region unit (a figure inside a column) belongs to the column
      // it starts in, even where it is drawn wider than the column's typical
      // line or an axis title or caption of its own sits beside it.
      const loneUnit = members[inner].length === 1 && units.has(members[inner][0]);
      if (a.left <= b.left || a.left >= b.right) continue;
      if (!loneUnit && a.right > b.right + EDGE_TOLERANCE_PT) continue;
      if (!loneUnit && members[inner].some((x) => members[outer].some((y) => verticallyOverlap(x, y)))) continue;
      remap[inner] = outer;
      changed = true;
      break;
    }
  }
  return changed ? remap : undefined;
}

function isShortFragment(block: LayoutBlock): boolean {
  return block.lines.length === 1 && block.text.replace(/\s+/gu, '').length <= SHORT_FRAGMENT_MAX_CHARS;
}

function withinBand(block: LayoutBlock, extent: ColumnExtent): boolean {
  return (
    extent.right > extent.left &&
    block.x >= extent.left - EDGE_TOLERANCE_PT &&
    block.x + block.width <= extent.right + EDGE_TOLERANCE_PT
  );
}

function besideSeparator(member: LayoutBlock, separator: LayoutBlock, spread: number): boolean {
  if (spread >= 2) return runsInto(member, separator);
  return member.y + member.height > separator.y + EDGE_TOLERANCE_PT;
}

/** The member was already running when the separator starts and goes on
 *  beside it. Text on the separator's own first row (a footer line, a page
 *  number beside it) is not a column running alongside. */
function runsInto(member: LayoutBlock, separator: LayoutBlock): boolean {
  const lineHeight = Math.min(member.lines[0]?.height ?? member.height, separator.lines[0]?.height ?? separator.height);
  return member.y + member.height > separator.y + EDGE_TOLERANCE_PT && member.y < separator.y - lineHeight / 2;
}

/** A list number or TOC section number on the separator's first line is
 *  that line's label, not a column running beside it. */
function labelsFirstRow(member: LayoutBlock, separator: LayoutBlock): boolean {
  const first = separator.lines[0];
  if (!first || !isShortFragment(member) || member.text.replace(/\s+/gu, '').length > LABEL_MAX_CHARS) return false;
  const overlap = Math.min(first.y + first.height, member.y + member.height) - Math.max(first.y, member.y);
  return overlap >= Math.min(first.height, member.height) * SPLICE_ROW_OVERLAP_RATIO;
}

function overlapsBand(block: LayoutBlock, extent: ColumnExtent): boolean {
  return block.x < extent.right - EDGE_TOLERANCE_PT && block.x + block.width > extent.left + EDGE_TOLERANCE_PT;
}

/** Whether the column has text above and below the block's middle — a
 *  column of author lines above the body does not claim a fragment
 *  inside the body. */
function activeAt(block: LayoutBlock, extent: ColumnExtent): boolean {
  const middle = block.y + block.height / 2;
  return middle >= extent.top && middle <= extent.bottom;
}

function verticallyOverlap(a: LayoutBlock, b: LayoutBlock): boolean {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EDGE_TOLERANCE_PT;
}
