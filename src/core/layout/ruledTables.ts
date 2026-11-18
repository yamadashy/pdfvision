import type { LayoutLine, LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { round2 } from './geometry.js';
import { hasTableValueEvidence, isTableValueCell } from './tableCells.js';
import { groupLinesByTableRow, mergeLineTexts } from './tableRows.js';
import type { TableRule, TableRules } from './tableRules.js';

const JOIN_TOLERANCE_PT = 2;
const EDGE_MERGE_PT = 2;
const EDGE_INSIDE_PT = 1;
const MIN_COLUMNS = 2;
const MIN_ROWS = 2;
const MIN_FILLED_ROWS = 2;
const MIN_VALUE_ROWS = 2;
/** A cell holding more text rows than this is a framed paragraph, not a table cell. */
const CELL_MAX_TEXT_ROWS = 6;
const HEADER_MAX_ROWS = 4;
const LEVEL_TOLERANCE_PT = 1.5;
const HEADER_MAX_GAP_PT = 12;

interface Region {
  left: number;
  right: number;
  top: number;
  bottom: number;
  lines: LayoutLine[];
}

/**
 * Tables whose cells are drawn: vertical rules for the column boundaries
 * and horizontal rules for the row boundaries. The rules give each line
 * its cell directly, so the grid needs none of the alignment guesses the
 * text detectors make, and a boundary rule drawn only across some columns
 * shows which cells are merged — a parameter cell beside several condition
 * rows, a group header over several columns. A merged cell's text is
 * repeated in every row it spans, so each row reads on its own.
 *
 * A grid is used only when its text clearly reads as a table: at least two
 * columns and two rows with text in more than one cell, values in two rows,
 * every line inside one cell, and no cell holding a paragraph or more than
 * one row of values (a ruled box whose rows are not ruled, which the text
 * detectors read better).
 */
export function detectRuledTables(lines: readonly LayoutLine[], rules: TableRules): RuledTable[] {
  if (rules.vertical.length < MIN_COLUMNS + 1 || rules.horizontal.length < 2) return [];
  const tables: RuledTable[] = [];
  for (const grid of ruleGrids(rules)) {
    const table = gridTable(grid, lines);
    if (table) tables.push(table);
  }
  return tables;
}

export interface RuledTable {
  table: LayoutTable;
  /** Horizontal extent of each column of {@link table}, by column index. */
  columns: { left: number; right: number }[];
}

/**
 * Prepend the header rows a text detector found right above a ruled grid
 * whose first row is already data (column names set above the first
 * rule), placed on the grid's columns.
 * Only the run of multi-cell rows directly above the grid counts: a single
 * line there is a caption or a title.
 */
export function withHeaderRowsAbove(ruled: RuledTable, candidates: readonly LayoutTableRow[]): LayoutTable {
  const { table, columns } = ruled;
  // A grid that opens on its own header row has nothing more to take.
  if (!table.rows[0]?.cells.some((cell) => isRuledValueCell(cell.text) && hasTableValueEvidence(cell.text)))
    return table;
  const header: LayoutTableRow[] = [];
  let top = table.y;
  const above = candidates.filter((row) => row.y + row.height <= table.y + EDGE_INSIDE_PT).sort((a, b) => b.y - a.y);
  for (const row of above) {
    if (header.length >= HEADER_MAX_ROWS || row.cells.length < 2) break;
    if (top - (row.y + row.height) > HEADER_MAX_GAP_PT) break;
    if (row.cells.some((cell) => cell.x + cell.width < table.x || cell.x > table.x + table.width)) break;
    header.unshift({ ...row, cells: row.cells.map((cell) => placedOnColumns(cell, columns)) });
    top = row.y;
  }
  if (header.length === 0) return table;
  const rows = [...header, ...table.rows];
  return { ...table, y: round2(top), height: round2(table.y + table.height - top), rowCount: rows.length, rows };
}

function placedOnColumns(cell: LayoutTableCell, columns: RuledTable['columns']): LayoutTableCell {
  const covered = columns
    .map((column, index) => ({
      index,
      overlap: Math.min(column.right, cell.x + cell.width) - Math.max(column.left, cell.x),
    }))
    .filter(({ overlap }) => overlap > Math.min(cell.width, 4))
    .map(({ index }) => index);
  const { column: _column, columnSpan: _span, ...rest } = cell;
  if (covered.length === 0) {
    const center = cell.x + cell.width / 2;
    const nearest = columns.reduce(
      (best, column, index) =>
        Math.abs((column.left + column.right) / 2 - center) <
        Math.abs((columns[best].left + columns[best].right) / 2 - center)
          ? index
          : best,
      0,
    );
    return { ...rest, column: nearest };
  }
  return { ...rest, column: covered[0], ...(covered.length > 1 && { columnSpan: covered.length }) };
}

interface RuleGrid {
  horizontal: TableRule[];
  vertical: TableRule[];
}

/** Rules that touch or cross one another, as connected sets. */
function ruleGrids(rules: TableRules): RuleGrid[] {
  const all = [
    ...rules.horizontal.map((rule) => ({ rule, horizontal: true })),
    ...rules.vertical.map((rule) => ({ rule, horizontal: false })),
  ];
  const parent = all.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  for (let a = 0; a < rules.horizontal.length; a++) {
    const h = rules.horizontal[a];
    for (let b = 0; b < rules.vertical.length; b++) {
      const v = rules.vertical[b];
      if (crosses(h, v)) parent[find(rules.horizontal.length + b)] = find(a);
    }
  }
  const groups = new Map<number, RuleGrid>();
  for (const [index, item] of all.entries()) {
    const root = find(index);
    const group = groups.get(root) ?? { horizontal: [], vertical: [] };
    (item.horizontal ? group.horizontal : group.vertical).push(item.rule);
    groups.set(root, group);
  }
  return [...groups.values()].filter((grid) => grid.vertical.length >= MIN_COLUMNS + 1 && grid.horizontal.length >= 2);
}

function crosses(h: TableRule, v: TableRule): boolean {
  return (
    v.at >= h.start - JOIN_TOLERANCE_PT &&
    v.at <= h.end + JOIN_TOLERANCE_PT &&
    h.at >= v.start - JOIN_TOLERANCE_PT &&
    h.at <= v.end + JOIN_TOLERANCE_PT
  );
}

function gridTable(grid: RuleGrid, lines: readonly LayoutLine[]): RuledTable | undefined {
  const left = Math.min(...grid.horizontal.map((rule) => rule.start), ...grid.vertical.map((rule) => rule.at));
  const right = Math.max(...grid.horizontal.map((rule) => rule.end), ...grid.vertical.map((rule) => rule.at));
  const top = Math.min(...grid.vertical.map((rule) => rule.start), ...grid.horizontal.map((rule) => rule.at));
  const bottom = Math.max(...grid.vertical.map((rule) => rule.end), ...grid.horizontal.map((rule) => rule.at));
  // Open sides (no outer rule) still bound the grid where its rules end.
  const xs = edges([left, ...grid.vertical.map((rule) => rule.at), right]);
  const ys = edges([top, ...grid.horizontal.map((rule) => rule.at), bottom]);
  const columns = xs.length - 1;
  const bands = ys.length - 1;
  if (columns < MIN_COLUMNS || bands < MIN_ROWS) return undefined;

  const verticalAt = (edge: number, band: number) =>
    edge === 0 || edge === columns || covers(grid.vertical, xs[edge], (ys[band] + ys[band + 1]) / 2);
  const horizontalAt = (edge: number, column: number) =>
    edge === 0 || edge === bands || covers(grid.horizontal, ys[edge], (xs[column] + xs[column + 1]) / 2);

  // Atomic cells joined across every boundary that has no rule.
  const parent = Array.from({ length: columns * bands }, (_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    parent[index] = root;
    return root;
  };
  const id = (column: number, band: number) => band * columns + column;
  for (let band = 0; band < bands; band++) {
    for (let column = 0; column < columns; column++) {
      if (column + 1 < columns && !verticalAt(column + 1, band)) {
        parent[find(id(column + 1, band))] = find(id(column, band));
      }
      if (band + 1 < bands && !horizontalAt(band + 1, column)) {
        parent[find(id(column, band + 1))] = find(id(column, band));
      }
    }
  }
  const regions = new Map<number, Region>();
  for (let band = 0; band < bands; band++) {
    for (let column = 0; column < columns; column++) {
      const root = find(id(column, band));
      const region = regions.get(root);
      if (region) {
        region.left = Math.min(region.left, column);
        region.right = Math.max(region.right, column);
        region.top = Math.min(region.top, band);
        region.bottom = Math.max(region.bottom, band);
      } else {
        regions.set(root, { left: column, right: column, top: band, bottom: band, lines: [] });
      }
    }
  }

  const lineBands = new Map<LayoutLine, number>();
  for (const line of lines) {
    if (line.writingMode === 'vertical' || line.text.trim().length === 0) continue;
    const centerX = line.x + line.width / 2;
    const centerY = line.y + line.height / 2;
    if (centerX <= xs[0] || centerX >= xs[columns] || centerY <= ys[0] || centerY >= ys[bands]) continue;
    const column = bandIndex(xs, centerX);
    const band = bandIndex(ys, centerY);
    // A line running across a drawn column boundary is text over the grid
    // (a watermark, a callout), not cell content.
    for (let edge = 1; edge < columns; edge++) {
      if (line.x < xs[edge] - EDGE_INSIDE_PT && line.x + line.width > xs[edge] + EDGE_INSIDE_PT) {
        if (verticalAt(edge, band)) return undefined;
      }
    }
    const region = regions.get(find(id(column, band)));
    if (!region) continue;
    region.lines.push(line);
    lineBands.set(line, band);
  }

  const split = [...regions.values()].flatMap((region) => splitAtFreeEdges(region, xs));
  const filled = split.flatMap((region) => splitAtRowLines(region, split, lineBands));
  for (const region of filled) {
    const textRows = groupLinesByTableRow(region.lines);
    if (textRows.length > CELL_MAX_TEXT_ROWS) return undefined;
    if (textRows.filter((row) => row.some((line) => isRuledValueCell(line.text))).length > 1) return undefined;
  }

  const usedColumns = [...new Set(filled.flatMap((region) => range(region.left, region.right)))].sort((a, b) => a - b);
  const columnOf = new Map(usedColumns.map((column, index) => [column, index]));
  const emitted: number[] = [];
  for (let band = 0; band < bands; band++) {
    if (filled.some((region) => region.lines.some((line) => lineBands.get(line) === band))) emitted.push(band);
  }
  const rows: LayoutTableRow[] = emitted.map((band) => ({
    y: round2(ys[band]),
    height: round2(ys[band + 1] - ys[band]),
    cells: filled
      .filter((region) => region.top <= band && region.bottom >= band)
      .sort((a, b) => a.left - b.left)
      .map((region) => {
        const cell = regionCell(region, columnOf);
        // A merged cell is repeated in each row it covers; rowSpan says how many.
        const span = emitted.filter((other) => other >= region.top && other <= region.bottom).length;
        return span > 1 ? { ...cell, rowSpan: span } : cell;
      }),
  }));
  if (rows.length < MIN_ROWS || usedColumns.length < MIN_COLUMNS) return undefined;
  if (rows.filter((row) => row.cells.length >= 2).length < MIN_FILLED_ROWS) return undefined;
  // A drawn cell already bounds its value, so a row of cells with figures
  // in them (\`316個\`, \`2020年5月12日\`) counts as a row of values too.
  const valueRows = rows.filter(
    (row) =>
      row.cells.some((cell) => isRuledValueCell(cell.text) && hasTableValueEvidence(cell.text)) ||
      row.cells.filter((cell) => /\d/u.test(cell.text)).length >= 2,
  );
  if (valueRows.length < MIN_VALUE_ROWS) return undefined;
  if (isMostlyEmptyColumnGrid(rows)) return undefined;

  return {
    table: {
      x: round2(xs[0]),
      y: round2(ys[0]),
      width: round2(xs[columns] - xs[0]),
      height: round2(ys[bands] - ys[0]),
      rowCount: rows.length,
      columnCount: usedColumns.length,
      rows,
    },
    columns: usedColumns.map((column) => ({ left: xs[column], right: xs[column + 1] })),
  };
}

/**
 * A merged region whose lines sit apart in different columns, with no line
 * across the boundary between them, is unruled text over ruled columns (a
 * header band above the column rules), not one merged cell: it is split at
 * those boundaries. A line reaching over a boundary (a group header) keeps
 * its columns together.
 */
function splitAtFreeEdges(region: Region, xs: readonly number[]): Region[] {
  if (region.lines.length === 0) return [];
  const cuts: number[] = [];
  for (let edge = region.left + 1; edge <= region.right; edge++) {
    const at = xs[edge];
    const crossed = region.lines.some(
      (line) => line.x < at - EDGE_INSIDE_PT && line.x + line.width > at + EDGE_INSIDE_PT,
    );
    const before = region.lines.some((line) => line.x + line.width <= at + EDGE_INSIDE_PT);
    const after = region.lines.some((line) => line.x >= at - EDGE_INSIDE_PT);
    if (!crossed && before && after) cuts.push(edge);
  }
  if (cuts.length === 0) return [region];
  const bounds = [region.left, ...cuts, region.right + 1];
  return bounds.slice(0, -1).flatMap((left, index) => {
    const right = bounds[index + 1] - 1;
    const lines = region.lines.filter((line) => {
      const center = line.x + line.width / 2;
      return center > xs[left] && center < xs[right + 1];
    });
    return lines.length > 0 ? [{ ...region, left, right, lines }] : [];
  });
}

/**
 * A region merged over several row bands whose text rows each sit level
 * with text of another cell in their own band is a column whose row rules
 * are missing (a model-name column beside ruled value rows), not a merged
 * cell: it is split into one cell per band. A merged cell's lines (a
 * parameter wrapping over its condition rows) are set from its top and do
 * not line up with each band's own text.
 */
function splitAtRowLines(region: Region, all: readonly Region[], lineBands: ReadonlyMap<LayoutLine, number>): Region[] {
  if (region.bottom === region.top) return [region];
  const textRows = groupLinesByTableRow(region.lines);
  if (textRows.length < 2) return [region];
  const others = all.filter((other) => other !== region);
  const pieces = new Map<number, LayoutLine[]>();
  for (const textRow of textRows) {
    const band = lineBands.get(textRow[0]);
    if (band === undefined || textRow.some((line) => lineBands.get(line) !== band)) return [region];
    const level = others.some((other) =>
      other.lines.some(
        (line) => lineBands.get(line) === band && textRow.some((own) => Math.abs(own.y - line.y) <= LEVEL_TOLERANCE_PT),
      ),
    );
    if (!level || pieces.has(band)) return [region];
    pieces.set(band, textRow);
  }
  return [...pieces.entries()].map(([band, lines]) => ({ ...region, top: band, bottom: band, lines }));
}

/**
 * A ruled grid most of whose columns hold text in a single row is a
 * timeline or chart grid beside a few text columns (a Gantt chart's week
 * columns under their dates): its columns are drawn, not filled, and the
 * text detectors read the text columns better than a grid of empty cells.
 */
function isMostlyEmptyColumnGrid(rows: readonly LayoutTableRow[]): boolean {
  const filledRows = new Map<number, number>();
  for (const row of rows) {
    for (const column of new Set(row.cells.map((cell) => cell.column ?? 0))) {
      filledRows.set(column, (filledRows.get(column) ?? 0) + 1);
    }
  }
  const single = [...filledRows.values()].filter((count) => count <= 1).length;
  return single > filledRows.size - single;
}

function regionCell(region: Region, columnOf: ReadonlyMap<number, number>): LayoutTableCell {
  const merged = mergeLineTexts(region.lines);
  const covered = range(region.left, region.right).filter((column) => columnOf.has(column));
  const column = columnOf.get(covered[0] ?? region.left) ?? 0;
  return {
    text: merged.text,
    x: merged.x,
    y: merged.y,
    width: merged.width,
    height: merged.height,
    column,
    ...(covered.length > 1 && { columnSpan: covered.length }),
  };
}

/** Distinct sorted positions, a rule drawn twice a hair apart counted once. */
function edges(positions: number[]): number[] {
  const sorted = [...positions].sort((a, b) => a - b);
  const result: number[] = [];
  for (const position of sorted) {
    const last = result.at(-1);
    if (last === undefined || position - last > EDGE_MERGE_PT) result.push(position);
  }
  return result;
}

function covers(rules: readonly TableRule[], at: number, along: number): boolean {
  return rules.some((rule) => Math.abs(rule.at - at) <= EDGE_MERGE_PT && rule.start <= along && rule.end >= along);
}

function bandIndex(edgesList: readonly number[], value: number): number {
  for (let index = 0; index + 1 < edgesList.length; index++) {
    if (value < edgesList[index + 1]) return index;
  }
  return edgesList.length - 2;
}

// Specification tables sign values `±0.3` and `–40`; the drawn cell already
// says where the value ends, so the sign needs no column evidence here.
function isRuledValueCell(text: string): boolean {
  return isTableValueCell(text.trim().replace(/^[±∓–−]\s*(?=\d)/u, ''));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
}
