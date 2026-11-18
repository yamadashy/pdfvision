import type { LayoutLine, LayoutTable, LayoutTableCell, LayoutTableRow } from '../../types/index.js';
import { unionBox } from './geometry.js';
import { lineParts, linesAsTableCells } from './lineSegments.js';
import { isTableValueCell } from './tableCells.js';
import { mergeLineTexts } from './tableRows.js';

/** A gap between two header labels, in em: wider than any word space. */
const LABEL_GAP_MIN_EM = 0.6;

interface ColumnExtent {
  left: number;
  right: number;
}

/**
 * Split header cells that line building joined across a gap narrower than
 * a column gutter (`Plan start  Plan end`, `Price  Energy / 100 km`) back
 * into one cell per column. A header cell is split only where the text
 * runs it was joined from fall over different body columns, with a gap
 * wider than a word space between them, and no run reaching into the
 * neighbouring column: a group header set as one run (`Three Months
 * Ended`) or a phrase whose words are separate runs keeps its columns.
 */
export function splitJoinedHeaderCells(table: LayoutTable, lines: readonly LayoutLine[]): LayoutTable {
  const firstBody = table.rows.findIndex(
    (row) => row.cells.length >= 2 && row.cells.some((cell) => isTableValueCell(cell.text)),
  );
  if (firstBody <= 0) return table;
  const extents = columnExtents(table.rows.slice(firstBody));
  if (extents.size < 2) return table;
  const sources = new Map(linesAsTableCells(lines).map((line) => [sourceKey(line), line]));
  let changed = false;
  const rows = table.rows.map((row, index): LayoutTableRow => {
    if (index >= firstBody) return row;
    const cells = row.cells.flatMap((cell) => {
      const split = splitCell(cell, sources.get(sourceKey(cell)), extents);
      if (split.length > 1) changed = true;
      return split;
    });
    return { ...row, cells };
  });
  return changed ? { ...table, rows } : table;
}

function splitCell(
  cell: LayoutTableCell,
  source: LayoutLine | undefined,
  extents: ReadonlyMap<number, ColumnExtent>,
): LayoutTableCell[] {
  const span = cell.columnSpan ?? 1;
  if (!source || cell.column === undefined) return [cell];
  const parts = lineParts(source);
  if (parts.length < 2) return [cell];
  const first = cell.column;
  // The body columns under the line, which placement may have cut short
  // where a neighbouring cell of the row already held a column.
  const columns = [...extents.keys()]
    .filter((column) => (column >= first && column < first + span) || overlaps(source, extents.get(column)))
    .sort((a, b) => a - b);
  if (columns.length < 2) return [cell];

  const groups: { column: number; parts: LayoutLine[] }[] = [];
  for (const part of [...parts].sort((a, b) => a.x - b.x)) {
    const overlapped = columns.filter((column) => overlaps(part, extents.get(column)));
    // A run reaching over two columns is a label set across them.
    if (overlapped.length > 1) return [cell];
    const column = overlapped[0] ?? nearestColumn(part, columns, extents);
    const last = groups.at(-1);
    if (last && last.column === column) last.parts.push(part);
    else if (last && last.column > column) return [cell];
    else groups.push({ column, parts: [part] });
  }
  if (groups.length < 2) return [cell];
  for (let index = 1; index < groups.length; index++) {
    const before = groups[index - 1].parts.at(-1);
    const after = groups[index].parts[0];
    if (!before || !after) return [cell];
    const fontSize = Math.max(before.fontSize, after.fontSize, 1);
    if (after.x - (before.x + before.width) < fontSize * LABEL_GAP_MIN_EM) return [cell];
  }
  return groups.map(({ column, parts: groupParts }, index) => {
    const merged = groupParts.length === 1 ? groupParts[0] : mergeLineTexts(groupParts);
    const nextColumn = groups[index + 1]?.column ?? Math.max(first + span, (columns.at(-1) ?? first) + 1);
    const box = unionBox(groupParts);
    return {
      text: merged.text,
      ...box,
      column,
      ...(nextColumn - column > 1 && index === groups.length - 1 && { columnSpan: nextColumn - column }),
    };
  });
}

function columnExtents(rows: readonly LayoutTableRow[]): Map<number, ColumnExtent> {
  const extents = new Map<number, ColumnExtent>();
  for (const cell of rows.flatMap((row) => row.cells)) {
    if (cell.column === undefined || (cell.columnSpan ?? 1) > 1) continue;
    const extent = extents.get(cell.column);
    const right = cell.x + cell.width;
    if (extent) {
      extent.left = Math.min(extent.left, cell.x);
      extent.right = Math.max(extent.right, right);
    } else {
      extents.set(cell.column, { left: cell.x, right });
    }
  }
  return extents;
}

function overlaps(part: LayoutLine, extent: ColumnExtent | undefined): boolean {
  return extent !== undefined && Math.min(part.x + part.width, extent.right) - Math.max(part.x, extent.left) > 0;
}

function nearestColumn(
  part: LayoutLine,
  columns: readonly number[],
  extents: ReadonlyMap<number, ColumnExtent>,
): number {
  const center = part.x + part.width / 2;
  const distance = (column: number) => {
    const extent = extents.get(column);
    return extent ? Math.max(extent.left - center, center - extent.right, 0) : Number.POSITIVE_INFINITY;
  };
  return columns.reduce((best, column) => (distance(column) < distance(best) ? column : best));
}

function sourceKey(box: { text: string; x: number; y: number; width: number }): string {
  return `${Math.round(box.x * 10)}|${Math.round(box.y * 10)}|${Math.round(box.width * 10)}|${box.text}`;
}
