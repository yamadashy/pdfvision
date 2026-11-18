import type { LayoutLine, LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { round2, unionBox } from './geometry.js';
import { isTableValueCell } from './tableCells.js';
import { groupLinesByTableRow, rowBottom, rowY } from './tableRows.js';
import type { TableRule } from './tableRules.js';

const SAME_EXTENT_PT = 3;
const EXTENT_SLACK_PT = 4;
const RULE_NEAR_TABLE_PT = 40;
const RULE_NEAR_ROW_HEIGHTS = 3;
const HEADER_MAX_ROWS = 3;
const BRACKET_MIN_ROW_SHARE = 0.5;
const CLAIMED_MIN_AREA_RATIO = 0.5;

/**
 * Fit a table found from its text to the horizontal rules drawn around it
 * (a booktabs table: a rule above the header, one under it, one at the
 * bottom, all of one width). Two or more rules of the same extent with
 * table rows between them say how wide the table is:
 *
 * - cells beyond that extent are text beside the table that its rows lined
 *   up with (a heading in the next column), and leave it;
 * - when the table starts at a body row, the lines between the top rule
 *   and that row are its header, placed on its columns.
 */
export function fitTableToRules(
  table: LayoutTable,
  rules: readonly TableRule[],
  lines: readonly LayoutLine[],
): LayoutTable {
  const bracket = ruleBracket(table, rules);
  if (!bracket) return table;
  const inside = (cell: LayoutTableCell) => {
    const center = cell.x + cell.width / 2;
    return center >= bracket.start - EXTENT_SLACK_PT && center <= bracket.end + EXTENT_SLACK_PT;
  };
  const trimmed = table.rows
    .map((row) => ({ ...row, cells: row.cells.filter(inside) }))
    .filter((row) => row.cells.length > 0);
  if (trimmed.length < 2) return table;
  const columns = [...new Set(trimmed.flatMap((row) => row.cells.flatMap(coveredColumns)))].sort((a, b) => a - b);
  const renumber = new Map(columns.map((column, index) => [column, index]));
  const rows = trimmed.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {
      const covered = coveredColumns(cell).filter((column) => renumber.has(column));
      const { columnSpan: _span, ...rest } = cell;
      return {
        ...rest,
        column: renumber.get(cell.column ?? 0) ?? 0,
        ...(covered.length > 1 && { columnSpan: covered.length }),
      };
    }),
  }));
  const header = headerRows(rows, bracket, lines);
  const all = [...header, ...withBracketedLines(rows, bracket, lines)];
  const box = unionBox(all.flatMap((row) => row.cells));
  return { ...box, rowCount: all.length, columnCount: columns.length, rows: all };
}

interface Bracket {
  start: number;
  end: number;
  top: number;
  bottom: number;
}

function ruleBracket(table: LayoutTable, rules: readonly TableRule[]): Bracket | undefined {
  // A header of a few lines sits between the top rule and the first row.
  const reach = Math.max(RULE_NEAR_TABLE_PT, ...table.rows.map((row) => row.height * RULE_NEAR_ROW_HEIGHTS));
  const near = rules.filter(
    (rule) =>
      rule.at >= table.y - reach &&
      rule.at <= table.y + table.height + reach &&
      rule.start >= table.x - EXTENT_SLACK_PT &&
      rule.end <= table.x + table.width + EXTENT_SLACK_PT,
  );
  const rowCenters = table.rows.map((row) => row.y + row.height / 2);
  let best: (Bracket & { rows: number }) | undefined;
  for (const rule of near) {
    const group = near.filter(
      (other) =>
        Math.abs(other.start - rule.start) <= SAME_EXTENT_PT && Math.abs(other.end - rule.end) <= SAME_EXTENT_PT,
    );
    if (group.length < 2) continue;
    const top = Math.min(...group.map((other) => other.at));
    const bottom = Math.max(...group.map((other) => other.at));
    const rows = rowCenters.filter((center) => center > top && center < bottom).length;
    // Rules around a few rows of a much longer "table" bound those rows, not it.
    if (rows < 2 || rows < rowCenters.length * BRACKET_MIN_ROW_SHARE) continue;
    // The rules must leave some of the table's text outside, or there is nothing to fit.
    if (!best || rows > best.rows) best = { start: rule.start, end: rule.end, top, bottom, rows };
  }
  if (!best) return undefined;
  const cells = table.rows.flatMap((row) => row.cells);
  const isOutside = (cell: LayoutTableCell) => {
    const center = cell.x + cell.width / 2;
    return center < best.start - EXTENT_SLACK_PT || center > best.end + EXTENT_SLACK_PT;
  };
  const outside = cells.filter(isOutside);
  // Rules under one column (a per-column underline) or values beyond the
  // rules are the table's own drawing, not its edges.
  if (outside.some((cell) => isTableValueCell(cell.text))) return undefined;
  // Rules over the value columns only (a statement's column underlines)
  // leave the row labels left of them: those are the table's own labels.
  // Only running text there (the next poster block) is beside the table.
  const leftLabels = table.rows.filter((row) => {
    const values = row.cells.some((cell) => !isOutside(cell) && isTableValueCell(cell.text));
    return (
      values &&
      row.cells.some((cell) => isOutside(cell) && cell.x + cell.width / 2 < best.start && !isRunningText(cell))
    );
  });
  if (leftLabels.length > 0) return undefined;
  const insideColumns = new Set(cells.filter((cell) => !isOutside(cell)).map((cell) => cell.column));
  if (insideColumns.size < 2) return undefined;
  if (outside.length === 0 && !isBodyRow(table.rows[0])) return undefined;
  return best;
}

/**
 * Lines inside the bracket that no cell holds, set level with a row: a
 * label that row grouping gave to the text beside the table, which the
 * trim then dropped with it. Each joins its row on the column under it.
 */
function withBracketedLines(
  rows: readonly LayoutTableRow[],
  bracket: Bracket,
  lines: readonly LayoutLine[],
): LayoutTableRow[] {
  const extents = columnExtents(rows);
  if (extents.length < 2) return [...rows];
  const cells = rows.flatMap((row) => row.cells);
  const added = new Map<LayoutTableRow, LayoutTableCell[]>();
  for (const line of lines) {
    const centerX = line.x + line.width / 2;
    const centerY = line.y + line.height / 2;
    if (centerY <= bracket.top || centerY >= bracket.bottom) continue;
    if (centerX < bracket.start - EXTENT_SLACK_PT || centerX > bracket.end + EXTENT_SLACK_PT) continue;
    if (cells.some((cell) => overlapArea(cell, line) >= line.width * line.height * CLAIMED_MIN_AREA_RATIO)) continue;
    const row = rows.find((candidate) => centerY > candidate.y && centerY < candidate.y + candidate.height);
    if (!row) continue;
    const cell = placeCell(line, extents);
    if (row.cells.some((other) => coveredColumns(other).includes(cell.column ?? 0))) continue;
    added.set(row, [...(added.get(row) ?? []), cell]);
  }
  if (added.size === 0) return [...rows];
  return rows.map((row) => {
    const extra = added.get(row);
    return extra ? { ...row, cells: [...row.cells, ...extra].sort((a, b) => a.x - b.x) } : row;
  });
}

function overlapArea(a: { x: number; y: number; width: number; height: number }, b: LayoutLine): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function headerRows(rows: readonly LayoutTableRow[], bracket: Bracket, lines: readonly LayoutLine[]): LayoutTableRow[] {
  const first = rows[0];
  if (!first || !isBodyRow(first)) return [];
  const extents = columnExtents(rows);
  if (extents.length < 2) return [];
  const candidates = lines.filter((line) => {
    const centerX = line.x + line.width / 2;
    const centerY = line.y + line.height / 2;
    return (
      centerY > bracket.top &&
      line.y + line.height <= first.y + 1 &&
      centerX >= bracket.start - EXTENT_SLACK_PT &&
      centerX <= bracket.end + EXTENT_SLACK_PT
    );
  });
  const grouped = groupLinesByTableRow(candidates);
  if (grouped.length === 0 || grouped.length > HEADER_MAX_ROWS) return [];
  return grouped.map((row) => ({
    y: round2(rowY(row)),
    height: round2(rowBottom(row) - rowY(row)),
    cells: [...row].sort((a, b) => a.x - b.x).map((line) => placeCell(line, extents)),
  }));
}

function placeCell(
  line: LayoutLine,
  extents: readonly { column: number; left: number; right: number }[],
): LayoutTableCell {
  const covered = extents
    .filter((extent) => Math.min(extent.right, line.x + line.width) - Math.max(extent.left, line.x) > 0)
    .map((extent) => extent.column);
  const center = line.x + line.width / 2;
  const nearest = extents.reduce((best, extent) =>
    Math.abs((extent.left + extent.right) / 2 - center) < Math.abs((best.left + best.right) / 2 - center)
      ? extent
      : best,
  ).column;
  const column = covered[0] ?? nearest;
  const span = covered.length > 0 ? covered[covered.length - 1] - covered[0] + 1 : 1;
  return {
    text: line.text,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    column,
    ...(span > 1 && { columnSpan: span }),
  };
}

function columnExtents(rows: readonly LayoutTableRow[]): { column: number; left: number; right: number }[] {
  const extents = new Map<number, { column: number; left: number; right: number }>();
  for (const cell of rows.filter(isBodyRow).flatMap((row) => row.cells)) {
    if (cell.column === undefined || (cell.columnSpan ?? 1) > 1) continue;
    const extent = extents.get(cell.column);
    if (extent) {
      extent.left = Math.min(extent.left, cell.x);
      extent.right = Math.max(extent.right, cell.x + cell.width);
    } else {
      extents.set(cell.column, { column: cell.column, left: cell.x, right: cell.x + cell.width });
    }
  }
  return [...extents.values()].sort((a, b) => a.column - b.column);
}

function isBodyRow(row: LayoutTableRow | undefined): boolean {
  return row !== undefined && row.cells.length >= 2 && row.cells.some((cell) => isTableValueCell(cell.text));
}

function coveredColumns(cell: LayoutTableCell): number[] {
  return Array.from({ length: cell.columnSpan ?? 1 }, (_, offset) => (cell.column ?? 0) + offset);
}

const RUNNING_TEXT_MIN_WORDS = 5;
const RUNNING_TEXT_MIN_EM = 12;

function isRunningText(cell: LayoutTableCell): boolean {
  const words = cell.text
    .trim()
    .split(/\s+/u)
    .filter((word) => /\p{L}/u.test(word));
  return words.length >= RUNNING_TEXT_MIN_WORDS && cell.width >= Math.max(cell.height, 1) * RUNNING_TEXT_MIN_EM;
}
