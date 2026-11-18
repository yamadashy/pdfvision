import type { LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { type BBox, unionBox } from './geometry.js';
import { isTableValueCell } from './tableCells.js';

const MIN_SIDE_COLUMNS = 2;
const MIN_SIDE_VALUE_COLUMNS = 2;
const MIN_SIDE_ROWS = 2;
const LABEL_COLUMN_MIN_ROW_RATIO = 0.6;
const WIDE_GAP_MIN_RATIO = 2;
const BAND_MAX_HEIGHT_PT = 40;
const BAND_SAME_Y_PT = 1.5;
const BAND_MIN_GAP_PT = 3;
const BAND_ABOVE_TABLE_PT = 30;

/**
 * Split a table that is two grids set side by side. Rows that line up
 * across a page make one detected table of both grids, so one grid's
 * columns are numbered after the other's and a reader cannot tell where
 * the second grid starts. A boundary between two columns, crossed by no
 * cell, is a second grid's start when
 *
 * - the drawing says so: rules or tinted row bands at the same height end
 *   before the gap and start again after it, and nothing drawn runs across
 *   it (two ruled grids with a gutter between them); or
 * - nothing drawn runs across the gap and the text says so: the column
 *   after the boundary is a label column, as the first column is, each
 *   side carries at least two value columns, and the gap is clearly the
 *   widest between neighbouring columns (a second label column with its
 *   own values).
 */
export function splitSideBySideTables(table: LayoutTable, boxes: readonly BBox[]): LayoutTable[] {
  const split = sideBySideBoundary(table, boxes);
  if (split === undefined) return [table];
  const left = sideTable(table, (column) => column < split, 0);
  const right = sideTable(table, (column) => column >= split, split);
  if (!left || !right) return [table];
  return [left, ...splitSideBySideTables(right, boxes)];
}

function sideBySideBoundary(table: LayoutTable, boxes: readonly BBox[]): number | undefined {
  const bodyRows = table.rows.filter((row) => row.cells.some((cell) => isTableValueCell(cell.text)));
  if (bodyRows.length < MIN_SIDE_ROWS) return undefined;
  const gaps = columnGaps(table);
  for (let boundary = MIN_SIDE_COLUMNS; boundary <= table.columnCount - MIN_SIDE_COLUMNS; boundary++) {
    const gap = gaps.get(boundary);
    if (!gap || isCrossed(table, boundary)) continue;
    if (!hasValueColumns(bodyRows, (column) => column < boundary)) continue;
    if (!hasValueColumns(bodyRows, (column) => column >= boundary)) continue;
    const drawn = drawnAcross(table, gap, boxes);
    if (drawn === 'apart') return boundary;
    if (drawn === 'joined') continue;
    if (!isLabelColumn(bodyRows, 0) || !isLabelColumn(bodyRows, boundary)) continue;
    const others = [...gaps.entries()].filter(([at]) => at !== boundary).map(([, other]) => other.right - other.left);
    if (others.every((width) => gap.right - gap.left >= width * WIDE_GAP_MIN_RATIO)) return boundary;
  }
  return undefined;
}

/** The empty band before each column: from the right edge of the cells left of it to its own cells' left edge. */
function columnGaps(table: LayoutTable): Map<number, { left: number; right: number }> {
  const cells = table.rows.flatMap((row) => row.cells);
  const gaps = new Map<number, { left: number; right: number }>();
  for (let boundary = 1; boundary < table.columnCount; boundary++) {
    const before = cells.filter((cell) => endColumn(cell) < boundary);
    const after = cells.filter((cell) => (cell.column ?? 0) >= boundary);
    if (before.length === 0 || after.length === 0) continue;
    const left = Math.max(...before.map((cell) => cell.x + cell.width));
    const right = Math.min(...after.map((cell) => cell.x));
    if (right > left) gaps.set(boundary, { left, right });
  }
  return gaps;
}

function isCrossed(table: LayoutTable, boundary: number): boolean {
  return table.rows.some((row) =>
    row.cells.some((cell) => (cell.column ?? 0) < boundary && endColumn(cell) >= boundary),
  );
}

/** Whether drawn rules or bands stop at the gap and start again after it, run across it, or say nothing. */
function drawnAcross(
  table: LayoutTable,
  gap: { left: number; right: number },
  boxes: readonly BBox[],
): 'apart' | 'joined' | undefined {
  const middle = (gap.left + gap.right) / 2;
  const top = table.y - BAND_ABOVE_TABLE_PT;
  const bottom = table.y + table.height;
  const bands = boxes.filter(
    (box) => box.height <= BAND_MAX_HEIGHT_PT && box.y + box.height >= top && box.y <= bottom && box.width > box.height,
  );
  if (bands.some((box) => box.x < middle && box.x + box.width > middle)) return 'joined';
  const apart = bands.some(
    (left) =>
      left.x + left.width <= middle &&
      left.x + left.width >= gap.left - BAND_MIN_GAP_PT &&
      bands.some(
        (right) =>
          right.x >= middle &&
          right.x <= gap.right + BAND_MIN_GAP_PT &&
          right.x - (left.x + left.width) >= BAND_MIN_GAP_PT &&
          Math.abs(right.y - left.y) <= BAND_SAME_Y_PT &&
          Math.abs(right.height - left.height) <= BAND_SAME_Y_PT,
      ),
  );
  return apart ? 'apart' : undefined;
}

function hasValueColumns(rows: readonly LayoutTableRow[], side: (column: number) => boolean): boolean {
  const columns = new Set(
    rows.flatMap((row) =>
      row.cells.filter((cell) => side(cell.column ?? 0) && isTableValueCell(cell.text)).map((cell) => cell.column),
    ),
  );
  return columns.size >= MIN_SIDE_VALUE_COLUMNS;
}

function isLabelColumn(rows: readonly LayoutTableRow[], column: number): boolean {
  const labelled = rows.filter((row) =>
    row.cells.some((cell) => cell.column === column && !isTableValueCell(cell.text) && /\p{L}/u.test(cell.text)),
  );
  return labelled.length >= Math.ceil(rows.length * LABEL_COLUMN_MIN_ROW_RATIO);
}

function sideTable(table: LayoutTable, side: (column: number) => boolean, offset: number): LayoutTable | undefined {
  const rows: LayoutTableRow[] = table.rows
    .map((row) => ({
      ...row,
      cells: row.cells
        .filter((cell) => side(cell.column ?? 0))
        .map((cell): LayoutTableCell => ({ ...cell, column: (cell.column ?? 0) - offset })),
    }))
    .filter((row) => row.cells.length > 0);
  if (rows.length < MIN_SIDE_ROWS) return undefined;
  const columnCount = Math.max(...rows.flatMap((row) => row.cells.map((cell) => endColumn(cell) + 1)));
  const box = unionBox(rows.flatMap((row) => row.cells));
  return { ...box, rowCount: rows.length, columnCount, rows };
}

function endColumn(cell: LayoutTableCell): number {
  return (cell.column ?? 0) + (cell.columnSpan ?? 1) - 1;
}
