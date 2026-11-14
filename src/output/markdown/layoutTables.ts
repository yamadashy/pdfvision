import type { LayoutTableRow, PageResult } from '../../types/index.js';
import { escapeTableCell, formatBox } from './helpers.js';

type LayoutTables = NonNullable<NonNullable<PageResult['layout']>['tables']>;

export function appendLayoutTables(lines: string[], tables: LayoutTables): void {
  if (tables.length === 0) return;

  lines.push('');
  lines.push('### Layout tables');

  for (const [index, table] of tables.entries()) {
    const columnCount = tableColumnCount(table);
    lines.push('');
    lines.push(`#### Table ${index + 1} (${table.rowCount} rows × ${columnCount} columns, bbox ${formatBox(table)})`);
    lines.push('');
    lines.push(`| ${Array.from({ length: columnCount }, (_, columnIndex) => `C${columnIndex + 1}`).join(' | ')} |`);
    lines.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
    for (const row of table.rows) {
      lines.push(`| ${rowSlots(row, columnCount).map(escapeTableCell).join(' | ')} |`);
    }
  }
}

/**
 * One slot per column. A cell goes in its `column`, so an empty column stays
 * empty instead of pulling the next value left; a spanning cell sits in the
 * first column it covers. Cells that share a column (a header and its
 * footnote marker) are joined. Rows without column data fall back to
 * left-to-right order.
 */
function rowSlots(row: LayoutTableRow, columnCount: number): string[] {
  const slots = Array.from({ length: columnCount }, () => '');
  for (const [index, cell] of row.cells.entries()) {
    const column = Math.min(cell.column ?? index, columnCount - 1);
    slots[column] = slots[column] ? `${slots[column]} ${cell.text}` : cell.text;
  }
  return slots;
}

function tableColumnCount(table: LayoutTables[number]): number {
  if (table.rows.every((row) => row.cells.every((cell) => cell.column !== undefined))) {
    return Math.max(1, table.columnCount);
  }
  return Math.max(1, table.columnCount, ...table.rows.map((row) => row.cells.length));
}
