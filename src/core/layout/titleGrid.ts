import type { LayoutBlock, LayoutLine, TextSpan } from '../../types/index.js';
import { type BBox, mode, round2, unionBox } from './geometry.js';
import { joinLineSpans } from './lineText.js';

/**
 * A grid of centred stacks: the author blocks under a paper's title (name
 * with its footnote marks, affiliation, email), side-by-side signature or
 * contact blocks, two-line captions under sub-figures. Each stack is one
 * unit — its lines belong to each other, not to the stacks beside them —
 * and the grid reads row by row, left to right.
 *
 * The page-wide line pass cannot see this: cells of one row sit on shared
 * baselines, so it joins neighbouring emails into one line when the gap
 * between them is narrower than a column gutter, and the column pass then
 * reads the stacks as columns. So the grid is found from the spans, before
 * lines are built, and its cells come back as finished blocks.
 *
 * Evidence, all of it required:
 * - every cell is two to {@link MAX_CELL_LINES} short lines stacked at line
 *   spacing, centred on one axis;
 * - the centring is real: in most cells the lines' left edges differ, so a
 *   row of left-aligned or justified prose (equal-width lines) never
 *   qualifies;
 * - at least two cells share a row: their first lines start at one height
 *   in one font size, with clear space between the cells;
 * - nothing else is printed inside the row's box.
 */
export interface TitleGridResult {
  /** One block per cell, lines top to bottom. */
  blocks: LayoutBlock[];
  /** Each grid's cells, so the reading order can keep them together and read them row by row. */
  gridBlocks: LayoutBlock[][];
  remainingSpans: TextSpan[];
}

const MAX_CELL_LINES = 6;
const MAX_LINE_CHARS = 60;
const MAX_DIGIT_SHARE = 0.2;
/** A word space is well under half an em; the gap between two cells' emails is about one. */
const RUN_SPLIT_GAP_EM = 0.8;
const CENTER_TOLERANCE_EM = 0.3;
const CENTER_TOLERANCE_MIN_PT = 2;
/** Lines of one stack: the gap between them at most this share of the taller line's height. */
const STACK_GAP_RATIO = 0.7;
const ROW_TOP_TOLERANCE_RATIO = 0.5;
const ROW_FONT_TOLERANCE = 0.1;
const CELL_GAP_EM = RUN_SPLIT_GAP_EM;
/** Space above and below a cell, as a share of its line height. */
const CELL_CLEARANCE_RATIO = 1;
/** Lines below a row with text on both sides of a gap between its cells, gap still open. */
const MAX_OPEN_GAP_LINES = 3;
/** A footnote mark set after a name: much smaller, at most three glyphs, touching the name. */
const MARK_MAX_FONT_RATIO = 0.8;
const MARK_MAX_CHARS = 3;
const MARK_MAX_GAP_EM = 0.35;

interface Run {
  spans: TextSpan[];
  box: BBox;
  fontSize: number;
  center: number;
}

interface Stack {
  runs: Run[];
  box: BBox;
}

export function extractTitleGrids(spans: TextSpan[]): TitleGridResult {
  const empty: TitleGridResult = { blocks: [], gridBlocks: [], remainingSpans: spans };
  const horizontal = spans.filter(isHorizontalTextSpan);
  if (horizontal.length < 4) return empty;
  const runs = buildRuns(horizontal);
  const stacks = buildStacks(runs).filter(isCellShaped);
  const rows = buildRows(stacks, horizontal);
  if (rows.length === 0) return empty;

  const used = new Set<TextSpan>();
  const blocks: LayoutBlock[] = [];
  const gridBlocks: LayoutBlock[][] = [];
  for (const group of groupRows(rows)) {
    if (continuesAsColumns(group, horizontal)) continue;
    const cells = group.flat().map(toBlock);
    for (const stack of group.flat()) for (const run of stack.runs) for (const span of run.spans) used.add(span);
    blocks.push(...cells);
    gridBlocks.push(cells);
  }
  return { blocks, gridBlocks, remainingSpans: spans.filter((span) => !used.has(span)) };
}

function isHorizontalTextSpan(span: TextSpan): boolean {
  if (!span.text.trim()) return false;
  const size = span.fontSize || span.height;
  return size > 0 && span.height <= size * 2 && span.width > 0;
}

function isMarkText(text: string): boolean {
  return text.replace(/\s/gu, '').length <= MARK_MAX_CHARS && !/\p{L}{2}/u.test(text);
}

function isMarkCandidate(span: TextSpan, parent: TextSpan): boolean {
  return isMarkText(span.text) && span.fontSize <= parent.fontSize * MARK_MAX_FONT_RATIO;
}

/**
 * Spans on one baseline, split wherever the gap is wider than a word
 * space. A small footnote mark touching the end of a run joins it, though
 * its baseline is raised.
 */
function buildRuns(spans: readonly TextSpan[]): Run[] {
  const sorted = [...spans].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const rows: TextSpan[][] = [];
  for (const span of sorted) {
    // Rows are opened top to bottom, so only the last few can share this
    // span's baseline.
    let row: TextSpan[] | undefined;
    for (let index = rows.length - 1; index >= 0; index--) {
      const head = rows[index][0];
      if (head.y + head.height < span.y - span.height) break;
      if (sharesBaseline(head, span)) {
        row = rows[index];
        break;
      }
    }
    if (row) row.push(span);
    else rows.push([span]);
  }
  const runs: TextSpan[][] = [];
  for (const row of rows) {
    const xSorted = row.sort((a, b) => a.x - b.x);
    let current: TextSpan[] = [];
    for (const span of xSorted) {
      const last = current[current.length - 1];
      const em = Math.max(span.fontSize, last?.fontSize ?? 0);
      if (last && span.x - (last.x + last.width) > em * RUN_SPLIT_GAP_EM) {
        runs.push(current);
        current = [];
      }
      current.push(span);
    }
    if (current.length > 0) runs.push(current);
  }
  // Marks ride on the run they touch rather than forming runs of their own.
  const markRuns = new Set<TextSpan[]>();
  for (const run of runs) {
    if (run.length !== 1) continue;
    const mark = run[0];
    if (!isMarkText(mark.text)) continue;
    const host = runs.find((other) => {
      if (other === run || markRuns.has(other)) return false;
      const end = other[other.length - 1];
      if (end.y > mark.y + mark.height || end.y + end.height < mark.y) return false;
      if (!isMarkCandidate(mark, end)) return false;
      const gap = mark.x - (end.x + end.width);
      const overlaps = mark.y < end.y + end.height && mark.y + mark.height > end.y;
      return overlaps && gap >= -end.fontSize * 0.2 && gap <= end.fontSize * MARK_MAX_GAP_EM;
    });
    if (host) {
      host.push(mark);
      markRuns.add(run);
    }
  }
  return runs.filter((run) => !markRuns.has(run)).map(toRun);
}

function sharesBaseline(a: TextSpan, b: TextSpan): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= Math.min(a.height, b.height) * 0.6 && Math.abs(a.fontSize - b.fontSize) <= a.fontSize * 0.25;
}

function toRun(spans: TextSpan[]): Run {
  const box = unionBox(spans);
  const sizes = spans.map((span) => span.fontSize);
  const largest = Math.max(...sizes);
  const body = spans.filter((span) => span.fontSize > largest * MARK_MAX_FONT_RATIO);
  // A mark widens the run but is not part of what the line is centred on
  // in every template; the axis is the body text's, widened by half the mark.
  return {
    spans,
    box,
    fontSize: mode(body.map((span) => span.fontSize)),
    center: box.x + box.width / 2,
  };
}

function centerTolerance(fontSize: number): number {
  return Math.max(CENTER_TOLERANCE_MIN_PT, fontSize * CENTER_TOLERANCE_EM);
}

function buildStacks(runs: readonly Run[]): Stack[] {
  const stacks: Stack[] = [];
  // Stacks whose last line ended well above the current run can take no more lines.
  let open: Stack[] = [];
  for (const run of [...runs].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    let best: Stack | undefined;
    let bestGap = Number.POSITIVE_INFINITY;
    open = open.filter((stack) => {
      const last = stack.runs[stack.runs.length - 1];
      return run.box.y - (last.box.y + last.box.height) <= last.box.height * 3;
    });
    for (const stack of open) {
      const last = stack.runs[stack.runs.length - 1];
      const gap = run.box.y - (last.box.y + last.box.height);
      if (gap < -Math.min(run.box.height, last.box.height) * 0.3) continue;
      if (gap > Math.max(run.box.height, last.box.height) * STACK_GAP_RATIO) continue;
      const tolerance = centerTolerance(Math.max(run.fontSize, last.fontSize));
      if (Math.abs(run.center - stackCenter(stack)) > tolerance) continue;
      if (gap < bestGap) {
        best = stack;
        bestGap = gap;
      }
    }
    if (best) {
      best.runs.push(run);
      best.box = unionBox([best.box, run.box]);
    } else {
      const stack = { runs: [run], box: run.box };
      stacks.push(stack);
      open.push(stack);
    }
  }
  return stacks;
}

function stackCenter(stack: Stack): number {
  return stack.runs.reduce((sum, run) => sum + run.center, 0) / stack.runs.length;
}

function isCellShaped(stack: Stack): boolean {
  if (stack.runs.length < 2 || stack.runs.length > MAX_CELL_LINES) return false;
  const texts = stack.runs.map((run) => joinLineSpans(run.spans));
  if (texts.some((text) => text.length > MAX_LINE_CHARS)) return false;
  // Names and affiliations are words; a table column centred over its
  // values is numbers.
  const letters = texts.join('').match(/\p{L}/gu)?.length ?? 0;
  const digits = texts.join('').match(/\p{N}/gu)?.length ?? 0;
  return letters > 0 && digits <= (letters + digits) * MAX_DIGIT_SHARE;
}

/** The lines' left edges differ: the stack is centred, not left-aligned or justified. */
function showsCentring(stack: Stack): boolean {
  const lefts = stack.runs.map((run) => run.box.x);
  const tolerance = centerTolerance(stack.runs[0].fontSize);
  return Math.max(...lefts) - Math.min(...lefts) > tolerance * 2;
}

const FLUSH_EDGE_PT = 1;
const RAGGED_EDGE_PT = 2;

function isFlushOnOneEdge(stack: Stack): boolean {
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  const lefts = spread(stack.runs.map((run) => run.box.x));
  const rights = spread(stack.runs.map((run) => run.box.x + run.box.width));
  return (lefts <= FLUSH_EDGE_PT && rights >= RAGGED_EDGE_PT) || (rights <= FLUSH_EDGE_PT && lefts >= RAGGED_EDGE_PT);
}

function buildRows(stacks: readonly Stack[], spans: readonly TextSpan[]): Stack[][] {
  const rows: Stack[][] = [];
  const taken = new Set<Stack>();
  const sorted = [...stacks].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  for (const seed of sorted) {
    if (taken.has(seed)) continue;
    const first = seed.runs[0];
    const row = sorted
      .filter((stack) => {
        if (taken.has(stack)) return false;
        const head = stack.runs[0];
        return (
          Math.abs(head.box.y - first.box.y) <= first.box.height * ROW_TOP_TOLERANCE_RATIO &&
          Math.abs(head.fontSize - first.fontSize) <= first.fontSize * ROW_FONT_TOLERANCE
        );
      })
      .sort((a, b) => a.box.x - b.box.x);
    if (row.length < 2) continue;
    if (!isSeparatedRow(row)) continue;
    // Lines of about one width (`Jakob Uszkoreit` / `Google Research` /
    // `usz@google.com`) show no centring of their own; most cells must.
    if (row.filter(showsCentring).length * 2 < row.length) continue;
    // A stack flush on one edge and ragged on the other is a table's label
    // column or a text column, whatever its centres say.
    if (row.some(isFlushOnOneEdge)) continue;
    if (!holdsPhrases(row)) continue;
    if (!isIsolated(row, spans)) continue;
    if (!row.every((stack) => standsApart(stack, spans))) continue;
    for (const stack of row) taken.add(stack);
    rows.push(row);
  }
  return rows;
}

function isSeparatedRow(row: readonly Stack[]): boolean {
  for (let index = 1; index < row.length; index++) {
    const gap = row[index].box.x - (row[index - 1].box.x + row[index - 1].box.width);
    const em = Math.min(...[row[index - 1], row[index]].flatMap((stack) => stack.runs.map((run) => run.fontSize)));
    if (gap < em * CELL_GAP_EM) return false;
  }
  return true;
}

/**
 * Most lines are phrases (a name, an affiliation) or addresses, not the
 * one-word values a table column centred under its header holds.
 */
function holdsPhrases(row: readonly Stack[]): boolean {
  const texts = row.flatMap((stack) => stack.runs.map((run) => joinLineSpans(run.spans).trim()));
  const phrases = texts.filter((text) => /\s/u.test(text) || text.includes('@')).length;
  return phrases * 2 >= texts.length;
}

/**
 * Nothing but the row's own cells is printed across the page on the row's
 * lines: a table's label column, or the prose of a text column beside the
 * stacks, says the stacks are part of something else.
 */
function isIsolated(row: readonly Stack[], spans: readonly TextSpan[]): boolean {
  const own = new Set(row.flatMap((stack) => stack.runs.flatMap((run) => run.spans)));
  const box = unionBox(row.map((stack) => stack.box));
  return !spans.some((span) => {
    if (own.has(span)) return false;
    const cy = span.y + span.height / 2;
    return cy > box.y && cy < box.y + box.height;
  });
}

/**
 * A cell is set off from the text above and below it by more than its own
 * line spacing. Two lines cut from a running text column (a paragraph's
 * last lines that happen to centre on one axis) have the column's next
 * line at ordinary leading.
 */
function standsApart(stack: Stack, spans: readonly TextSpan[]): boolean {
  const own = new Set(stack.runs.flatMap((run) => run.spans));
  const { box } = stack;
  const clearance = Math.max(...stack.runs.map((run) => run.box.height)) * CELL_CLEARANCE_RATIO;
  return !spans.some((span) => {
    if (own.has(span) || span.x >= box.x + box.width || span.x + span.width <= box.x) return false;
    const above = box.y - (span.y + span.height);
    const below = span.y - (box.y + box.height);
    return (above >= -1 && above < clearance) || (below >= -1 && below < clearance);
  });
}

/**
 * The gaps between the cells stay open below the row, with text on both
 * sides line after line: the stacks head columns (two side-by-side tables'
 * titles, the first lines of two text columns), they are not a grid of
 * their own. An author grid is followed by a title, an abstract or a
 * heading that crosses the gaps.
 */
function continuesAsColumns(grid: readonly Stack[][], spans: readonly TextSpan[]): boolean {
  const own = new Set(grid.flat().flatMap((stack) => stack.runs.flatMap((run) => run.spans)));
  const gridBox = unionBox(grid.flat().map((stack) => stack.box));
  const bottom = gridBox.y + gridBox.height;
  return grid.some((row) => rowGapsStayOpen(row, spans, own, bottom));
}

function rowGapsStayOpen(
  row: readonly Stack[],
  spans: readonly TextSpan[],
  own: ReadonlySet<TextSpan>,
  bottom: number,
): boolean {
  const box = unionBox(row.map((stack) => stack.box));
  const below = spans.filter((span) => !own.has(span) && span.y >= bottom - 1).sort((a, b) => a.y - b.y);
  for (let index = 1; index < row.length; index++) {
    const gapLeft = row[index - 1].box.x + row[index - 1].box.width;
    const gapRight = row[index].box.x;
    let twoSided = 0;
    let lineTop = Number.NEGATIVE_INFINITY;
    let left = false;
    let right = false;
    for (const span of below) {
      if (span.x < gapRight && span.x + span.width > gapLeft) break;
      if (span.y > lineTop + span.height * 0.5) {
        if (left && right) twoSided++;
        lineTop = span.y;
        left = false;
        right = false;
      }
      if (span.x + span.width <= gapLeft && span.x + span.width > box.x) left = true;
      if (span.x >= gapRight && span.x < box.x + box.width) right = true;
      if (twoSided >= MAX_OPEN_GAP_LINES) return true;
    }
    if (left && right) twoSided++;
    if (twoSided >= MAX_OPEN_GAP_LINES) return true;
  }
  return false;
}

/** Rows directly above one another, with nothing between them, are one grid. */
function groupRows(rows: Stack[][]): Stack[][][] {
  const sorted = [...rows].sort((a, b) => a[0].box.y - b[0].box.y);
  const groups: Stack[][][] = [];
  for (const row of sorted) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    if (group && previous) {
      const above = unionBox(previous.map((stack) => stack.box));
      const below = unionBox(row.map((stack) => stack.box));
      const gap = below.y - (above.y + above.height);
      const lineHeight = Math.max(...row.map((stack) => stack.runs[0].box.height));
      const overlapsX = below.x < above.x + above.width && below.x + below.width > above.x;
      if (overlapsX && gap <= lineHeight * 3) {
        group.push(row);
        continue;
      }
    }
    groups.push([row]);
  }
  return groups;
}

function toBlock(stack: Stack): LayoutBlock {
  const lines: LayoutLine[] = stack.runs.map((run) => ({
    text: joinLineSpans(run.spans),
    ...run.box,
    fontSize: round2(run.fontSize),
  }));
  return { text: lines.map((line) => line.text).join('\n'), ...unionBox(lines), lines };
}
