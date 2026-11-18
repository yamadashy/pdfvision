import type { LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { round2, unionBox } from './geometry.js';
import { assignTableColumns } from './tableColumns.js';

/** Cells on one row share a top, middle or bottom to within this share of the shorter one's height. */
const LEVEL_TOLERANCE_RATIO = 0.15;
const LEVEL_MIN_TOLERANCE_PT = 1;
/** Neighbouring stacks are one table when at least this share of the smaller one's cells sit level with the other's. */
const MIN_LEVEL_SHARE = 0.5;
const ROW_TOP_ALIGNMENT_RATIO = 0.5;
const ROW_OVERLAP_RATIO = 0.35;
const MIN_ROWS = 2;
/** A stack of fewer cells (a header set between columns) says nothing about how the rows line up. */
const MIN_BLOCK_CELLS = 3;

interface Stack {
  left: number;
  right: number;
  cells: LayoutTableCell[];
}

/**
 * Split the rows a text table had joined to a ruled grid, once the grid's
 * own rows are taken out, into the blocks they are set side by side: a
 * recipient address beside an issuer's address and invoice-number fields.
 * Rows grouped across the page by vertical overlap join such blocks line by
 * line, yet their lines do not share baselines, so a column of one block
 * sits level with almost none of the next block's cells.
 *
 * Only that remainder is split. A table found from its own values can set
 * a two-line label beside values centred between its lines (a plant name
 * over its address beside its figures), which is just as unlevelled; there
 * the rows are the evidence, and they stay.
 *
 * Each run of columns whose cells are level is read as a table of its own,
 * its rows regrouped from its own cells, and kept only while it still has
 * two rows of two cells (the key–value fields); a block of single lines
 * (an address) is no table and is left to the page body.
 */
export function splitUnlevelledStacks(table: LayoutTable): LayoutTable[] {
  const stacks = columnStacks(table.rows.flatMap((row) => row.cells));
  if (stacks.length < 2) return [table];
  const groups: Stack[][] = [[stacks[0]]];
  for (const stack of stacks.slice(1)) {
    const group = groups[groups.length - 1];
    if (isLevelWith(group[group.length - 1], stack)) group.push(stack);
    else groups.push([stack]);
  }
  if (groups.length === 1) return [table];
  return groups.flatMap((group) => {
    const piece = pieceTable(group.flatMap((stack) => stack.cells));
    return piece ? [piece] : [];
  });
}

/** Cells whose horizontal extents chain together, left to right. */
function columnStacks(cells: readonly LayoutTableCell[]): Stack[] {
  const stacks: Stack[] = [];
  for (const cell of [...cells].sort((a, b) => a.x - b.x)) {
    const last = stacks[stacks.length - 1];
    if (last && cell.x < last.right) {
      last.cells.push(cell);
      last.right = Math.max(last.right, cell.x + cell.width);
    } else {
      stacks.push({ left: cell.x, right: cell.x + cell.width, cells: [cell] });
    }
  }
  return stacks;
}

function isLevelWith(a: Stack, b: Stack): boolean {
  const [smaller, larger] = a.cells.length <= b.cells.length ? [a, b] : [b, a];
  if (smaller.cells.length < MIN_BLOCK_CELLS) return true;
  const level = smaller.cells.filter((cell) => larger.cells.some((other) => isLevel(cell, other))).length;
  return level >= smaller.cells.length * MIN_LEVEL_SHARE;
}

function isLevel(a: LayoutTableCell, b: LayoutTableCell): boolean {
  const tolerance = Math.max(LEVEL_MIN_TOLERANCE_PT, Math.min(a.height, b.height) * LEVEL_TOLERANCE_RATIO);
  return (
    Math.abs(a.y - b.y) <= tolerance ||
    Math.abs(a.y + a.height - (b.y + b.height)) <= tolerance ||
    Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) <= tolerance
  );
}

function pieceTable(cells: readonly LayoutTableCell[]): LayoutTable | undefined {
  const rows: LayoutTableCell[][] = [];
  for (const cell of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareRow(cell, candidate[0]));
    if (row) row.push(cell);
    else rows.push([cell]);
  }
  const multi = rows.map((row, index) => (row.length >= 2 ? index : -1)).filter((index) => index >= 0);
  if (multi.length < MIN_ROWS) return undefined;
  const kept = rows.slice(multi[0], multi[multi.length - 1] + 1);
  const tableRows: LayoutTableRow[] = kept.map((row) => {
    const box = unionBox(row);
    return {
      y: round2(box.y),
      height: round2(box.height),
      cells: row.sort((a, b) => a.x - b.x).map(({ column: _column, columnSpan: _span, ...cell }) => cell),
    };
  });
  const box = unionBox(kept.flat());
  const placed = assignTableColumns({
    ...box,
    rowCount: tableRows.length,
    columnCount: Math.max(...tableRows.map((row) => row.cells.length)),
    rows: tableRows,
  });
  // Every cell of a layout table carries a column; with no column evidence, its position in the row.
  if (placed.rows.every((row) => row.cells.every((cell) => cell.column !== undefined))) return placed;
  return {
    ...placed,
    rows: placed.rows.map((row) => ({ ...row, cells: row.cells.map((cell, column) => ({ ...cell, column })) })),
  };
}

function canShareRow(a: LayoutTableCell, b: LayoutTableCell): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * ROW_TOP_ALIGNMENT_RATIO) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * ROW_OVERLAP_RATIO;
}
