import type { LayoutLine } from '../../../types/index.js';
import { type ColumnGutter, gapCrossesColumnGutter } from '../columnGutters.js';
import { type BBox, median } from '../geometry.js';
import type { TableRule } from '../tableRules.js';
import { hasRowStructure, isProseFragment } from './columns.js';
import {
  ALIGN_TOLERANCE_PT,
  CELL_OVERLAP_TOLERANCE_PT,
  center,
  emOf,
  type Interval,
  MIN_RUN_ROWS,
  type Row,
  type RowRun,
} from './shared.js';

/** Two lines share a row when their centres are this close, in shorter-line heights. */
const ROW_CENTER_TOLERANCE = 0.25;
const ROW_MAX_HEIGHT_RATIO = 1.6;
/** A cell at least this many em wide holds running text. */
const PROSE_CELL_MIN_EM = 15;
/** Text this wide on both sides of a detected prose gutter is two columns of prose. */
const GUTTER_SIDE_MIN_EM = 10;
/** Rows of one run are no further apart than this, in line heights. */
const MAX_ROW_GAP_LINES = 5;
/** Lines between two rows of a run that are not rows themselves: a part heading, a wrapped cell. */
const MAX_LOOSE_LINES = 2;
const MIN_RULE_LENGTH_LINES = 1.5;
const ALIGN_TOLERANCE_EM = 0.3;
const ALIGNED_SHARE = 0.8;
const ALIGN_WINDOW_ROWS = 12;
const SIDE_HEAD_FONT_RATIO = 1.2;

export interface Separators {
  /** Prose column gutters found while building lines. */
  gutters: readonly ColumnGutter[];
  /** Painted vertical rules: a ruled grid is read from its rules. */
  verticalRules: readonly TableRule[];
  /** Which painted boxes hold a line ('' for none): a row stays inside one box. */
  boxOf: (line: LayoutLine) => string;
}

/** Lines grouped into rows by shared baseline, top to bottom. */
export function groupRows(lines: readonly LayoutLine[]): Row[] {
  const rows: Row[] = [];
  let anchor: LayoutLine | undefined;
  for (const line of [...lines].sort((a, b) => center(a) - center(b) || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && anchor && sharesRow(anchor, line)) {
      row.cells.push(line);
      row.top = Math.min(row.top, line.y);
      row.bottom = Math.max(row.bottom, line.y + line.height);
      row.height = Math.min(row.height, line.height);
      continue;
    }
    anchor = line;
    rows.push({ cells: [line], top: line.y, bottom: line.y + line.height, height: line.height });
  }
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);
  return rows;
}

function sharesRow(a: LayoutLine, b: LayoutLine): boolean {
  const low = Math.max(Math.min(a.height, b.height), 1);
  const high = Math.max(a.height, b.height, 1);
  if (high / low > ROW_MAX_HEIGHT_RATIO) return false;
  return Math.abs(center(a) - center(b)) <= low * ROW_CENTER_TOLERANCE;
}

/**
 * Runs of at least {@link MIN_RUN_ROWS} rows that follow one another down
 * the page on one column grid: some gap is clear in every row, with cells
 * lined up on at least one side of it.
 */
export function findRowRuns(rows: readonly Row[], separators: Separators): RowRun[] {
  const runs: RowRun[] = [];
  let current: RowRun | undefined;
  let loose = 0;
  const close = () => {
    if (current && current.rows.length >= MIN_RUN_ROWS) runs.push(current);
    current = undefined;
    loose = 0;
  };
  for (const whole of rows) {
    // Running text further off the run's side than its widest column gap is another column's.
    const row = current ? withinRun(current, whole) : whole;
    if (isPairableRow(row, separators)) {
      if (current && continuesRun(current, row, loose)) {
        current.gaps = intersectGaps(current.gaps, rowGaps(row));
        current.rows.push(row);
        current.left = Math.min(current.left, row.cells[0].x);
        current.right = Math.max(current.right, ...row.cells.map((cell) => cell.x + cell.width));
        loose = 0;
        continue;
      }
    }
    if (isPairableRow(whole, separators)) {
      close();
      current = {
        rows: [whole],
        left: whole.cells[0].x,
        right: Math.max(...whole.cells.map((cell) => cell.x + cell.width)),
        gaps: rowGaps(whole),
      };
      continue;
    }
    if (!current) continue;
    const run: RowRun = current;
    if (!row.cells.some((cell) => cell.x < run.right && cell.x + cell.width > run.left)) continue;
    // Text columns side by side end the run; a lone line inside it is a heading or a wrapped cell.
    if (row.cells.length >= 2) close();
    else loose++;
  }
  close();
  return runs.filter(hasRowStructure);
}

function withinRun(run: RowRun, row: Row): Row {
  const reach = Math.max(0, ...run.rows.flatMap((member) => rowGaps(member).map((gap) => gap.right - gap.left)));
  // Only running text is cut off: a row label left of the run's first rows belongs to it.
  const cells = row.cells.filter(
    (cell) => !isProseCell(cell) || (cell.x <= run.right + reach && cell.x + cell.width >= run.left - reach),
  );
  if (cells.length === row.cells.length || cells.length === 0) return row;
  return {
    cells,
    top: Math.min(...cells.map((cell) => cell.y)),
    bottom: Math.max(...cells.map((cell) => cell.y + cell.height)),
    height: Math.min(...cells.map((cell) => cell.height)),
  };
}

function continuesRun(run: RowRun, row: Row, loose: number): boolean {
  const last = run.rows.at(-1);
  if (!last || loose > MAX_LOOSE_LINES) return false;
  if (row.top - last.bottom > Math.max(row.height, 1) * MAX_ROW_GAP_LINES) return false;
  // The column is judged on the rows nearest the new one, which bounds the work on a long run.
  const rows = [...run.rows.slice(-ALIGN_WINDOW_ROWS), row];
  return intersectGaps(run.gaps, rowGaps(row)).some((gap) => isAlignedGap(rows, gap));
}

/**
 * Cells side by side, none overlapping, at most one of them running text,
 * with no prose gutter between them and no painted rule: a ruled grid is
 * read cell by cell from its rules, and a line never runs across a rule.
 */
function isPairableRow(row: Row, { gutters, verticalRules, boxOf }: Separators): boolean {
  if (row.cells.length < 2) return false;
  if (new Set(row.cells.map(boxOf).filter((box) => box !== '')).size > 1) return false;
  for (let i = 1; i < row.cells.length; i++) {
    const prev = row.cells[i - 1];
    const cur = row.cells[i];
    if (cur.x < prev.x + prev.width - CELL_OVERLAP_TOLERANCE_PT) return false;
    // A prose gutter divides two runs of text; a short cell beside it is no column of prose.
    if (isWideCell(prev) && isWideCell(cur) && gapCrossesColumnGutter(gutters, prev, cur)) return false;
    if (hasRuleBetween(verticalRules, prev, cur)) return false;
  }
  // A sentence broken off at the end of the first cell goes on in the next
  // line of its column, not in the next cell: prose beside a table.
  if (isProseFragment(row.cells[0].text)) return false;
  // A side head set larger than the text beside it (`Part 2` / `Filers Who`
  // down a worksheet's margin) heads that text; it is not a row's label.
  const rest = row.cells.slice(1).map(emOf);
  if (emOf(row.cells[0]) >= Math.max(...rest) * SIDE_HEAD_FONT_RATIO) return false;
  return row.cells.filter(isProseCell).length <= 1;
}

function isWideCell(line: LayoutLine): boolean {
  return line.width >= emOf(line) * GUTTER_SIDE_MIN_EM;
}

function isProseCell(line: LayoutLine): boolean {
  return line.width >= emOf(line) * PROSE_CELL_MIN_EM && /\p{L}/u.test(line.text);
}

function hasRuleBetween(rules: readonly TableRule[], left: BBox, right: BBox): boolean {
  const from = left.x + left.width;
  const to = right.x;
  const middle = (Math.max(left.y, right.y) + Math.min(left.y + left.height, right.y + right.height)) / 2;
  // A checkbox's side is no column rule: a rule runs past the text it divides.
  const length = Math.max(left.height, right.height) * MIN_RULE_LENGTH_LINES;
  return rules.some(
    (rule) =>
      rule.at >= from && rule.at <= to && rule.start <= middle && rule.end >= middle && rule.end - rule.start >= length,
  );
}

function rowGaps(row: Row): Interval[] {
  const gaps: Interval[] = [];
  for (let i = 1; i < row.cells.length; i++) {
    const left = row.cells[i - 1].x + row.cells[i - 1].width;
    const right = row.cells[i].x;
    if (right > left) gaps.push({ left, right });
  }
  return gaps;
}

function intersectGaps(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const left = Math.max(x.left, y.left);
      const right = Math.min(x.right, y.right);
      if (right > left) out.push({ left, right });
    }
  }
  return out;
}

/**
 * A column boundary of a table or a list has a column on at least one side
 * of it: the cells beside it share a left edge, a right edge or a centre
 * (labels flush left, page numbers and prices flush right), and so does the
 * row being added. Text that only happens to share baselines across a page
 * lines up on neither side.
 */
function isAlignedGap(rows: readonly Row[], gap: Interval): boolean {
  const before: LayoutLine[] = [];
  const after: LayoutLine[] = [];
  for (const row of rows) {
    const left = row.cells.filter((cell) => cell.x + cell.width <= gap.left + CELL_OVERLAP_TOLERANCE_PT).at(-1);
    const right = row.cells.find((cell) => cell.x >= gap.right - CELL_OVERLAP_TOLERANCE_PT);
    if (!left || !right) return false;
    before.push(left);
    after.push(right);
  }
  return isAlignedColumn(before) || isAlignedColumn(after);
}

function isAlignedColumn(cells: readonly LayoutLine[]): boolean {
  const tolerance = Math.max(ALIGN_TOLERANCE_PT, median(cells.map(emOf)) * ALIGN_TOLERANCE_EM);
  const last = cells.at(-1);
  const edges: ((cell: LayoutLine) => number)[] = [
    (cell) => cell.x,
    (cell) => cell.x + cell.width,
    (cell) => cell.x + cell.width / 2,
  ];
  return edges.some((edge) => {
    const at = median(cells.map(edge));
    if (last && Math.abs(edge(last) - at) > tolerance) return false;
    return cells.filter((cell) => Math.abs(edge(cell) - at) <= tolerance).length >= cells.length * ALIGNED_SHARE;
  });
}
