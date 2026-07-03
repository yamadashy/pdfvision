import type { PageResult } from '../../types/index.js';
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
      const cells = Array.from({ length: columnCount }, (_, columnIndex) =>
        escapeTableCell(row.cells[columnIndex]?.text ?? ''),
      );
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }
}

function tableColumnCount(table: LayoutTables[number]): number {
  return Math.max(1, table.columnCount, ...table.rows.map((row) => row.cells.length));
}
