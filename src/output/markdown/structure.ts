import type { PageStructureItem, PageStructureNode, PageStructureTable } from '../../types/index.js';
import { escapeInline, escapeTableCell, formatBbox } from './helpers.js';

export function structureNodeCount(structure: PageStructureNode | null | undefined): number {
  if (!structure) return 0;
  return (
    1 +
    structure.children.reduce((sum, child) => {
      return 'role' in child ? sum + structureNodeCount(child) : sum;
    }, 0)
  );
}

function structureLabel(item: PageStructureItem): string {
  if (!('role' in item)) return `${escapeInline(item.type)} ${escapeInline(item.id)}`;
  const parts = [escapeInline(item.role)];
  if (item.lang) parts.push(`lang=${escapeInline(item.lang)}`);
  if (item.bbox) parts.push(`bbox=${formatBbox(item.bbox)}`);
  if (item.alt) parts.push(`alt=${escapeInline(item.alt)}`);
  if (item.mathML) parts.push(`mathML=${escapeInline(item.mathML)}`);
  return parts.join(' · ');
}

export function appendStructureItem(lines: string[], item: PageStructureItem, depth = 0): void {
  lines.push(`${'  '.repeat(depth)}- ${structureLabel(item)}`);
  if ('role' in item) {
    for (const child of item.children) appendStructureItem(lines, child, depth + 1);
  }
}

export function appendStructureTables(lines: string[], tables: readonly PageStructureTable[]): void {
  for (const [index, table] of tables.entries()) {
    const columnCount = Math.max(1, ...table.rows.map((row) => row.cells.length));
    const headerRowIndex = table.rows.findIndex((row) => row.cells.some((cell) => cell.header === 'column'));
    const headers =
      headerRowIndex >= 0
        ? table.rows[headerRowIndex].cells
        : Array.from({ length: columnCount }, (_, columnIndex) => ({ text: `C${columnIndex + 1}` }));

    lines.push('');
    lines.push(`#### Tagged table ${index + 1}`);
    lines.push('');
    lines.push(markdownTableRow(headers, columnCount));
    lines.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
    for (const [rowIndex, row] of table.rows.entries()) {
      if (rowIndex === headerRowIndex) continue;
      lines.push(markdownTableRow(row.cells, columnCount));
    }
  }
}

function markdownTableRow(cells: readonly { text: string }[], columnCount: number): string {
  const values = Array.from({ length: columnCount }, (_, columnIndex) =>
    escapeTableCell(cells[columnIndex]?.text ?? ''),
  );
  return `| ${values.join(' | ')} |`;
}
