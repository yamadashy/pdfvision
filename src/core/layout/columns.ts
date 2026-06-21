import type { LayoutBlock, LayoutLine } from '../../types/index.js';
import { sortColumnRun } from './columnBottomNotes.js';
import { median, unionBox } from './geometry.js';
import { isNumberedHeadingText } from './headings.js';

/**
 * Detect a multi-column layout and reorder blocks into reading order.
 *
 * A naive top-down sort interleaves columns: line 1 of the left column,
 * then line 1 of the right column, then line 2 of the left, etc. — which
 * is unreadable for any agent that doesn't already know the page is
 * multi-column. Re-ordering by (column, y) preserves the intended flow.
 *
 * Detection is intentionally conservative — false-positive columns are
 * worse than missing them, since they scramble single-column documents:
 *
 *   1. Treat blocks wider than 60% of the page as `spanning` (likely
 *      page-spanning headings, footers). They keep their position in the
 *      y-ordered output and act as group separators.
 *   2. Cluster the remaining `narrow` blocks (including headings) by
 *      their left-edge x. Two blocks share a column when their x's are
 *      within 5% of the page width of each other.
 *   3. Promote standalone headings (a heading block with no parallel
 *      block in another column at a similar y) to spanning separators.
 *      This catches both shapes that would otherwise misorder a real
 *      page: a left-aligned section heading that joined the left
 *      column, and a centered heading that opened its own one-block
 *      cluster between the two real columns. Parallel-heading layouts
 *      (one heading per column at the same y) keep their column
 *      membership so the body underneath each heading reads with that
 *      column, not as a single "all headings then all bodies" flush.
 *   4. Re-attach singleton narrow clusters that sit very close to a
 *      surviving column's left edge. These are usually paragraph indents,
 *      not page-wide separators.
 *   5. Reject if (after pruning promoted headings) there's only one
 *      surviving column, or any surviving column has < 2 blocks — a
 *      lone block sitting at a different x is just an indent, not a
 *      column.
 *   6. Walk the y-ordered blocks; whenever a run of narrow column
 *      blocks sits between two spanning blocks (or the page edge),
 *      reorder that run by (column index, y).
 */
export function reorderForColumns(blocks: LayoutBlock[], pageWidth: number, pageHeight = 0): LayoutBlock[] {
  if (blocks.length < 4 || pageWidth <= 0) return blocks;

  const spanThreshold = pageWidth * 0.6;
  const xEpsilon = pageWidth * 0.05;

  const narrow = blocks.filter((b) => b.width < spanThreshold && b.writingMode !== 'vertical');
  if (narrow.length < 4) return blocks;

  // Cluster narrow blocks by left edge x. Sorted ascending so each new
  // block joins the most recent column whose representative x is within
  // xEpsilon, otherwise opens a new column.
  const sortedByX = [...narrow].sort((a, b) => a.x - b.x);
  const initialColumns: LayoutBlock[][] = [[sortedByX[0]]];
  for (let i = 1; i < sortedByX.length; i++) {
    const last = initialColumns[initialColumns.length - 1];
    const colX = last[0].x;
    if (sortedByX[i].x - colX <= xEpsilon) {
      last.push(sortedByX[i]);
    } else {
      initialColumns.push([sortedByX[i]]);
    }
  }

  // Initial column-of-block map used by the standalone-heading test
  // below — even a singleton-x heading cluster gets a column index here,
  // so the parallelism check can compare its y against blocks in *other*
  // columns regardless of where the heading sat in x.
  const initialColumnOf = new Map<LayoutBlock, number>();
  for (let ci = 0; ci < initialColumns.length; ci++) {
    for (const b of initialColumns[ci]) initialColumnOf.set(b, ci);
  }

  // Promote standalone headings (heading blocks with no parallel block
  // in another column at a similar y) to separators *before* validating
  // column counts. Otherwise a centered standalone heading at a unique
  // x would form its own one-block cluster and trip the < 2 guard,
  // disabling reorder for the whole page.
  const hasParallelInOtherColumn = (heading: LayoutBlock): boolean => {
    const ownCol = initialColumnOf.get(heading);
    if (ownCol === undefined) return false;
    const yTop = heading.y;
    const yBot = heading.y + heading.height;
    for (const b of narrow) {
      if (b === heading) continue;
      const otherCol = initialColumnOf.get(b);
      if (otherCol === undefined || otherCol === ownCol) continue;
      const bTop = b.y;
      const bBot = b.y + b.height;
      if (bBot >= yTop && bTop <= yBot) return true;
    }
    return false;
  };
  // Only stronger headings act as column separators. Level 3 candidates
  // (subsections like "3.1.") are typically embedded inside a column;
  // promoting them would break two-column reading order by treating every
  // local subsection break as a page-wide flush. Numbered section headings
  // in papers are also commonly column-local (`1 Introduction` at the top
  // of the left column), so leave them in their column unless their width
  // already made them a normal spanning block.
  const promoted = new Set<LayoutBlock>();
  for (const b of narrow) {
    if (b.role === 'heading' && (b.level ?? 1) <= 2 && !hasParallelInOtherColumn(b) && !isNumberedHeadingText(b.text)) {
      promoted.add(b);
    }
  }

  // Surviving columns are the initial clusters minus promoted blocks.
  // Each surviving column needs ≥ 2 members and we need ≥ 2 surviving
  // columns; otherwise this isn't a real multi-column layout.
  const survivingColumns = initialColumns.map((c) => c.filter((b) => !promoted.has(b))).filter((c) => c.length >= 2);
  if (survivingColumns.length < 2) return blocks;

  const columnOf = new Map<LayoutBlock, number>();
  for (let ci = 0; ci < survivingColumns.length; ci++) {
    for (const b of survivingColumns[ci]) columnOf.set(b, ci);
  }

  const columnAnchors = survivingColumns.map((column) => median(column.map((block) => block.x)));
  for (const b of narrow) {
    if (columnOf.has(b) || promoted.has(b)) continue;
    const nearestColumn = nearestColumnByX(b, columnAnchors, xEpsilon);
    if (nearestColumn !== undefined) columnOf.set(b, nearestColumn);
  }

  // Walk in current (y-ordered) order. Buffer column-member blocks;
  // flush sorted by (column, y) whenever we hit a clearly-spanning
  // block or a promoted standalone heading.
  const out: LayoutBlock[] = [];
  let pending: LayoutBlock[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    sortColumnRun(pending, columnOf, pageHeight);
    out.push(...pending);
    pending = [];
  };
  for (const b of blocks) {
    const isSeparator = !columnOf.has(b) || promoted.has(b);
    if (isSeparator) {
      flush();
      out.push(b);
    } else {
      pending.push(b);
    }
  }
  flush();
  return out;
}

function nearestColumnByX(
  block: LayoutBlock,
  columnAnchors: readonly number[],
  maxDistance: number,
): number | undefined {
  let bestIndex: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < columnAnchors.length; i++) {
    const distance = Math.abs(block.x - columnAnchors[i]);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? bestIndex : undefined;
}

export function mergeAdjacentColumnBlocks(blocks: LayoutBlock[], pageWidth = 0): LayoutBlock[] {
  if (blocks.length < 2) return blocks;
  const out: LayoutBlock[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (prev && canMergeAdjacentBodyBlocks(prev, block, pageWidth)) {
      prev.lines.push(...block.lines);
      prev.text = prev.lines.map((l) => l.text).join('\n');
      const box = unionBox(prev.lines);
      prev.x = box.x;
      prev.y = box.y;
      prev.width = box.width;
      prev.height = box.height;
    } else {
      out.push(block);
    }
  }
  return out;
}

function canMergeAdjacentBodyBlocks(a: LayoutBlock, b: LayoutBlock, pageWidth = 0): boolean {
  if (a.role || b.role) return false;
  if (a.writingMode || b.writingMode) return false;
  if (pageWidth > 0 && (a.width >= pageWidth * 0.6 || b.width >= pageWidth * 0.6)) return false;
  const prevLine = a.lines.at(-1);
  const nextLine = b.lines[0];
  if (!prevLine || !nextLine) return false;

  const gap = b.y - (a.y + a.height);
  if (gap < -0.5 || gap > prevLine.height * 1.0) return false;

  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (overlap <= 0) return false;
  if (overlap < Math.min(a.width, b.width) * 0.25) return false;

  const sizeRatio =
    Math.max(prevLine.fontSize, nextLine.fontSize) / Math.max(Math.min(prevLine.fontSize, nextLine.fontSize), 0.001);
  return sizeRatio <= 1.3;
}

export function isStandaloneNumericLineAfterProse(prev: LayoutLine, line: LayoutLine, pageWidth: number): boolean {
  if (pageWidth <= 0) return false;
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!/^[\p{N}\s.-]{1,12}$/u.test(text)) return false;
  if (line.width > pageWidth * 0.12) return false;
  if (!/\p{L}/u.test(prev.text)) return false;

  const overlap = Math.min(prev.x + prev.width, line.x + line.width) - Math.max(prev.x, line.x);
  return line.x < prev.x || overlap < line.width * 0.5;
}
