import type { LayoutLine } from '../../types/index.js';
import { isCaptionHeadingText } from './headingText.js';
import { isCompactTableLabelCell } from './tableCandidateRows.js';
import { isTableValueCell } from './tableCells.js';
import type { IndexedLayoutRow } from './tableContinuations.js';
import { isClearlyCloser } from './tableLabelWraps.js';
import { mergeLineTexts, rowBottom, rowY } from './tableRows.js';

const BRIDGE_MAX_ROWS = 3;
const WRAP_ALIGN_TOLERANCE_PT = 4;

export interface BridgedRowGroup {
  /** The group's rows in page order: candidates, bridge rows kept as rows of their own, wraps folded in. */
  rows: IndexedLayoutRow[];
  /** The candidate rows alone, as detected, for the checks that decide whether the group is a table. */
  candidates: LayoutLine[][];
}

/**
 * Group candidate rows into tables, carrying the rows between two
 * candidates along when they sit on the same grid. Candidate detection
 * needs a digit and several cells, so a group heading (`4 Test & launch`)
 * or a row whose dates are still empty is not a candidate; without the
 * bridge, the rows on either side of it are measured as one double gap,
 * which splits the table there, and the rest of the grid ends up in a
 * second table that the first one's header scan swallows — the tail of
 * the table silently disappears.
 *
 * A row between two candidates is either the wrapped tail or head of a
 * cell of one of them (set clearly closer to that row than to the other,
 * every cell under a cell of that row), which is folded into those cells,
 * or a sparse row of the grid, kept as a row of its own. Each step of the
 * chain stays within `maxGap`. Rows between two close candidates that are
 * neither are left out as before.
 */
export function groupRowsWithBridges(
  candidates: readonly IndexedLayoutRow[],
  allRows: readonly LayoutLine[][],
  maxGap: number,
  maxCellWidth: number,
): BridgedRowGroup[] {
  const groups: BridgedRowGroup[] = [];
  for (const candidate of candidates) {
    const group = groups.at(-1);
    const previous = group?.rows.at(-1);
    const bridge = group && previous ? bridgeRows(previous, candidate, allRows, maxGap, maxCellWidth) : undefined;
    if (group && bridge) {
      group.rows.splice(-1, 1, bridge.above, ...bridge.between, bridge.below);
      group.candidates.push(candidate.row);
    } else {
      groups.push({ rows: [candidate], candidates: [candidate.row] });
    }
  }
  return groups;
}

function bridgeRows(
  above: IndexedLayoutRow,
  below: IndexedLayoutRow,
  allRows: readonly LayoutLine[][],
  maxGap: number,
  maxCellWidth: number,
): { above: IndexedLayoutRow; between: IndexedLayoutRow[]; below: IndexedLayoutRow } | undefined {
  const directGap = rowY(below.row) - rowBottom(above.row);
  const unchanged = directGap <= maxGap ? { above, between: [], below } : undefined;
  const between: IndexedLayoutRow[] = [];
  for (let index = above.index + 1; index < below.index; index++) {
    const row = allRows[index];
    if (row) between.push({ row, index });
  }
  if (between.length === 0 || between.length > BRIDGE_MAX_ROWS) return unchanged;
  const chain = [above, ...between, below];
  const steps = chain.slice(1).map((item, position) => rowY(item.row) - rowBottom(chain[position].row));
  if (steps.some((gap) => gap > maxGap)) return unchanged;

  // What is not a wrapped cell line must be a sparse row of the grid.
  const folded = foldWrappedLines(above.row, between, below.row);
  if (!folded.rest.every(({ row }) => isOnGrid(row, above.row, below.row, maxCellWidth))) return unchanged;
  return { above: { ...above, row: folded.above }, between: folded.rest, below: { ...below, row: folded.below } };
}

/**
 * Fold the rows between two table rows that are wrapped lines of their
 * cells: into the row above, top down, then into the row below, bottom up.
 * A wrapped line starts where a text cell of its row starts. A run of them
 * is folded when the run as a whole sits clearly closer to that row than to
 * the row on its far side — the lines of one wrapped cell are set at their
 * own line pitch, so each one alone can be as close to the next line as to
 * its row. Returns the rows that are not wrapped lines in `rest`.
 */
export function foldWrappedLines<T extends { row: LayoutLine[] }>(
  above: LayoutLine[],
  between: readonly T[],
  below: LayoutLine[],
): { above: LayoutLine[]; rest: T[]; below: LayoutLine[] } {
  const rows = between.map(({ row }) => row);
  const chain = [above, ...rows, below];
  let top = above;
  let first = 0;
  while (first < between.length) {
    const run = wrappedRunLength(rows, first, 1, top, (end) => chain[end + 2]);
    if (run === 0) break;
    for (let k = 0; k < run; k++) top = foldInto(top, rows[first + k]);
    first += run;
  }
  let bottom = below;
  let last = between.length - 1;
  while (last >= first) {
    const run = wrappedRunLength(rows, last, -1, bottom, (end) => chain[end], first);
    if (run === 0) break;
    for (let k = 0; k < run; k++) bottom = foldInto(bottom, rows[last - k]);
    last -= run;
  }
  return { above: top, rest: between.slice(first, last + 1), below: bottom };
}

/**
 * Length of the shortest run of rows from `start` (walking `step`) that are
 * wrapped lines of `owner`'s cells and, taken together, sit clearly closer
 * to `owner` than to the row past the run; 0 when there is none.
 */
function wrappedRunLength(
  rows: readonly LayoutLine[][],
  start: number,
  step: 1 | -1,
  owner: readonly LayoutLine[],
  beyond: (end: number) => readonly LayoutLine[],
  stop = 0,
): number {
  const gap = (upper: readonly LayoutLine[], lower: readonly LayoutLine[]) => rowY([...lower]) - rowBottom([...upper]);
  let widest = step === 1 ? gap(owner, rows[start]) : gap(rows[start], owner);
  for (let k = 0; ; k++) {
    const end = start + step * k;
    if (end < stop || end >= rows.length) return 0;
    const row = rows[end];
    if (!isWrappedLineOf(row, owner)) return 0;
    if (k > 0) widest = Math.max(widest, step === 1 ? gap(rows[end - 1], row) : gap(row, rows[end + 1]));
    const far = step === 1 ? gap(row, beyond(end)) : gap(beyond(end), row);
    if (isClearlyCloser(widest, far)) return k + 1;
  }
}

/**
 * Whether each cell of `row` starts where a text cell of `owner` starts. A
 * caption (`Table 1 (continued)`) names a table and is never a cell line.
 */
function isWrappedLineOf(row: readonly LayoutLine[], owner: readonly LayoutLine[]): boolean {
  if (row.some((line) => isCaptionHeadingText(line.text))) return false;
  return row.every((line) => cellAbove(line, owner) !== undefined);
}

function cellAbove(line: LayoutLine, owner: readonly LayoutLine[]): LayoutLine | undefined {
  const matches = owner.filter((cell) => horizontalOverlap(line, cell) > 0);
  const [cell] = matches;
  if (matches.length !== 1 || !cell || isTableValueCell(cell.text) || isTableValueCell(line.text)) return undefined;
  return Math.abs(cell.x - line.x) <= WRAP_ALIGN_TOLERANCE_PT ? cell : undefined;
}

function foldInto(owner: LayoutLine[], row: readonly LayoutLine[]): LayoutLine[] {
  return owner.map((cell) => {
    const parts = row.filter((line) => cellAbove(line, owner) === cell);
    return parts.length > 0 ? mergeLineTexts([cell, ...parts]) : cell;
  });
}

function isOnGrid(
  row: readonly LayoutLine[],
  above: readonly LayoutLine[],
  below: readonly LayoutLine[],
  maxCellWidth: number,
): boolean {
  // A row as full as its neighbours that still is no candidate is a line of
  // text running across columns (side-by-side prose), not a sparse row of
  // the grid such as a group heading.
  if (row.length >= Math.min(above.length, below.length)) return false;
  if (row.some((line) => isCaptionHeadingText(line.text))) return false;
  const under = (line: LayoutLine, cells: readonly LayoutLine[]) =>
    cells.some((cell) => horizontalOverlap(line, cell) > 0);
  const cellsOnGrid = row.every(
    (line) =>
      line.width <= maxCellWidth &&
      (isTableValueCell(line.text) || isCompactTableLabelCell(line)) &&
      (under(line, above) || under(line, below)),
  );
  // Both neighbours must share a column with it: a row lined up with only
  // one side is that side's edge (a chart axis above a table), not a row
  // between two rows of one grid.
  return cellsOnGrid && row.some((line) => under(line, above)) && row.some((line) => under(line, below));
}

function horizontalOverlap(a: LayoutLine, b: LayoutLine): number {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}
