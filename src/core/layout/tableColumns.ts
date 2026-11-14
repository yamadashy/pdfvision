import type { LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { isTableValueCell } from './tableCells.js';

// Two cells share a column when their horizontal extents overlap by at
// least this much. The ratio keeps a 1pt brush between neighbouring
// columns (padded glyph boxes) from chaining them together.
const COLUMN_MIN_OVERLAP_PT = 1;
const COLUMN_MIN_OVERLAP_RATIO = 0.2;
// A header or merged cell covers a column when this share of its own width
// lies over it. `BLEU` centered over two narrow columns reaches ~15% into each.
const COLUMN_PLACEMENT_MIN_OVERLAP_RATIO = 0.1;
const STRAY_COLUMN_MIN_BODY_ROWS = 3;
const STRAY_COLUMN_MAX_GAP_PT = 12;
const STRAY_COLUMN_MAX_GAP_RATIO = 0.5;

interface Extent {
  left: number;
  right: number;
}

interface CellRef {
  row: number;
  cell: number;
}

/**
 * Assign every cell a geometric column. Columns come from the body rows:
 * cells whose horizontal extents overlap across rows share a column, which
 * holds for right-aligned numbers, left-aligned labels, and centered values
 * alike. A body cell that overlaps two cells of another row (a merged value)
 * is left out of that clustering, and it, header rows, and single-cell rows
 * are then placed on the columns they overlap.
 */
export function assignTableColumns(table: LayoutTable): LayoutTable {
  const rows = table.rows;
  const bodyRows = bodyRowIndexes(rows);
  const bodyCells: CellRef[] = bodyRows.flatMap((row) => rows[row].cells.map((_, cell) => ({ row, cell })));
  const spanning = new Set(bodyCells.filter((ref) => isSpanningBodyCell(ref, rows, bodyRows)).map(key));
  const clusterCells = bodyCells.filter((ref) => !spanning.has(key(ref)));
  const columns = absorbStrayColumns(clusterColumns(clusterCells, rows), bodyRows.length);
  if (columns.length === 0) return table;

  const placements = new Map<string, { column: number; span: number }>();
  for (const ref of clusterCells) {
    placements.set(key(ref), { column: columns.findIndex((column) => column.members.has(key(ref))), span: 1 });
  }
  for (const [rowIndex, row] of rows.entries()) {
    const pending = row.cells
      .map((_, cell) => ({ row: rowIndex, cell }))
      .filter((ref) => !placements.has(key(ref)))
      .map((ref) => ({ ref, overlapped: overlappedColumns(cellExtent(rows, ref), columns) }))
      .sort((a, b) => a.overlapped.length - b.overlapped.length);
    for (const { ref, overlapped } of pending) {
      const occupied = new Set(
        row.cells.flatMap((_, cell) => {
          const placement = placements.get(key({ row: rowIndex, cell }));
          return placement ? coveredColumns(placement) : [];
        }),
      );
      placements.set(key(ref), placeOnColumns(overlapped, occupied, cellExtent(rows, ref), columns));
    }
  }

  const placedRows: LayoutTableRow[] = rows.map((row, rowIndex) => ({
    ...row,
    cells: row.cells
      .map((cell, cellIndex): LayoutTableCell => {
        const placement = placements.get(key({ row: rowIndex, cell: cellIndex }));
        if (!placement) return cell;
        return {
          ...cell,
          column: placement.column,
          ...(placement.span > 1 && { columnSpan: placement.span }),
        };
      })
      .sort((a, b) => a.x - b.x),
  }));
  return { ...table, columnCount: columns.length, rows: placedRows };
}

/**
 * Rows that define the columns: from the first row that holds a value cell
 * next to another cell, every row with at least two cells. Rows above it
 * are headers, which are often centered over a group of columns. Single-cell
 * rows (group labels) carry no column evidence.
 */
function bodyRowIndexes(rows: readonly LayoutTableRow[]): number[] {
  const multiCell = rows.map((row, index) => (row.cells.length >= 2 ? index : -1)).filter((index) => index >= 0);
  const firstValueRow = multiCell.find((index) => rows[index].cells.some((cell) => isTableValueCell(cell.text)));
  if (firstValueRow === undefined) return multiCell;
  return multiCell.filter((index) => index >= firstValueRow);
}

function isSpanningBodyCell(ref: CellRef, rows: readonly LayoutTableRow[], bodyRows: readonly number[]): boolean {
  const extent = cellExtent(rows, ref);
  return bodyRows.some((rowIndex) => {
    if (rowIndex === ref.row) return false;
    return rows[rowIndex].cells.filter((cell) => sharesColumn(extent, toExtent(cell))).length >= 2;
  });
}

interface Column extends Extent {
  members: Set<string>;
}

function clusterColumns(cells: readonly CellRef[], rows: readonly LayoutTableRow[]): Column[] {
  const parent = cells.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      if (cells[a].row === cells[b].row) continue;
      if (sharesColumn(cellExtent(rows, cells[a]), cellExtent(rows, cells[b]))) parent[find(b)] = find(a);
    }
  }

  const groups = new Map<number, Column>();
  for (const [index, ref] of cells.entries()) {
    const root = find(index);
    const extent = cellExtent(rows, ref);
    const group = groups.get(root);
    if (group) {
      group.left = Math.min(group.left, extent.left);
      group.right = Math.max(group.right, extent.right);
      group.members.add(key(ref));
    } else {
      groups.set(root, { ...extent, members: new Set([key(ref)]) });
    }
  }
  return [...groups.values()].sort((a, b) => a.left + a.right - (b.left + b.right));
}

/**
 * A column held by a single cell is usually that cell missing its real
 * column: a header digit centered over right-aligned values too narrow to
 * overlap it. Fold it into the nearest column when that column is clearly
 * nearer than any other and free in the cell's row; otherwise it stays a
 * column of its own.
 */
function absorbStrayColumns(columns: Column[], bodyRowCount: number): Column[] {
  if (bodyRowCount < STRAY_COLUMN_MIN_BODY_ROWS) return columns;
  const established = columns.filter((column) => column.members.size > 1);
  const kept = new Set(established);
  for (const column of columns) {
    if (column.members.size > 1) continue;
    const member = [...column.members][0];
    const rowIndex = Number(member.split(':')[0]);
    const gaps = established
      .map((candidate) => ({
        candidate,
        gap: Math.max(candidate.left - column.right, column.left - candidate.right, 0),
      }))
      .sort((a, b) => a.gap - b.gap);
    const [nearest, second] = gaps;
    const absorbable =
      nearest !== undefined &&
      nearest.gap <= STRAY_COLUMN_MAX_GAP_PT &&
      (second === undefined || nearest.gap <= second.gap * STRAY_COLUMN_MAX_GAP_RATIO) &&
      ![...nearest.candidate.members].some((other) => other.startsWith(`${rowIndex}:`));
    if (absorbable) nearest.candidate.members.add(member);
    else kept.add(column);
  }
  return columns.filter((column) => kept.has(column));
}

function overlappedColumns(extent: Extent, columns: readonly Column[]): number[] {
  const minOverlap = Math.max(COLUMN_MIN_OVERLAP_PT, (extent.right - extent.left) * COLUMN_PLACEMENT_MIN_OVERLAP_RATIO);
  return columns
    .map((column, index) => (overlap(extent, column) >= minOverlap ? index : -1))
    .filter((index) => index >= 0);
}

/**
 * Place a cell on the run of columns it overlaps, starting at the first one
 * its own row leaves free, so a long label never claims a column that holds
 * a value of the same row. A cell overlapping no column goes to the nearest.
 */
function placeOnColumns(
  overlapped: readonly number[],
  occupied: ReadonlySet<number>,
  extent: Extent,
  columns: readonly Column[],
): { column: number; span: number } {
  if (overlapped.length === 0) return { column: nearestColumn(extent, columns), span: 1 };
  const free = overlapped.find((column) => !occupied.has(column));
  if (free === undefined) return { column: mostOverlappedColumn(extent, overlapped, columns), span: 1 };
  const start = free;
  let span = 1;
  while (overlapped.includes(start + span) && !occupied.has(start + span)) span++;
  return { column: start, span };
}

function mostOverlappedColumn(extent: Extent, candidates: readonly number[], columns: readonly Column[]): number {
  return candidates.reduce((best, index) =>
    overlap(extent, columns[index]) > overlap(extent, columns[best]) ? index : best,
  );
}

function nearestColumn(extent: Extent, columns: readonly Column[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, column] of columns.entries()) {
    const distance = Math.max(column.left - extent.right, extent.left - column.right, 0);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function coveredColumns(placement: { column: number; span: number }): number[] {
  return Array.from({ length: placement.span }, (_, offset) => placement.column + offset);
}

function sharesColumn(a: Extent, b: Extent): boolean {
  const narrower = Math.min(a.right - a.left, b.right - b.left);
  return overlap(a, b) >= Math.max(COLUMN_MIN_OVERLAP_PT, narrower * COLUMN_MIN_OVERLAP_RATIO);
}

function overlap(a: Extent, b: Extent): number {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left);
}

function cellExtent(rows: readonly LayoutTableRow[], ref: CellRef): Extent {
  return toExtent(rows[ref.row].cells[ref.cell]);
}

function toExtent(cell: LayoutTableCell): Extent {
  return { left: cell.x, right: cell.x + cell.width };
}

function key(ref: CellRef): string {
  return `${ref.row}:${ref.cell}`;
}
