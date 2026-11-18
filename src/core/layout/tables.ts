import type { LayoutLine, LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { type BBox, round2, unionBox } from './geometry.js';
import { linesAsTableCells } from './lineSegments.js';
import {
  isLikelyMirroredChartAxisTable,
  isLikelySparseNumericLegendFragment,
  isLikelyTinyNumericChartFragment,
  isLikelyTinyNumericVectorGrid,
} from './numericVectorGrid.js';
import { fitTableToRules } from './ruleBoundTables.js';
import { detectRuledTables, type RuledTable, withHeaderRowsAbove } from './ruledTables.js';
import { splitSideBySideTables } from './sideBySideTables.js';
import { detectSparseSingleRowTables } from './sparseTables.js';
import { mergeSplitHeaderTables, SPLIT_HEADER_MAX_ROWS } from './splitHeaderTables.js';
import { groupRowsWithBridges } from './tableBridgeRows.js';
import { hasRegularTableRowCadence } from './tableCadence.js';
import { tableCandidateRow } from './tableCandidateRows.js';
import { isTableNumericCell, isTableValueCell, normalizeTableCurrencyCells } from './tableCells.js';
import { assignTableColumns } from './tableColumns.js';
import {
  attachNumericContinuationRows,
  type IndexedLayoutRow,
  scanLabelContinuationRows,
  splitHeadingRows,
} from './tableContinuations.js';
import { insertTableGroupLabelRows } from './tableGroupRows.js';
import { splitJoinedHeaderCells } from './tableHeaderCells.js';
import { joinWrappedHeaderRows } from './tableHeaderWraps.js';
import { foldCarriedLabelLines } from './tableLabelWraps.js';
import {
  attachLeadingTableRows,
  headerRowsEnd,
  isHeaderGapLine,
  isHeaderRowAboveGap,
  isHeaderTextRow,
  markHeaderRow,
  markHeaderRowsAbove,
} from './tableLeadingRows.js';
import { admitPlaceholderRows } from './tablePlaceholderRows.js';
import { groupLinesByTableRow, rowBottom, rowY } from './tableRows.js';
import type { TableRule, TableRules } from './tableRules.js';
import { splitUnlevelledStacks } from './tableStacks.js';

export { isTableNumericCell } from './tableCells.js';

const TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS = 4;
const TABLE_GROUP_MAX_ROW_GAP_PT = 48;
const ALIGNED_TEXT_TABLE_MIN_ROWS = 5;
const ALIGNED_TEXT_TABLE_MAX_ROW_GAP_PT = 24;
const ALIGNED_TEXT_TABLE_MIN_CELLS = 3;
const ALIGNED_TEXT_TABLE_MIN_RECURRING_COLUMNS = 3;
const ALIGNED_TEXT_TABLE_COLUMN_TOLERANCE_PT = 10;
const ALIGNED_TEXT_TABLE_HEADER_MAX_GAP_PT = 28;
const ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT = 220;
const ALIGNED_TEXT_TABLE_MIN_LABEL_ROW_RATIO = 0.5;
const BORROWED_HEADER_MAX_ROWS = 4;
const BORROWED_HEADER_MAX_GAP_PT = 12;
const RULED_TABLE_REPLACE_OVERLAP = 0.3;

/**
 * Tables drawn as a ruled grid are read from their rules; the tables the
 * text detectors find in the same place give way to them. `boxes` (all of
 * the page's vector boxes) tell two grids set side by side apart.
 */
export function detectLayoutTables(
  lines: LayoutLine[],
  rules: TableRules = { horizontal: [], vertical: [] },
  boxes: readonly BBox[] = [],
): LayoutTable[] | undefined {
  const found = detectTextTables(lines, rules.horizontal)
    ?.flatMap((table) => splitSideBySideTables(table, boxes))
    .map((table) => splitJoinedHeaderCells(fitTableToRules(table, rules.horizontal, lines), lines));
  const detected = found && found.length > 0 ? found : undefined;
  const ruled = withoutPartialGrids(
    withoutFragmentGrids(detectRuledTables(lines, rules), detected ?? []),
    detected ?? [],
  );
  if (ruled.length === 0) return detected;
  const replaces = (grid: LayoutTable, table: LayoutTable) =>
    overlapOfSmaller(grid, table) >= RULED_TABLE_REPLACE_OVERLAP;
  // A text table reaching past the grid keeps its rows outside it.
  const tables = (detected ?? []).flatMap((table) => {
    const grids = ruled.filter(({ table: grid }) => replaces(grid, table)).map(({ table: grid }) => grid);
    if (grids.length === 0) return [table];
    // Text beside a drawn grid that line-ups glued onto it (an address
    // block above an invoice's item grid) becomes a table of its own.
    // Its rows there may be blocks set side by side (the recipient's and the
    // issuer's addresses), which only the grid's rows held together.
    const outside = table.rows.filter((row) => !grids.some((grid) => isRowInside(row, grid)));
    return outside.filter((row) => row.cells.length >= 2).length >= 2
      ? splitUnlevelledStacks(withRows(table, outside))
      : [];
  });
  for (const item of ruled) {
    const replaced = (detected ?? []).filter((table) => replaces(item.table, table));
    const grid = withHeaderRowsAbove(
      item,
      replaced.flatMap((table) => table.rows),
    );
    tables.push(grid);
  }
  return tables.sort((a, b) => a.y - b.y || a.x - b.x);
}

function detectTextTables(lines: LayoutLine[], horizontalRules: readonly TableRule[]): LayoutTable[] | undefined {
  // Rows are grouped from the lines as built, then split into the cells a
  // widely spaced line joined, so the split never changes which row a line is in.
  const allRowGroups = groupLinesByTableRow(lines).map((row) => linesAsTableCells(row).sort((a, b) => a.x - b.x));
  const { tables: alignedTextTables, firstDataRows } = detectAlignedTextTables(allRowGroups);
  const sparseSingleRowTables = detectSparseSingleRowTables(allRowGroups);
  const candidateRows: IndexedLayoutRow[] = allRowGroups
    .map((row, index) => ({ row: tableCandidateRow(row), index }))
    .filter((item): item is IndexedLayoutRow => item.row !== undefined);
  const memberRows = admitPlaceholderRows(candidateRows, allRowGroups);
  const candidateIndexes = new Set(candidateRows.map(({ index }) => index));
  const tableRowIndexes = new Set(memberRows.map(({ index }) => index));
  const rowGroups: IndexedLayoutRow[] = foldCarriedLabelLines(
    memberRows.map(({ row, index }) => ({
      ...scanLabelContinuationRows(row, index, allRowGroups, { stopAtColumnHeader: true, tableRowIndexes }),
      index,
    })),
  );
  const finalize = (table: LayoutTable) => {
    const withGroupLabels = insertTableGroupLabelRows(table, allRowGroups, horizontalRules);
    const firstDetected = withGroupLabels.rows.findIndex((row) => firstDataRows.has(row));
    const joined = joinWrappedHeaderRows(
      withGroupLabels,
      firstDetected >= 0 ? firstDetected : undefined,
      headerRowsEnd(withGroupLabels.rows),
    );
    const firstDataRow = joined.rows.findIndex((row) => firstDataRows.has(row));
    return splitJoinedHeaderCells(
      assignTableColumns(joined, firstDataRow >= 0 ? firstDataRow : undefined, headerRowsEnd(joined.rows)),
      lines,
    );
  };
  if (rowGroups.length < 2) {
    const fallback = [...alignedTextTables, ...sparseSingleRowTables].map(finalize);
    return fallback.length > 0 ? fallback : undefined;
  }

  const tables: IndexedLayoutRow[][] = [];
  for (const row of rowGroups) {
    const prevTable = tables.at(-1);
    const prevRow = prevTable?.at(-1);
    if (prevRow && rowY(row.row) - rowBottom(prevRow.row) <= TABLE_GROUP_MAX_ROW_GAP_PT) {
      prevTable?.push(row);
    } else {
      tables.push([row]);
    }
  }

  const result: LayoutTable[] = [];
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    const baseRows = table.map(({ row }) => row);
    if (baseRows.length < 2 || !hasTableCadence(table, candidateIndexes)) continue;
    if (isTwoColumnNumericOnlyTable(baseRows) && baseRows.length < TWO_COLUMN_NUMERIC_TABLE_MIN_ROWS) continue;
    const nextTableFirstIndex = tables[index + 1]?.[0]?.index ?? allRowGroups.length;
    const rows = attachNumericContinuationRows(table, allRowGroups, nextTableFirstIndex);
    const leadingRows = attachLeadingTableRows(rows, table[0]?.index ?? 0, allRowGroups);
    const header = table[0]?.header;
    const tableRows = leadingRows === rows && header ? [header, ...rows] : leadingRows;
    if (isLikelyTinyNumericVectorGrid(tableRows.flat())) continue;
    if (isLikelyTinyNumericChartFragment(tableRows.flat())) continue;
    if (isLikelySparseNumericLegendFragment(tableRows.flat())) continue;
    if (isLikelyMirroredChartAxisTable(tableRows.flat())) continue;
    result.push(toLayoutTable(splitHeadingRows(tableRows)));
  }
  // Rows the aligned pass found past a table's end are added once every
  // table has its header rows, so they can tell another table's header apart.
  const trailingFrom: { index: number; aligned: LayoutTable }[] = [];
  for (const table of alignedTextTables) {
    // Overlapping mostly, or ending on a body row of it: the same table.
    const lastRow = table.rows.at(-1);
    const existingIndex = result.findIndex(
      (existing) =>
        overlapOfSmaller(existing, table) >= 0.5 || (lastRow !== undefined && isInnerRow(existing, lastRow)),
    );
    if (existingIndex < 0) result.push(table);
    else {
      result[existingIndex] = withHeaderRowsFrom(result[existingIndex], table);
      trailingFrom.push({ index: existingIndex, aligned: table });
    }
  }
  for (const table of sparseSingleRowTables) {
    // A header stack that starts among the body rows of a table already
    // found is that table's rows read again. One whose data row is a body
    // row of it, or that mostly overlaps it, only adds the header rows above
    // it — unless it is a split header the merge below can use (short, and
    // holding that table's first row).
    const [firstRow] = table.rows;
    const dataRow = table.rows.at(-1);
    if (firstRow && result.some((existing) => isInnerRow(existing, firstRow))) continue;
    const existingIndex = result.findIndex(
      (existing) =>
        (dataRow !== undefined && isInnerRow(existing, dataRow) && !isSplitHeaderOf(table, existing)) ||
        overlapOfSmaller(existing, table) >= 0.5,
    );
    if (existingIndex < 0) result.push(table);
    else result[existingIndex] = withHeaderRowsFrom(result[existingIndex], table);
  }
  for (const { index, aligned } of trailingFrom) {
    const others = [...result.filter((_, i) => i !== index), ...alignedTextTables.filter((t) => t !== aligned)];
    result[index] = withTrailingRowsFrom(result[index], aligned, others);
  }
  const merged = mergeSplitHeaderTables(result).map(finalize);
  return merged.length > 0 ? merged : undefined;
}

// Placeholder rows fill the gaps of the row pitch but carry no numbers, so
// the rows also pass on the numbered rows alone, as before they were admitted.
function hasTableCadence(table: IndexedLayoutRow[], candidateIndexes: ReadonlySet<number>): boolean {
  if (hasRegularTableRowCadence(table.map(({ row }) => row))) return true;
  const numbered = table.filter(({ index }) => candidateIndexes.has(index)).map(({ row }) => row);
  return numbered.length < table.length && hasRegularTableRowCadence(numbered);
}

function isTwoColumnNumericOnlyTable(rows: LayoutLine[][]): boolean {
  return rows.every((row) => {
    const normalized = normalizeTableCurrencyCells(row);
    return normalized.length === 2 && normalized.every((cell) => isTableNumericCell(cell.text));
  });
}

function toLayoutTable(rows: LayoutLine[][]): LayoutTable {
  const cells = rows.flat();
  const box = unionBox(cells);
  const normalizedRows = rows.map(normalizeTableCurrencyCells);
  return {
    ...box,
    rowCount: rows.length,
    columnCount: Math.max(...normalizedRows.map((row) => row.length)),
    rows: normalizedRows.map((row, index) => {
      const tableRow: LayoutTableRow = {
        y: round2(rowY(rows[index])),
        height: round2(rowBottom(rows[index]) - rowY(rows[index])),
        cells: row.map((cell) => ({
          text: cell.text,
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
        })),
      };
      if (isHeaderRowAboveGap(rows[index])) markHeaderRow(tableRow);
      return tableRow;
    }),
  };
}

/**
 * Also returns each table's first candidate row, so column assignment knows
 * where the attached header rows end: the candidate rows only need a digit
 * somewhere, so their cell text cannot tell a header from the body.
 */
function detectAlignedTextTables(allRowGroups: LayoutLine[][]): {
  tables: LayoutTable[];
  firstDataRows: Set<LayoutTableRow>;
} {
  const candidateRows: IndexedLayoutRow[] = allRowGroups
    .map((row, index) => ({ row: alignedTextTableCandidateRow(row), index }))
    .filter((item): item is IndexedLayoutRow => item.row !== undefined);
  const groups = groupRowsWithBridges(
    candidateRows,
    allRowGroups,
    ALIGNED_TEXT_TABLE_MAX_ROW_GAP_PT,
    ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT,
  );

  const tables: LayoutTable[] = [];
  const firstDataRows = new Set<LayoutTableRow>();
  for (const group of groups) {
    const baseRows = group.candidates;
    if (isLikelyTinyNumericVectorGrid(baseRows.flat())) continue;
    if (isLikelyTinyNumericChartFragment(baseRows.flat())) continue;
    if (isLikelySparseNumericLegendFragment(baseRows.flat())) continue;
    if (isLikelyMirroredChartAxisTable(baseRows.flat())) continue;
    if (!isAlignedTextTableGroup(baseRows)) continue;
    const rows = attachAlignedTextHeaderRows(group.rows, allRowGroups);
    if (isLikelyTinyNumericChartFragment(rows.flat())) continue;
    if (isLikelySparseNumericLegendFragment(rows.flat())) continue;
    if (isLikelyMirroredChartAxisTable(rows.flat())) continue;
    const table = toLayoutTable(rows);
    firstDataRows.add(table.rows[rows.length - group.rows.length]);
    tables.push(table);
  }
  return { tables, firstDataRows };
}

function alignedTextTableCandidateRow(row: LayoutLine[]): LayoutLine[] | undefined {
  if (row.length < ALIGNED_TEXT_TABLE_MIN_CELLS) return undefined;
  if (row.some((line) => line.width > ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT)) return undefined;
  if (!row.some((line) => /\p{N}/u.test(line.text))) return undefined;
  if (row.filter((line) => /[\p{L}\p{N}]/u.test(line.text)).length < ALIGNED_TEXT_TABLE_MIN_CELLS) {
    return undefined;
  }
  return row;
}

function isAlignedTextTableGroup(rows: LayoutLine[][]): boolean {
  if (rows.length < ALIGNED_TEXT_TABLE_MIN_ROWS) return false;
  if (!hasRegularTableRowCadence(rows)) return false;
  if (rows.filter(hasTextLabelCell).length < Math.ceil(rows.length * ALIGNED_TEXT_TABLE_MIN_LABEL_ROW_RATIO)) {
    return false;
  }
  const recurringColumns = recurringColumnBins(rows).filter(
    (count) => count >= Math.max(3, Math.ceil(rows.length * 0.35)),
  );
  return recurringColumns.length >= ALIGNED_TEXT_TABLE_MIN_RECURRING_COLUMNS;
}

function hasTextLabelCell(row: LayoutLine[]): boolean {
  return row.some((line) => !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text));
}

function attachAlignedTextHeaderRows(group: IndexedLayoutRow[], allRows: LayoutLine[][]): LayoutLine[][] {
  const rows = group.map(({ row }) => row);
  const firstIndex = group[0]?.index ?? 0;
  const bodyBox = unionBox(rows.flat());
  const headers: LayoutLine[][] = [];
  let gapRow: LayoutLine[] | undefined;

  for (let index = firstIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    const nextRow = headers[0] ?? rows[0];
    if (!candidate || !nextRow) break;
    // A row level with the header but entirely beside the table (a chart
    // axis next to it) is not above the table; look past it.
    if (
      rowY(nextRow) - rowBottom(candidate) <= ALIGNED_TEXT_TABLE_HEADER_MAX_GAP_PT &&
      isBesideBox(candidate, bodyBox)
    ) {
      continue;
    }
    if (isAlignedTextTableHeaderRow(candidate, bodyBox, nextRow)) {
      headers.unshift(candidate);
      continue;
    }
    // A single line under the header row: a wrapped header cell's second
    // line, or a group label set between the header and the rows (see
    // attachLeadingTableRows); only with the header row above it.
    const header = allRows[index - 1];
    if (
      candidate.length !== 1 ||
      !isHeaderGapLine(candidate[0]) ||
      !isAlignedTextTableHeaderRow(candidate, bodyBox, nextRow, 1) ||
      !header ||
      !isAlignedTextTableHeaderRow(header, bodyBox, candidate) ||
      !isHeaderTextRow(header)
    ) {
      break;
    }
    headers.unshift(candidate);
    gapRow = candidate;
  }

  if (gapRow) markHeaderRowsAbove(headers, gapRow);
  return [...headers, ...rows];
}

function isAlignedTextTableHeaderRow(
  row: LayoutLine[] | undefined,
  tableBox: BBox,
  nextRow: LayoutLine[] | undefined,
  minCells = 2,
): boolean {
  if (!row || !nextRow) return false;
  if (row.length < minCells) return false;
  if (row.some((line) => line.width > ALIGNED_TEXT_TABLE_MAX_CELL_WIDTH_PT)) return false;
  if (row.some((line) => !/[\p{L}\p{N}()（）]/u.test(line.text))) return false;
  if (rowY(nextRow) - rowBottom(row) > ALIGNED_TEXT_TABLE_HEADER_MAX_GAP_PT) return false;

  const rowBox = unionBox(row);
  const overlap = Math.min(rowBox.x + rowBox.width, tableBox.x + tableBox.width) - Math.max(rowBox.x, tableBox.x);
  return overlap >= Math.min(rowBox.width, tableBox.width) * 0.35;
}

function isBesideBox(row: LayoutLine[], box: BBox): boolean {
  const rowBox = unionBox(row);
  return rowBox.x >= box.x + box.width || rowBox.x + rowBox.width <= box.x;
}

function recurringColumnBins(rows: LayoutLine[][]): number[] {
  const bins: number[] = [];
  for (const line of rows.flat()) {
    const index = bins.findIndex((x) => Math.abs(x - line.x) <= ALIGNED_TEXT_TABLE_COLUMN_TOLERANCE_PT);
    if (index === -1) {
      bins.push(line.x);
    }
  }

  return bins.map((bin) => {
    let count = 0;
    for (const row of rows) {
      if (row.some((line) => Math.abs(line.x - bin) <= ALIGNED_TEXT_TABLE_COLUMN_TOLERANCE_PT)) count++;
    }
    return count;
  });
}

/**
 * The same table found by the aligned-text or the single-row pass can carry
 * header rows above the one found from its numeric rows (a units line such
 * as `(単位:億円)` or `百万円 | %` that the numeric pass does not take as a
 * header); keep them.
 */
function withHeaderRowsFrom(table: LayoutTable, other: LayoutTable): LayoutTable {
  if (other.y >= table.y) return table;
  // Only the run of multi-cell rows right above the table: a single line
  // there (a title, a caption, an address) ends the header.
  const header: LayoutTableRow[] = [];
  let next = table.rows[0];
  const above = other.rows.filter((row) => next && row.y + row.height / 2 < next.y).reverse();
  for (const [index, row] of above.entries()) {
    if (!next || header.length >= BORROWED_HEADER_MAX_ROWS) break;
    if (next.y - (row.y + row.height) > BORROWED_HEADER_MAX_GAP_PT) break;
    // One single-cell row under the header (a group label, a units line)
    // is taken with the header above it, not instead of one.
    const over = above[index + 1];
    if (
      row.cells.length < 2 &&
      (header.some((taken) => taken.cells.length < 2) ||
        !over ||
        over.cells.length < 2 ||
        over.cells.filter((cell) => isTableValueCell(cell.text)).length * 2 >= over.cells.length ||
        row.y - (over.y + over.height) > BORROWED_HEADER_MAX_GAP_PT)
    ) {
      break;
    }
    header.unshift(row);
    next = row;
  }
  const gap = header.find((row) => row.cells.length < 2);
  if (gap && header[0] !== gap) markHeaderRowsAbove(header, gap);
  // Never end on the single-cell row: it came only with a header above it.
  if (header[0] && header[0].cells.length < 2) header.shift();
  if (header.length === 0) return table;
  const rows = [...header, ...table.rows];
  const box = unionBox(rows.flatMap((row) => row.cells));
  return { ...table, ...box, rowCount: rows.length, rows };
}

/**
 * Ruled grids that are pieces of one table found from its text: several
 * grids inside it, the later ones opening on data rather than a header of
 * their own (rules drawn around groups of rows, not around tables). The
 * text table reads them as one; grids that each open on their own header
 * are separate tables stacked closely, and stay.
 */
function withoutFragmentGrids(ruled: RuledTable[], detected: readonly LayoutTable[]): RuledTable[] {
  const fragments = new Set<RuledTable>();
  for (const table of detected) {
    const inside = ruled
      .filter(({ table: grid }) => overlapOfSmaller(grid, table) >= RULED_TABLE_REPLACE_OVERLAP)
      .sort((a, b) => a.table.y - b.table.y);
    if (inside.length < 2) continue;
    // Grids only side by side are separate tables, whatever the text detector joined.
    const stacked = inside.some(({ table: grid }) =>
      inside.some(({ table: other }) => other !== grid && isStackedOver(grid, other)),
    );
    if (!stacked) continue;
    const opensOnData = inside.slice(1).filter(({ table: grid }) => startsWithValues(grid));
    if (opensOnData.length * 2 >= inside.length - 1) for (const grid of inside) fragments.add(grid);
  }
  return ruled.filter((grid) => !fragments.has(grid));
}

/**
 * Ruled grids drawn around only some columns of a table found from its
 * text (rules under the right-hand columns of a statement): values of
 * that table's rows sit beside the grid, so the grid is not the table.
 */
function withoutPartialGrids(ruled: RuledTable[], detected: readonly LayoutTable[]): RuledTable[] {
  const inOtherGrid = (cell: LayoutTableCell, grid: LayoutTable) =>
    ruled.some(({ table: other }) => other !== grid && isCellInside(cell, other));
  return ruled.filter(({ table: grid }) =>
    detected.every((table) => {
      if (overlapOfSmaller(grid, table) < RULED_TABLE_REPLACE_OVERLAP) return true;
      return !table.rows.some((row) => {
        if (!isRowInside(row, grid)) return false;
        return row.cells.some((cell) => {
          const center = cell.x + cell.width / 2;
          return (
            isTableValueCell(cell.text) && (center < grid.x || center > grid.x + grid.width) && !inOtherGrid(cell, grid)
          );
        });
      });
    }),
  );
}

function isCellInside(cell: BBox, box: BBox): boolean {
  const x = cell.x + cell.width / 2;
  const y = cell.y + cell.height / 2;
  return x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height;
}

function isStackedOver(a: BBox, b: BBox): boolean {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return overlap >= Math.min(a.width, b.width) * 0.5;
}

function startsWithValues(table: LayoutTable): boolean {
  return table.rows[0]?.cells.some((cell) => isTableValueCell(cell.text)) ?? false;
}

function isRowInside(row: LayoutTableRow, box: BBox): boolean {
  const center = row.y + row.height / 2;
  return center > box.y && center < box.y + box.height;
}

function withRows(table: LayoutTable, rows: LayoutTableRow[]): LayoutTable {
  const box = unionBox(rows.flatMap((row) => row.cells));
  return { ...table, ...box, rowCount: rows.length, rows };
}

/**
 * The aligned-text pass bridges sparse rows of the grid (a group heading, a
 * row whose values are still words), so it can run past the last row the
 * numeric pass kept for the same table. Those rows are the table's too.
 */
function withTrailingRowsFrom(table: LayoutTable, other: LayoutTable, tables: readonly LayoutTable[]): LayoutTable {
  const last = table.rows.at(-1);
  if (!last) return table;
  const lastBottom = last.y + last.height;
  // An aligned table that reaches into another table read the two as one;
  // its rows past this table are that table's header or body, not ours,
  // and so is a row that lies in another table the aligned pass found.
  if (tables.some((existing) => existing.y + existing.height > lastBottom && existing.y < other.y + other.height)) {
    return table;
  }
  const below = other.rows.filter((row) => row.y + row.height / 2 > lastBottom);
  const stop = below.findIndex((row) => {
    const center = row.y + row.height / 2;
    return tables.some((existing) => center >= existing.y && center <= existing.y + existing.height);
  });
  const trailing = stop < 0 ? below : below.slice(0, stop);
  if (trailing.length === 0) return table;
  const rows = [...table.rows, ...trailing];
  const box = unionBox(rows.flatMap((row) => row.cells));
  return {
    ...table,
    ...box,
    rowCount: rows.length,
    columnCount: Math.max(table.columnCount, ...trailing.map((row) => row.cells.length)),
    rows,
  };
}

function isSplitHeaderOf(stack: LayoutTable, table: LayoutTable): boolean {
  const first = table.rows[0];
  const text = (row: LayoutTableRow) => row.cells.map((cell) => cell.text).join(' ');
  return (
    first !== undefined &&
    stack.rows.length <= SPLIT_HEADER_MAX_ROWS &&
    stack.rows.some((row) => text(row) === text(first))
  );
}

function isInnerRow(table: LayoutTable, row: LayoutTableRow): boolean {
  const center = row.y + row.height / 2;
  const first = table.rows[0];
  if (!first || center <= first.y + first.height || center >= table.y + table.height) return false;
  const left = Math.min(...row.cells.map((cell) => cell.x));
  const right = Math.max(...row.cells.map((cell) => cell.x + cell.width));
  return left < table.x + table.width && right > table.x;
}

function overlapOfSmaller(a: BBox, b: BBox): number {
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? overlapArea(a, b) / smaller : 0;
}

function overlapArea(a: BBox, b: BBox): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

function area(box: BBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}
