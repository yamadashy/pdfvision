import type {
  LayoutLine,
  LayoutTable,
  LayoutTableCell,
  LayoutTableRow,
  PageResult,
  PageWarning,
} from '../../types/index.js';
import { isTableValueCell } from '../layout/tableCells.js';

const LINE_CLAIMED_MIN_AREA_RATIO = 0.5;
const SHIFTED_COLUMN_MIN_ROWS = 2;

/**
 * Flag layout tables whose geometry did not resolve into one consistent
 * grid. Each condition is evidence that a value sits in the wrong row or
 * column, or is missing, rather than a property of messy-but-correct tables:
 *
 * - text inside the table's box that no row claimed (a dropped row or cell);
 * - two value cells assigned the same column in one row;
 * - two neighbouring columns that no row ever fills together, each used by
 *   several rows: one visual column split in two, or two stacked tables with
 *   different grids read as one, so a value's column depends on its row.
 */
export function detectLayoutTableUncertainty(page: PageResult, out: PageWarning[]): void {
  const tables = page.layout?.tables;
  if (!tables || tables.length === 0) return;
  const lines = page.layout?.blocks.flatMap((block) => block.lines) ?? [];
  const toRaw = 1 / (page.userUnit ?? 1);

  for (const [tableIndex, table] of tables.entries()) {
    const reasons = tableUncertaintyReasons(table, lines);
    if (reasons.length === 0) continue;
    const region = [table.x, table.y, table.width, table.height].map((n) => round2(n * toRaw)).join(',');
    out.push({
      code: 'layout_table_uncertain',
      severity: 'warning',
      tableIndex,
      message: `layout table ${tableIndex + 1} (bbox ${region}) did not resolve into one consistent grid: ${reasons.join('; ')} — its cells may sit in the wrong row or column or be missing; render that region (--render-region ${region}) before trusting the table`,
    });
  }
}

export function tableUncertaintyReasons(table: LayoutTable, lines: readonly LayoutLine[]): string[] {
  const reasons: string[] = [];
  const orphans = orphanLines(table, lines);
  if (orphans.length > 0) {
    reasons.push(
      `${orphans.length} line${orphans.length === 1 ? '' : 's'} with numbers inside the table belong${orphans.length === 1 ? 's' : ''} to no row`,
    );
  }
  const collisions = valueCollisionRows(table);
  if (collisions > 0) {
    reasons.push(`${collisions} row${collisions === 1 ? ' has' : 's have'} two values in one column`);
  }
  const shifted = shiftedColumnPairs(table);
  if (shifted > 0) {
    reasons.push(
      `${shifted} pair${shifted === 1 ? '' : 's'} of neighbouring columns never filled in the same row, so rows disagree on the column grid`,
    );
  }
  return reasons;
}

/**
 * Lines carrying a number that lie among the table's body rows yet belong to
 * none of them: a dropped row or cell. Above the first body row only a bare
 * value counts (a dropped first data row); other text there is header
 * context, and text-only lines are labels or notes. Neither changes which
 * value sits where, so they do not count.
 */
function orphanLines(table: LayoutTable, lines: readonly LayoutLine[]): LayoutLine[] {
  const bodyTop = table.rows.find(isBodyRow)?.y;
  if (bodyTop === undefined) return [];
  const cells = table.rows.flatMap((row) => row.cells);
  return lines.filter((line) => {
    if (line.writingMode === 'vertical' || !/\p{N}/u.test(line.text)) return false;
    const centerX = line.x + line.width / 2;
    const centerY = line.y + line.height / 2;
    if (centerX <= table.x || centerX >= table.x + table.width) return false;
    if (centerY <= table.y || centerY >= table.y + table.height) return false;
    if (centerY < bodyTop && !isTableValueCell(line.text)) return false;
    return !cells.some((cell) => isClaimedBy(cell, line));
  });
}

function valueCollisionRows(table: LayoutTable): number {
  return table.rows.filter((row) => {
    const seen = new Set<number>();
    for (const cell of row.cells) {
      if (cell.column === undefined || !isTableValueCell(cell.text)) continue;
      if (seen.has(cell.column)) return true;
      seen.add(cell.column);
    }
    return false;
  }).length;
}

function shiftedColumnPairs(table: LayoutTable): number {
  const occupancy = table.rows.filter(isBodyRow).map((row) => new Set(row.cells.flatMap(coveredColumns)));
  let pairs = 0;
  for (let column = 0; column + 1 < table.columnCount; column++) {
    const left = occupancy.filter((columns) => columns.has(column)).length;
    const right = occupancy.filter((columns) => columns.has(column + 1)).length;
    const both = occupancy.filter((columns) => columns.has(column) && columns.has(column + 1)).length;
    if (both === 0 && left >= SHIFTED_COLUMN_MIN_ROWS && right >= SHIFTED_COLUMN_MIN_ROWS) pairs++;
  }
  return pairs;
}

function isBodyRow(row: LayoutTableRow): boolean {
  return row.cells.length >= 2 && row.cells.some((cell) => isTableValueCell(cell.text));
}

function coveredColumns(cell: LayoutTableCell): number[] {
  if (cell.column === undefined) return [];
  return Array.from({ length: cell.columnSpan ?? 1 }, (_, offset) => (cell.column ?? 0) + offset);
}

// A line belongs to a cell when most of it lies inside the cell. Cells can
// be slightly narrower than their source line (a trailing currency symbol
// moved to the next column), so strict containment would misfire.
function isClaimedBy(cell: LayoutTableCell, line: LayoutLine): boolean {
  const width = Math.min(cell.x + cell.width, line.x + line.width) - Math.max(cell.x, line.x);
  const height = Math.min(cell.y + cell.height, line.y + line.height) - Math.max(cell.y, line.y);
  if (width <= 0 || height <= 0) return false;
  return width * height >= line.width * line.height * LINE_CLAIMED_MIN_AREA_RATIO;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
