import type {
  LayoutLine,
  LayoutTable,
  LayoutTableCell,
  LayoutTableRow,
  PageResult,
  PageWarning,
} from '../../types/index.js';
import { isTableValueCell } from '../layout/tableCells.js';
import { isClearlyCloser } from '../layout/tableLabelWraps.js';

const LINE_CLAIMED_MIN_AREA_RATIO = 0.5;
const SHIFTED_COLUMN_MIN_ROWS = 2;
const WRAP_FULL_LINE_SLACK_RATIO = 0.15;

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
  const wraps = ambiguousLabelWraps(table, lines);
  if (wraps > 0) {
    reasons.push(
      `${wraps} wrapped label${wraps === 1 ? '' : 's'} sit${wraps === 1 ? 's' : ''} as close to the row above as to ${wraps === 1 ? 'its' : 'their'} own values, so ${wraps === 1 ? 'its first line' : 'their first lines'} may belong to the row above`,
    );
  }
  const split = splitLabelRows(table, lines);
  if (split > 0) {
    reasons.push(
      `${split} row${split === 1 ? ' has' : 's have'} values but no label while label text overlaps ${split === 1 ? 'it' : 'them'} from the line above or below, so a label set around its values may be split across rows`,
    );
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

/**
 * Rows whose label wraps over lines above the line that carries its values,
 * where the previous row has values and a full-width label in the same
 * column, and nothing in the spacing says which row those lines belong to. Detection
 * moves such lines to the row above only when they sit clearly closer to
 * it (an invoice item wrapping under its first line); when the gaps are
 * alike it keeps them with the row below, as statements set them, and the
 * page cannot confirm that.
 */
function ambiguousLabelWraps(table: LayoutTable, lines: readonly LayoutLine[]): number {
  const labels = table.rows.map((row) => row.cells[0]).filter((cell) => cell && !isTableValueCell(cell.text));
  const labelLeft = Math.min(...labels.map((cell) => cell.x));
  const labelRight = Math.max(...labels.map((cell) => cell.x + cell.width));
  let count = 0;
  for (let index = 1; index < table.rows.length; index++) {
    const row = table.rows[index];
    const above = table.rows[index - 1];
    const label = row.cells[0];
    const aboveLabel = above.cells[0];
    if (!label || !aboveLabel || isTableValueCell(label.text) || isTableValueCell(aboveLabel.text)) continue;
    const values = row.cells.filter((cell) => isTableValueCell(cell.text));
    if (values.length === 0 || !above.cells.some((cell) => isTableValueCell(cell.text))) continue;
    const valueTop = Math.min(...values.map((cell) => cell.y));
    const wrapped = lines
      .filter((line) => isClaimedBy(label, line) && line.y + line.height <= valueTop + 1)
      .sort((a, b) => a.y - b.y);
    const first = wrapped[0];
    const last = wrapped.at(-1);
    if (!first || !last) continue;
    if (Math.abs(first.x - aboveLabel.x) > Math.max(12, first.fontSize * 2)) continue;
    // A label only wraps once its line is full; a short last line above (a
    // subtotal under a group heading) cannot continue onto these lines.
    const aboveLast = lines.filter((line) => isClaimedBy(aboveLabel, line)).sort((a, b) => b.y - a.y)[0];
    const fullFrom = labelRight - Math.max(first.fontSize * 3, (labelRight - labelLeft) * WRAP_FULL_LINE_SLACK_RATIO);
    if (!aboveLast || aboveLast.x + aboveLast.width < fullFrom) continue;
    const aboveBottom = Math.max(...above.cells.map((cell) => cell.y + cell.height));
    if (!isClearlyCloser(valueTop - (last.y + last.height), first.y - aboveBottom)) count++;
  }
  return count;
}

/**
 * Rows with values and no label, overlapped vertically by label text in
 * the label column: a two-line label set around its values' line, read as
 * a label-only row, a value-only row and a label glued onto the next row.
 * Rows set apart from their neighbours (a standard error under its
 * coefficient) are not overlapped and do not count.
 */
function splitLabelRows(table: LayoutTable, lines: readonly LayoutLine[]): number {
  return table.rows.filter((row) => {
    const values = row.cells.filter((cell) => isTableValueCell(cell.text));
    if (values.length === 0 || row.cells.some((cell) => !isTableValueCell(cell.text) && /\p{L}/u.test(cell.text))) {
      return false;
    }
    const valueLeft = Math.min(...values.map((cell) => cell.x));
    const top = Math.min(...values.map((cell) => cell.y));
    const bottom = Math.max(...values.map((cell) => cell.y + cell.height));
    return lines.some(
      (line) =>
        /\p{L}/u.test(line.text) &&
        !isTableValueCell(line.text) &&
        line.x >= table.x - 1 &&
        line.x + line.width <= valueLeft &&
        Math.min(bottom, line.y + line.height) - Math.max(top, line.y) > 0,
    );
  }).length;
}

function valueCollisionRows(table: LayoutTable): number {
  return table.rows.filter((row) => {
    const seen = new Set<number>();
    for (const cell of row.cells) {
      if (!isTableValueCell(cell.text)) continue;
      const columns = coveredColumns(cell);
      if (columns.some((column) => seen.has(column))) return true;
      for (const column of columns) seen.add(column);
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
