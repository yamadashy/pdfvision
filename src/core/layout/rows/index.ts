import type { LayoutBlock, LayoutLine } from '../../../types/index.js';
import type { ColumnGutter } from '../columnGutters.js';
import { type BBox, unionBox } from '../geometry.js';
import type { LayoutRegion } from '../regions.js';
import type { TableRule } from '../tableRules.js';
import { hasVerticalTextShape } from '../verticalText.js';
import { joinRow, rowCells } from './cells.js';
import { marginLineNumbers } from './lineNumbers.js';
import { findRowRuns, groupRows } from './runs.js';
import { center, MIN_RUN_ROWS, type RowRun } from './shared.js';

export { cellLines, lineCells, rowCells } from './cells.js';

/**
 * Short runs set on one baseline across a region — a contents entry and its
 * page number, a hazard code and its statement, a receipt line and its
 * price, the cells of a table without rules — are one row. Line building
 * splits them at the wide gap between them, and block building then stacks
 * each column into a block of its own, so the page reads every label and
 * then every value, and a label lands next to the wrong value whenever one
 * row has none. Here such rows are joined back into one line each, cells in
 * reading order, wherever at least three of them follow one another on one
 * column grid. The run's lines are one block (a block inside it that is not
 * a cell, such as a part heading between entries, stays a block of its
 * own), and the run is read as one unit, a `rows` region.
 *
 * Text columns are not rows and are left alone: see runs.ts and columns.ts
 * for what tells them apart.
 */
export interface AlignedRowRun extends BBox {
  /** The run's blocks in reading order: joined rows, and blocks kept whole inside it. */
  blocks: LayoutBlock[];
  /** Lines of its blocks left above it (a list's heading), for reading indents. */
  above: LayoutLine[];
}

export interface AlignedRows {
  blocks: LayoutBlock[];
  runs: AlignedRowRun[];
  /** The painted regions, when they were found and still hold for `blocks` (no run was read). */
  regions?: readonly LayoutRegion[];
  /**
   * Each run's first column as one block: the labels whose indents give
   * each entry its depth, which the run's blocks (cut at headings, one row
   * per line) no longer show whole.
   */
  sources?: readonly LayoutBlock[];
}

export interface AlignedRowContext {
  /** Prose column gutters found while building lines. */
  gutters?: readonly ColumnGutter[];
  /** Painted vertical rules: a ruled grid is read cell by cell from its rules. */
  verticalRules?: readonly TableRule[];
  /** The page's painted regions, for blocks as they stand before rows are read. */
  regions?: (blocks: readonly LayoutBlock[]) => readonly LayoutRegion[];
  /** Blocks read some other way, kept as they are. */
  exclude?: ReadonlySet<LayoutBlock>;
}

const OVERLAP_TOLERANCE_PT = 1;

export function readAlignedRows(blocks: readonly LayoutBlock[], context: AlignedRowContext = {}): AlignedRows {
  const unchanged: AlignedRows = { blocks: [...blocks], runs: [] };
  const ownerOf = new Map<LayoutLine, LayoutBlock>();
  for (const block of blocks) {
    if (!isEligibleBlock(block) || context.exclude?.has(block)) continue;
    for (const line of block.lines) ownerOf.set(line, block);
  }
  if (ownerOf.size < MIN_RUN_ROWS * 2) return unchanged;

  const numbering = marginLineNumbers([...ownerOf.keys()]);
  const lines = [...ownerOf.keys()].filter((line) => !numbering.has(line));
  const separators = { gutters: context.gutters ?? [], verticalRules: context.verticalRules ?? [] };
  // Painted regions cost a pass over the page's graphics: look for them only
  // where rows are possible at all.
  if (findRowRuns(groupRows(lines), { ...separators, boxOf: () => '' }).length === 0) return unchanged;
  const regions = context.regions?.(blocks) ?? [];
  const withRegions = { blocks: [...blocks], runs: [], regions };
  const rows = groupByRegion(
    lines,
    regionKeys(regions, ownerOf, (region) => region.marks > 0),
  )
    .flatMap(groupRows)
    .sort((a, b) => a.top - b.top || a.cells[0].x - b.cells[0].x);
  const candidates = findRowRuns(rows, {
    ...separators,
    boxOf: regionKeys(regions, ownerOf, (region) => region.marks === 0),
  });
  if (candidates.length === 0) return withRegions;

  const replaced = new Map<LayoutBlock, LayoutBlock[]>();
  const runs: AlignedRowRun[] = [];
  for (const candidate of candidates) {
    const applied = applyRun(candidate, ownerOf, replaced);
    if (applied) runs.push(applied);
  }
  if (runs.length === 0) return withRegions;
  const original = new Set(blocks);
  const added = runs.flatMap((run) => run.blocks).filter((block) => !original.has(block));
  return {
    blocks: [...blocks.flatMap((block) => replaced.get(block) ?? [block]), ...added],
    runs,
    // Each run's first column, every line of the run in order with the lines
    // its blocks left above it: indents read over the whole label column.
    sources: runs.map((run) => {
      // A row of values alone (under a label that wraps) is no entry of the column.
      // A line under another column (a statement's detail line) is no entry of the first.
      const columnRight = Math.min(
        ...run.blocks.flatMap((block) =>
          block.lines
            .filter((line) => rowCells(line).length > 1)
            .map((line) => {
              const head = rowCells(line)[0];
              return head.x + head.width;
            }),
        ),
      );
      const heads = run.blocks.flatMap((block) => block.lines.map((line) => rowCells(line)[0]));
      const lines = [...run.above, ...heads]
        .filter((line) => /\p{L}/u.test(line.text) && line.x < columnRight)
        .sort((a, b) => a.y - b.y);
      return { text: lines.map((line) => line.text).join('\n'), ...unionBox(lines), lines };
    }),
  };
}

/** The runs as layout regions, so the page orders each as one unit. */
export function alignedRowRegions(runs: readonly AlignedRowRun[]): LayoutRegion[] {
  return runs.map((run) => ({
    kind: 'rows',
    x: run.x,
    y: run.y,
    width: run.width,
    height: run.height,
    blocks: run.blocks,
    graphicCount: 0,
    marks: 0,
    verticalMarks: false,
    bars: false,
  }));
}

function isEligibleBlock(block: LayoutBlock): boolean {
  return (
    block.writingMode === undefined &&
    block.role !== 'code' &&
    block.lines.length > 0 &&
    !block.lines.some((line) => line.writingMode !== undefined || hasVerticalTextShape(line))
  );
}

/**
 * Which of the `counted` regions hold each line's block. Rows are read
 * separately inside and outside a drawing with marks of its own (bars,
 * plot symbols, icons): the tick labels of a chart beside a table share the
 * table's baselines, not its rows. Boxes without marks (frames, tinted
 * panels) keep a row from joining two of them — two boxes of a slide side by
 * side — but not a box with the text beside it, as a tinted label column.
 */
function regionKeys(
  regions: readonly LayoutRegion[],
  ownerOf: ReadonlyMap<LayoutLine, LayoutBlock>,
  counted: (region: LayoutRegion) => boolean,
): (line: LayoutLine) => string {
  const keyOf = new Map<LayoutBlock, string>();
  regions.forEach((region, index) => {
    if (!counted(region)) return;
    for (const block of region.blocks) keyOf.set(block, `${keyOf.get(block) ?? ''},${index}`);
  });
  if (keyOf.size === 0) return () => '';
  return (line) => {
    const owner = ownerOf.get(line);
    return (owner && keyOf.get(owner)) ?? '';
  };
}

function groupByRegion(lines: readonly LayoutLine[], regionOf: (line: LayoutLine) => string): LayoutLine[][] {
  const groups = new Map<string, LayoutLine[]>();
  for (const line of lines) {
    const key = regionOf(line);
    const group = groups.get(key);
    if (group) group.push(line);
    else groups.set(key, [line]);
  }
  return [...groups.values()];
}

/**
 * Rewrite the blocks a run covers. Returns undefined, leaving the blocks as
 * they are, when the run would cut a block that lies mostly outside it, or
 * part of one that is not its own.
 */
function applyRun(
  run: RowRun,
  ownerOf: ReadonlyMap<LayoutLine, LayoutBlock>,
  replaced: Map<LayoutBlock, LayoutBlock[]>,
): AlignedRowRun | undefined {
  const top = Math.min(...run.rows.map((row) => row.top));
  const bottom = Math.max(...run.rows.map((row) => row.bottom));
  const besideRows = (line: LayoutLine) => center(line) >= top && center(line) <= bottom;
  const inside = (line: LayoutLine) =>
    besideRows(line) &&
    line.x < run.right - OVERLAP_TOLERANCE_PT &&
    line.x + line.width > run.left + OVERLAP_TOLERANCE_PT;
  const cells = new Set(run.rows.flatMap((row) => row.cells));
  const touched = new Set([...cells].map((cell) => ownerOf.get(cell)).filter((block) => block !== undefined));
  for (const block of touched) {
    if (replaced.has(block)) return undefined;
    // A cell wraps onto a line or two; a paragraph beside the rows runs on past them.
    const within = block.lines.filter(besideRows).length;
    if (block.lines.length - within > Math.max(1, Math.floor(within / 2))) return undefined;
  }
  // Other blocks inside the run's box are kept whole, in their place; a
  // block that only partly lies inside it means the run crosses text.
  const kept: LayoutBlock[] = [];
  for (const block of new Set(ownerOf.values())) {
    if (touched.has(block) || !block.lines.some(inside)) continue;
    if (replaced.has(block) || !block.lines.every(inside)) return undefined;
    kept.push(block);
  }

  type Item = { y: number; line?: LayoutLine; block?: LayoutBlock };
  const items: Item[] = run.rows.map((row) => ({ y: row.top, line: joinRow(row.cells) }));
  // A block's lines above the run (a list's heading) stay a block of their
  // own; its lines below the run are the last cell running on, and stay with it.
  const above: LayoutLine[] = [];
  for (const block of touched) {
    const before: LayoutLine[] = [];
    for (const line of block.lines) {
      if (cells.has(line)) continue;
      if (center(line) < top) before.push(line);
      else items.push({ y: line.y, line });
    }
    replaced.set(block, before.length > 0 ? [withLines(block, before)] : []);
    above.push(...before);
  }
  for (const block of kept) items.push({ y: block.y, block });
  items.sort((a, b) => a.y - b.y);

  const blocks: LayoutBlock[] = [];
  let pending: LayoutLine[] = [];
  const flush = () => {
    if (pending.length > 0) blocks.push(withLines({}, pending));
    pending = [];
  };
  for (const item of items) {
    if (item.line) {
      pending.push(item.line);
      continue;
    }
    flush();
    if (item.block) blocks.push(item.block);
  }
  flush();
  return { ...unionBox(blocks), blocks, above };
}

function withLines(block: Partial<LayoutBlock>, lines: LayoutLine[]): LayoutBlock {
  return { ...block, text: lines.map((line) => line.text).join('\n'), ...unionBox(lines), lines };
}
