import type { LayoutTable, TextSpan } from '../../types/index.js';
import type { BBox } from './geometry.js';
import { hasVerticalTextShape } from './verticalText.js';

/**
 * A vertical strip of whitespace that separates two text columns over a
 * y-range: the right column's lines share a left edge (`right`), and no
 * text from the left column reaches past `left` anywhere in between.
 */
export interface ColumnGutter {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const FONT_SIZE_FALLBACK_PT = 12;
const EDGE_TOLERANCE_PT = 1;
/** Narrowest strip that counts. Dense three-column registers run ~12pt
 *  gutters at 8.5pt type; a justified word space rarely reaches 0.75em on
 *  several consecutive lines *and* lines up with the next word's start. */
const MIN_GAP_EM = 0.75;
const MIN_GAP_PT = 5;
const ROW_ALIGNMENT_RATIO = 0.5;
/** Columns set on independent baselines overlap by only part of a line,
 *  so neighbours are looked up by partial vertical overlap. */
const ROW_OVERLAP_RATIO = 0.3;
const MIN_ROWS = 5;
/** Rows whose text on both sides of the strip is at least this many em
 *  wide must make up most of the run. Hanging list markers, form labels
 *  and table columns leave a clear strip too, but on most of their rows
 *  one side is a short marker, label or cell, so they never qualify. */
const MIN_PROSE_ROWS = 3;
const MIN_PROSE_SHARE = 0.5;
const PROSE_SIDE_MIN_EM = 10;
const LETTER_RE = /\p{L}/u;

interface GutterEdge {
  /** First span of the right column's line. */
  span: TextSpan;
  /** Nearest text to its left on an overlapping row. */
  neighbor: TextSpan;
  gap: number;
  fontSize: number;
  prose: boolean;
}

function fontSizeOf(span: TextSpan): number {
  return span.fontSize || FONT_SIZE_FALLBACK_PT;
}

function rowHeight(span: TextSpan): number {
  const fontSize = fontSizeOf(span);
  return Math.max(1, Math.min(span.height || fontSize, fontSize * 1.4));
}

function rightOf(span: BBox): number {
  return span.x + span.width;
}

function minGapFor(fontSize: number): number {
  return Math.max(fontSize * MIN_GAP_EM, MIN_GAP_PT);
}

function verticalOverlap(a: TextSpan, b: TextSpan): number {
  return Math.min(a.y + rowHeight(a), b.y + rowHeight(b)) - Math.max(a.y, b.y);
}

function lowerBound(values: readonly number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Find column gutters from page-level evidence rather than one row's gap.
 * Narrow gutters (~12pt) are no wider than the widest justified word
 * spaces, so no per-row threshold separates them; what does is that the
 * same strip stays empty line after line while the next column's lines
 * keep starting at the same x. Columns need not share baselines — dense
 * registers and sidebars set each column on its own baseline grid.
 *
 * A candidate strip is the space left of a recurring left edge. It holds
 * while consecutive rows keep it clear; any line that crosses it (a
 * spanning heading, a single-column paragraph) ends the run, which is
 * what keeps ordinary justified prose — where every other line runs
 * straight through any given x — from ever producing one.
 */
export function detectColumnGutters(spans: readonly TextSpan[]): ColumnGutter[] {
  const items = spans
    .filter((span) => span.width > 0 && span.text.trim() !== '' && !hasVerticalTextShape(span))
    .sort((a, b) => a.y - b.y);
  if (items.length < MIN_ROWS * 2) return [];

  const ys = items.map((span) => span.y);
  let maxRowHeight = 0;
  for (const span of items) maxRowHeight = Math.max(maxRowHeight, rowHeight(span));
  const overlapping = (span: TextSpan): TextSpan[] => {
    const out: TextSpan[] = [];
    const end = span.y + rowHeight(span);
    for (let i = lowerBound(ys, span.y - maxRowHeight); i < items.length && items[i].y < end; i++) {
      const other = items[i];
      if (other === span) continue;
      const minHeight = Math.min(rowHeight(span), rowHeight(other));
      if (verticalOverlap(span, other) >= minHeight * ROW_OVERLAP_RATIO) out.push(other);
    }
    return out;
  };

  const edges: GutterEdge[] = [];
  for (const span of items) {
    let neighbor: TextSpan | undefined;
    let covered = false;
    const rowMates = overlapping(span);
    for (const other of rowMates) {
      const otherRight = rightOf(other);
      if (other.x < span.x - EDGE_TOLERANCE_PT && otherRight > span.x + EDGE_TOLERANCE_PT) {
        covered = true;
        break;
      }
      if (otherRight <= span.x + EDGE_TOLERANCE_PT && other.x < span.x) {
        if (!neighbor || otherRight > rightOf(neighbor)) neighbor = other;
      }
    }
    if (covered || !neighbor) continue;
    const fontSize = Math.min(fontSizeOf(span), fontSizeOf(neighbor));
    const gap = span.x - rightOf(neighbor);
    if (gap < minGapFor(fontSize)) continue;
    const sideMin = fontSize * PROSE_SIDE_MIN_EM;
    // Prose has words on both sides; rows of figures (a tax table) leave
    // clear strips between their columns too, but those are table cells.
    const prose =
      LETTER_RE.test(neighbor.text) &&
      LETTER_RE.test(span.text) &&
      rowExtent(neighbor, overlapping(neighbor), gap, -1) >= sideMin &&
      rowExtent(span, rowMates, gap, 1) >= sideMin;
    edges.push({ span, neighbor, gap, fontSize, prose });
  }
  if (edges.length < MIN_ROWS) return [];

  edges.sort((a, b) => a.span.x - b.span.x);
  const gutters: ColumnGutter[] = [];
  for (let start = 0; start < edges.length; ) {
    let end = start + 1;
    while (end < edges.length && edges[end].span.x - edges[start].span.x <= EDGE_TOLERANCE_PT) end++;
    const cluster = edges.slice(start, end);
    start = end;
    if (cluster.length < MIN_ROWS) continue;
    gutters.push(...gutterRuns(cluster, items));
  }
  return gutters;
}

/** Width of the text run that continues from `span` in `direction` along
 *  its own row, stopping at the first gap as wide as the gutter gap. */
function rowExtent(span: TextSpan, candidates: readonly TextSpan[], gutterGap: number, direction: -1 | 1): number {
  const height = rowHeight(span);
  const row = candidates
    .filter((other) => Math.abs(other.y - span.y) < height * ROW_ALIGNMENT_RATIO)
    .filter((other) =>
      direction < 0 ? rightOf(other) <= span.x + EDGE_TOLERANCE_PT : other.x >= rightOf(span) - EDGE_TOLERANCE_PT,
    )
    .sort((a, b) => (direction < 0 ? rightOf(b) - rightOf(a) : a.x - b.x));
  // `edge` is the run's outer edge so far: its left x going left, its
  // right x going right.
  let edge = direction < 0 ? span.x : rightOf(span);
  for (const other of row) {
    const gap = direction < 0 ? edge - rightOf(other) : other.x - edge;
    if (gap >= gutterGap) break;
    edge = direction < 0 ? Math.min(edge, other.x) : Math.max(edge, rightOf(other));
  }
  return direction < 0 ? rightOf(span) - edge : edge - span.x;
}

function edgeMid(edge: GutterEdge): number {
  return edge.span.y + rowHeight(edge.span) / 2;
}

/** Split y-sorted edges wherever a mid in `breaks` falls between two of them. */
function splitRuns(edges: readonly GutterEdge[], breaks: readonly number[]): GutterEdge[][] {
  const runs: GutterEdge[][] = [];
  let run: GutterEdge[] = [];
  let lastMid = Number.NEGATIVE_INFINITY;
  for (const edge of edges) {
    const mid = edgeMid(edge);
    const i = lowerBound(breaks, lastMid);
    if (run.length > 0 && i < breaks.length && breaks[i] < mid) {
      runs.push(run);
      run = [];
    }
    run.push(edge);
    lastMid = mid;
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function gutterRuns(cluster: GutterEdge[], items: readonly TextSpan[]): ColumnGutter[] {
  const edgeX = Math.min(...cluster.map((edge) => edge.span.x));
  const minGap = minGapFor(Math.min(...cluster.map((edge) => edge.fontSize)));
  // Lines that run through the strip next to this edge end a run.
  const crossingMids = items
    .filter((span) => span.x < edgeX - EDGE_TOLERANCE_PT && rightOf(span) > edgeX - minGap + EDGE_TOLERANCE_PT)
    .map((span) => span.y + rowHeight(span) / 2)
    .sort((a, b) => a - b);
  const sorted = [...cluster].sort((a, b) => a.span.y - b.span.y);
  return splitRuns(sorted, crossingMids).flatMap((run) => acceptRun(run, items, edgeX));
}

function acceptRun(run: readonly GutterEdge[], items: readonly TextSpan[], edgeX: number): ColumnGutter[] {
  if (run.length < MIN_ROWS) return [];
  const prose = run.filter((edge) => edge.prose);
  if (prose.length < MIN_PROSE_ROWS || prose.length < run.length * MIN_PROSE_SHARE) return [];
  // The strip is bounded by the prose lines on its left. Anything else
  // inside it — a hanging bullet or list number of the right column, a
  // short label — means the strip is not clear there: the real gutter is
  // further left, and this edge is only an indent within the column.
  const left = Math.max(...prose.map((edge) => rightOf(edge.neighbor)));
  const firstMid = edgeMid(run[0]);
  const lastMid = edgeMid(run[run.length - 1]);
  const intruderMids = items
    .filter((span) => span.x < edgeX - EDGE_TOLERANCE_PT && rightOf(span) > left + EDGE_TOLERANCE_PT)
    .map((span) => span.y + rowHeight(span) / 2)
    .filter((mid) => mid >= firstMid - EDGE_TOLERANCE_PT && mid <= lastMid + EDGE_TOLERANCE_PT)
    .sort((a, b) => a - b);
  if (intruderMids.length > 0) {
    const clear = run.filter((edge) => rightOf(edge.neighbor) <= left + EDGE_TOLERANCE_PT);
    const parts = splitRuns(clear, intruderMids);
    if (parts.length === 1 && parts[0].length === run.length) return [];
    return parts.flatMap((part) => acceptRun(part, items, edgeX));
  }

  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  // The height comes from the right column's lines only: the left
  // column may sit on another baseline grid, and its offset must not carry
  // the gutter onto a neighbouring row that has a marker in the strip.
  for (const { span } of run) {
    top = Math.min(top, span.y);
    bottom = Math.max(bottom, span.y + rowHeight(span));
  }
  return [{ left, right: edgeX, top, bottom }];
}

/**
 * Whether the horizontal gap between `left` and `right` contains a
 * detected gutter strip at their height — the two belong to different
 * columns however narrow the gap is.
 */
export function gapCrossesColumnGutter(gutters: readonly ColumnGutter[], left: BBox, right: BBox): boolean {
  if (gutters.length === 0) return false;
  const leftEdge = rightOf(left);
  for (const gutter of gutters) {
    if (leftEdge > gutter.left + EDGE_TOLERANCE_PT || right.x < gutter.right - EDGE_TOLERANCE_PT) continue;
    if (left.y + left.height < gutter.top || left.y > gutter.bottom) continue;
    if (right.y + right.height < gutter.top || right.y > gutter.bottom) continue;
    return true;
  }
  return false;
}

/**
 * Which side of `gutter` a span sits on: `L` or `R` when it overlaps the
 * gutter's height, `X` when it straddles the strip, `-` when it is above
 * or below it.
 */
export function columnGutterSide(gutter: ColumnGutter, span: BBox): 'L' | 'R' | 'X' | '-' {
  if (span.y + span.height < gutter.top || span.y > gutter.bottom) return '-';
  if (span.x >= gutter.right - EDGE_TOLERANCE_PT) return 'R';
  if (rightOf(span) <= gutter.left + EDGE_TOLERANCE_PT) return 'L';
  return 'X';
}

/**
 * Whether `table` is the page's text columns read across row by row:
 *
 * - every boundary between neighbouring columns is one of the prose
 *   gutters (a real table has at least one column boundary of its own); or
 * - most of its rows hold a prose line, and on several rows prose lines
 *   sit on both sides of a prose gutter crossing it. One more boundary of
 *   its own (a wide justified word gap, a figure's labels beside the
 *   prose) does not make such a table real.
 */
export function isProseColumnTable(table: LayoutTable, gutters: readonly ColumnGutter[]): boolean {
  if (gutters.length === 0 || table.columnCount < 2) return false;
  const top = table.y;
  const bottom = table.y + table.height;
  const local = gutters.filter((gutter) => gutter.top < bottom && gutter.bottom > top);
  if (local.length === 0) return false;
  if (straddlesProseGutter(table, local)) return true;
  for (let column = 0; column < table.columnCount - 1; column++) {
    let leftEdge = Number.NEGATIVE_INFINITY;
    let rightStart = Number.POSITIVE_INFINITY;
    for (const row of table.rows) {
      for (const cell of row.cells) {
        const first = cell.column ?? 0;
        const last = first + (cell.columnSpan ?? 1) - 1;
        if (last === column) leftEdge = Math.max(leftEdge, cell.x + cell.width);
        if (first === column + 1) rightStart = Math.min(rightStart, cell.x);
      }
    }
    if (!Number.isFinite(leftEdge) || !Number.isFinite(rightStart)) return false;
    // A line that did not bound the strip (no right-column line beside it)
    // may overhang its left edge a little; it still ends short of the middle.
    const onGutter = local.some(
      (gutter) => leftEdge <= (gutter.left + gutter.right) / 2 && rightStart >= gutter.right - EDGE_TOLERANCE_PT,
    );
    if (!onGutter) return false;
  }
  return true;
}

const PROSE_CELL_MIN_WORDS = 5;
const PROSE_CELL_MIN_EM = 12;
const PROSE_TABLE_MIN_ROW_SHARE = 0.5;
const PROSE_TABLE_MIN_STRADDLING_ROWS = 3;

function straddlesProseGutter(table: LayoutTable, gutters: readonly ColumnGutter[]): boolean {
  // A table of fewer rows than that is running text when every row holds
  // prose and half of them straddle (two lines of each text column, read
  // across): a real table's rows are not lines of the page's prose.
  const short = table.rows.length < PROSE_TABLE_MIN_STRADDLING_ROWS;
  const minStraddling = short ? Math.ceil(table.rows.length / 2) : PROSE_TABLE_MIN_STRADDLING_ROWS;
  const proseRows = table.rows.filter((row) => row.cells.some(isProseCell));
  const minProseRows = short
    ? table.rows.length
    : Math.max(minStraddling, table.rows.length * PROSE_TABLE_MIN_ROW_SHARE);
  if (proseRows.length < minProseRows) return false;
  return gutters.some((gutter) => {
    if (gutter.left <= table.x || gutter.right >= table.x + table.width) return false;
    const straddling = proseRows.filter((row) => {
      const center = row.y + row.height / 2;
      if (center < gutter.top || center > gutter.bottom) return false;
      const prose = row.cells.filter(isProseCell);
      return (
        prose.some((cell) => rightOf(cell) <= gutter.left + EDGE_TOLERANCE_PT) &&
        prose.some((cell) => cell.x >= gutter.right - EDGE_TOLERANCE_PT)
      );
    });
    return straddling.length >= minStraddling;
  });
}

/** A cell holding a line of running text: several words, many em wide. */
function isProseCell(cell: BBox & { text: string }): boolean {
  const words = cell.text
    .trim()
    .split(/\s+/u)
    .filter((word) => LETTER_RE.test(word));
  return words.length >= PROSE_CELL_MIN_WORDS && cell.width >= Math.max(cell.height, 1) * PROSE_CELL_MIN_EM;
}
