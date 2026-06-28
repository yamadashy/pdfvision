import type { LayoutLine, LayoutTable } from '../../types/index.js';
import { type BBox, round2, unionBox } from './geometry.js';
import { isLikelyTinyNumericChartFragment } from './numericVectorGrid.js';
import { tableCandidateRow } from './tableCandidateRows.js';
import { isTableNumericCell, normalizeTableCurrencyCells } from './tableCells.js';
import { attachLabelContinuationRows } from './tableContinuations.js';
import { mergeLineTexts, rowBottom, rowY } from './tableRows.js';

const SPARSE_TABLE_MIN_NUMERIC_CELLS = 3;
const SPARSE_TABLE_MIN_HEADER_ROWS = 3;
const SPARSE_TABLE_MAX_HEADER_SCAN_ROWS = 20;
const SPARSE_TABLE_HEADER_MAX_GAP_PT = 18;
const SPARSE_TABLE_LABEL_CONTINUATION_MAX_GAP_PT = 18;

export function detectSparseSingleRowTables(allRows: LayoutLine[][]): LayoutTable[] {
  const tables: LayoutTable[] = [];

  for (let index = 0; index < allRows.length; index++) {
    const candidate = tableCandidateRow(allRows[index] ?? []);
    if (!candidate || !isSparseSingleDataRow(candidate)) continue;

    const bodyRow = attachSparseLabelContinuationRows(
      attachLabelContinuationRows(candidate, index, allRows),
      index,
      allRows,
    );
    const label = bodyRow.find(isTextLabelCell);
    if (!label) continue;

    const headerRows = collectSparseTableHeaderRows(allRows, index, bodyRow, label);
    if (!isSparseHeaderStack(headerRows, bodyRow, label)) continue;

    const rows = [...headerRows, bodyRow];
    if (isLikelyTinyNumericChartFragment(rows.flat())) continue;

    tables.push(toSparseLayoutTable(rows));
  }

  return tables;
}

function isSparseSingleDataRow(row: LayoutLine[]): boolean {
  if (row.length < SPARSE_TABLE_MIN_NUMERIC_CELLS + 1) return false;
  if (!row.some(isTextLabelCell)) return false;
  return row.filter((line) => isTableNumericCell(line.text)).length >= SPARSE_TABLE_MIN_NUMERIC_CELLS;
}

function attachSparseLabelContinuationRows(row: LayoutLine[], rowIndex: number, allRows: LayoutLine[][]): LayoutLine[] {
  const label = row.find(isTextLabelCell);
  if (!label) return row;

  const continuations: LayoutLine[] = [];
  let nextTop = rowY(row);
  for (let index = rowIndex - 1; index >= 0; index--) {
    const candidate = allRows[index];
    if (!candidate || !isBodyLabelContinuationRow(candidate, label, nextTop)) break;
    const continuation = mergeLineTexts(candidate);
    if (!label.text.includes(continuation.text)) continuations.unshift(continuation);
    nextTop = rowY(candidate);
  }
  if (continuations.length === 0) return row;

  const mergedLabel = mergeLineTexts([...continuations, label]);
  return row.map((line) => (line === label ? mergedLabel : line));
}

function collectSparseTableHeaderRows(
  allRows: LayoutLine[][],
  bodyIndex: number,
  bodyRow: LayoutLine[],
  bodyLabel: LayoutLine,
): LayoutLine[][] {
  const headers: LayoutLine[][] = [];
  let nextTop = rowY(bodyRow);

  for (let index = bodyIndex - 1; index >= 0 && bodyIndex - index <= SPARSE_TABLE_MAX_HEADER_SCAN_ROWS; index--) {
    const row = allRows[index];
    if (!row || row.length === 0) break;
    if (isBodyLabelContinuationRow(row, bodyLabel, nextTop)) {
      nextTop = rowY(row);
      continue;
    }
    if (isSectionHeadingRow(row)) break;

    const gap = nextTop - rowBottom(row);
    if (gap < -4 || gap > SPARSE_TABLE_HEADER_MAX_GAP_PT) break;
    if (!isSparseHeaderRow(row, bodyRow)) break;

    headers.unshift(row);
    nextTop = rowY(row);
  }

  return headers;
}

function isSparseHeaderStack(rows: LayoutLine[][], bodyRow: LayoutLine[], bodyLabel: LayoutLine): boolean {
  if (rows.length < SPARSE_TABLE_MIN_HEADER_ROWS) return false;
  const bodyNumericCells = bodyRow.filter((line) => isTableNumericCell(line.text));
  const numericHeaderMatches = bodyNumericCells.filter((cell) =>
    rows.some((row) => row.some((line) => horizontallyRelated(line, cell))),
  ).length;
  if (numericHeaderMatches < Math.min(2, bodyNumericCells.length)) return false;
  return rows.some((row) =>
    row.some((line) => line.x > bodyLabel.x + bodyLabel.width + 20 && /[\p{L}]/u.test(line.text)),
  );
}

function isSparseHeaderRow(row: LayoutLine[], bodyRow: LayoutLine[]): boolean {
  if (!row.some((line) => /[\p{L}\p{N}]/u.test(line.text))) return false;
  const rowBox = unionBox(row);
  const bodyBox = unionBox(bodyRow);
  const overlap = Math.min(rowBox.x + rowBox.width, bodyBox.x + bodyBox.width) - Math.max(rowBox.x, bodyBox.x);
  if (overlap >= Math.min(rowBox.width, bodyBox.width) * 0.15) return true;
  return row.some((line) => bodyRow.some((bodyCell) => horizontallyRelated(line, bodyCell)));
}

function isBodyLabelContinuationRow(row: LayoutLine[], label: LayoutLine, nextTop: number): boolean {
  if (row.length !== 1) return false;
  const line = row[0];
  if (!line || !/[\p{L}]/u.test(line.text)) return false;
  if (Math.abs(line.x - label.x) > Math.max(12, label.fontSize * 2)) return false;
  const gap = nextTop - (line.y + line.height);
  return gap >= -Math.max(12, line.height * 0.75) && gap <= SPARSE_TABLE_LABEL_CONTINUATION_MAX_GAP_PT;
}

function isSectionHeadingRow(row: LayoutLine[]): boolean {
  if (row.length !== 1) return false;
  return /^\d+\.\s+\p{Lu}/u.test(row[0]?.text.trim() ?? '');
}

function isTextLabelCell(line: LayoutLine): boolean {
  return !isTableNumericCell(line.text) && /[\p{L}]/u.test(line.text);
}

function horizontallyRelated(a: BBox, b: BBox): boolean {
  const aCenter = a.x + a.width / 2;
  const bCenter = b.x + b.width / 2;
  if (Math.abs(aCenter - bCenter) <= Math.max(a.width, b.width, 18)) return true;
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return overlap >= Math.min(a.width, b.width) * 0.25;
}

function toSparseLayoutTable(rows: LayoutLine[][]): LayoutTable {
  const cells = rows.flat();
  const box = unionBox(cells);
  const normalizedRows = rows.map(normalizeTableCurrencyCells);
  return {
    ...box,
    rowCount: rows.length,
    columnCount: Math.max(...normalizedRows.map((row) => row.length)),
    rows: normalizedRows.map((row, index) => ({
      y: round2(rowY(rows[index])),
      height: round2(rowBottom(rows[index]) - rowY(rows[index])),
      cells: row.map((cell) => ({
        text: cell.text,
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      })),
    })),
  };
}
