import type { LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { round2, unionBox } from './geometry.js';
import { isTableValueCell } from './tableCells.js';
import { isHeaderRowAboveGap, markHeaderRow } from './tableLeadingRows.js';

/** A wrapped header cell's next line starts within this share of a line height below the line above it. */
const WRAP_MAX_GAP_RATIO = 0.6;
/** A wrapped header line may run a little wider than the line it continues (`Net` / `income`). */
const WRAP_MAX_WIDTH_RATIO = 1.5;
/** A wrapped header cell's line is a few words, not a line of running text. */
const WRAP_MAX_CHARS = 40;

/**
 * Join header rows that are the second lines of wrapped header cells
 * (`Release` / `date`, `当期首残高` / `(百万円)`) onto the row above, so each
 * column has one header cell. A row is a wrapped continuation only when
 * every one of its cells sits right under one cell of the row above and no
 * cell above has two under it: a group header over several sub-columns
 * (`Three Months Ended` over `2024 | 2023`) is two header levels and stays.
 * `firstDataRow` is where the detector's own rows begin, when it knows;
 * `headerEnd` where the rows it took as header end.
 */
export function joinWrappedHeaderRows(table: LayoutTable, firstDataRow?: number, headerEnd = 0): LayoutTable {
  const firstValueRow = table.rows.findIndex(
    (row) => row.cells.length >= 2 && row.cells.some((cell) => isTableValueCell(cell.text)),
  );
  if (firstValueRow < 0) return table;
  // As for column assignment: a detector whose rows need no value cell says
  // where its rows begin, and nothing from there on is a header.
  // Rows a detector took as header above a gap line are header whatever they hold.
  const firstBody = Math.max(Math.min(firstValueRow, firstDataRow ?? firstValueRow), headerEnd);
  if (firstBody < 2) return table;
  const rows: LayoutTableRow[] = [];
  let changed = false;
  for (const [index, row] of table.rows.entries()) {
    const upper = rows.at(-1);
    const joined = index < firstBody && upper ? joinedRow(upper, row) : undefined;
    if (joined) {
      if (upper && isHeaderRowAboveGap(upper)) markHeaderRow(joined);
      rows[rows.length - 1] = joined;
      changed = true;
    } else rows.push(row);
  }
  return changed ? { ...table, rowCount: rows.length, rows } : table;
}

function joinedRow(upper: LayoutTableRow, lower: LayoutTableRow): LayoutTableRow | undefined {
  // A header row has several cells; a lone line over a lone line is a title or prose.
  if (lower.cells.length === 0 || upper.cells.length < 2) return undefined;
  if (lower.cells.some((cell) => cell.text.length > WRAP_MAX_CHARS)) return undefined;
  const pairs = new Map<LayoutTableCell, LayoutTableCell>();
  for (const cell of lower.cells) {
    const above = cellAbove(upper, cell);
    if (!above || pairs.has(above)) return undefined;
    pairs.set(above, cell);
  }
  const cells = upper.cells.map((cell) => {
    const below = pairs.get(cell);
    return below ? joinedCell(cell, below) : cell;
  });
  const box = unionBox(cells);
  return { y: round2(box.y), height: round2(box.height), cells };
}

function cellAbove(upper: LayoutTableRow, cell: LayoutTableCell): LayoutTableCell | undefined {
  const over = upper.cells.filter(
    (other) => Math.min(other.x + other.width, cell.x + cell.width) - Math.max(other.x, cell.x) > 0,
  );
  if (over.length !== 1) return undefined;
  const [above] = over;
  const center = cell.x + cell.width / 2;
  if (center < above.x || center > above.x + above.width) return undefined;
  if (cell.width > above.width * WRAP_MAX_WIDTH_RATIO) return undefined;
  const gap = cell.y - (above.y + above.height);
  if (gap < -above.height / 2 || gap > above.height * WRAP_MAX_GAP_RATIO) return undefined;
  return above;
}

function joinedCell(above: LayoutTableCell, below: LayoutTableCell): LayoutTableCell {
  const box = unionBox([above, below]);
  return { ...above, text: `${above.text} ${below.text}`, ...box };
}
