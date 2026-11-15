import type { LayoutLine } from '../../types/index.js';
import { firstTableLabelCell } from './tableCandidateRows.js';
import { isTableValueCell } from './tableCells.js';
import {
  medianNumber,
  recurringNumericColumnRights,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO,
  TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS,
} from './tableColumnStats.js';
import { rowY } from './tableRows.js';

const TABLE_ROW_CADENCE_MIN_MATCH_RATIO = 0.65;
const TABLE_ROW_CADENCE_TOLERANCE_RATIO = 0.25;
const TABLE_ROW_CADENCE_MIN_TOLERANCE_PT = 2;
// Statement labels indent one step per level; a few levels still share the column.
const TABLE_SHARED_LABEL_COLUMN_TOLERANCE_PT = 48;
const TABLE_SHARED_LABEL_COLUMN_MIN_ROW_RATIO = 0.8;

export function hasRegularTableRowCadence(rows: LayoutLine[][]): boolean {
  const gaps = rowGaps(rows, rowY);
  if (gaps.length < 2) return true;
  if (cadenceMatchRatio(gaps) >= TABLE_ROW_CADENCE_MIN_MATCH_RATIO) return true;
  // In a statement a label folded together from wrapped lines or a group
  // heading moves a row's top but not its values: there the value lines can
  // keep the pitch.
  if (hasSharedLabelColumn(rows) && cadenceMatchRatio(rowGaps(rows, valueLineY)) >= TABLE_ROW_CADENCE_MIN_MATCH_RATIO) {
    return true;
  }
  return hasRecurringNumericColumns(rows);
}

// Nearly every row starts with a text label, all in one column.
function hasSharedLabelColumn(rows: LayoutLine[][]): boolean {
  const lefts: number[] = [];
  for (const row of rows) {
    const first = row.reduce<LayoutLine | undefined>(
      (left, line) => (!left || line.x < left.x ? line : left),
      undefined,
    );
    if (first && firstTableLabelCell(row) === first) lefts.push(first.x);
  }
  if (lefts.length < rows.length * TABLE_SHARED_LABEL_COLUMN_MIN_ROW_RATIO) return false;
  return Math.max(...lefts) - Math.min(...lefts) <= TABLE_SHARED_LABEL_COLUMN_TOLERANCE_PT;
}

function valueLineY(row: LayoutLine[]): number {
  const values = row.filter((line) => isTableValueCell(line.text));
  return values.length > 0 ? rowY(values) : rowY(row);
}

function rowGaps(rows: LayoutLine[][], top: (row: LayoutLine[]) => number): number[] {
  const ys = rows.map(top).sort((a, b) => a - b);
  return ys
    .slice(1)
    .map((y, index) => y - ys[index])
    .filter((gap) => gap > 0.5);
}

function cadenceMatchRatio(gaps: number[]): number {
  if (gaps.length === 0) return 1;
  const median = medianNumber(gaps);
  const tolerance = Math.max(TABLE_ROW_CADENCE_MIN_TOLERANCE_PT, median * TABLE_ROW_CADENCE_TOLERANCE_RATIO);
  return gaps.filter((gap) => Math.abs(gap - median) <= tolerance).length / gaps.length;
}

function hasRecurringNumericColumns(rows: LayoutLine[][]): boolean {
  const minRows = Math.max(
    TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROWS,
    Math.ceil(rows.length * TABLE_RECURRING_NUMERIC_COLUMN_MIN_ROW_RATIO),
  );
  if (rows.filter(hasTableLabelCell).length < minRows) return false;
  return (
    recurringNumericColumnRights(rows, {
      minColumns: TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS,
      minRows,
    }).length >= TABLE_RECURRING_NUMERIC_COLUMN_MIN_COLUMNS
  );
}

function hasTableLabelCell(row: LayoutLine[]): boolean {
  return firstTableLabelCell(row) !== undefined;
}
