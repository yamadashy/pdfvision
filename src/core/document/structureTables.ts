import type {
  PageStructureItem,
  PageStructureNode,
  PageStructureTable,
  PageStructureTableCell,
  PageStructureTableRow,
} from '../../types/index.js';

type TableSection = 'head' | 'body' | 'foot' | 'bare';

interface StructureRow {
  node: PageStructureNode;
  section: TableSection;
}

export function buildStructureTables(
  structure: PageStructureNode | null,
  markedContentText: ReadonlyMap<string, string>,
): PageStructureTable[] {
  if (!structure) return [];
  const tables: PageStructureTable[] = [];
  walkNodes(structure, (node) => {
    if (node.role === 'Table') tables.push(buildTable(node, markedContentText));
  });
  return tables;
}

function walkNodes(node: PageStructureNode, visit: (node: PageStructureNode) => void): void {
  visit(node);
  for (const child of node.children) {
    if ('role' in child) walkNodes(child, visit);
  }
}

function buildTable(table: PageStructureNode, markedContentText: ReadonlyMap<string, string>): PageStructureTable {
  const sourceRows = tableRows(table);
  const firstBareRowIsColumnHeader =
    sourceRows[0]?.section === 'bare' &&
    sourceRows[0].node.children.length > 0 &&
    sourceRows[0].node.children.every((child) => 'role' in child && child.role === 'TH');
  const rows = sourceRows.map(({ node, section }, rowIndex): PageStructureTableRow => {
    const cells = node.children
      .filter((child): child is PageStructureNode => 'role' in child && (child.role === 'TH' || child.role === 'TD'))
      .map((cell): PageStructureTableCell => {
        const header =
          cell.role === 'TH'
            ? section === 'head' ||
              section === 'foot' ||
              (section === 'bare' && rowIndex === 0 && firstBareRowIsColumnHeader)
              ? 'column'
              : 'row'
            : undefined;
        return {
          text: structureCellText(cell, markedContentText),
          ...(header !== undefined && { header }),
        };
      });
    return { cells };
  });
  return { rows };
}

function tableRows(table: PageStructureNode): StructureRow[] {
  const rows: StructureRow[] = [];
  for (const child of table.children) {
    if (!('role' in child)) continue;
    if (child.role === 'TR') {
      rows.push({ node: child, section: 'bare' });
      continue;
    }
    const section = tableSection(child.role);
    if (!section) continue;
    for (const row of child.children) {
      if ('role' in row && row.role === 'TR') rows.push({ node: row, section });
    }
  }
  return rows;
}

function tableSection(role: string): Exclude<TableSection, 'bare'> | undefined {
  if (role === 'THead') return 'head';
  if (role === 'TBody') return 'body';
  if (role === 'TFoot') return 'foot';
  return undefined;
}

function structureCellText(cell: PageStructureNode, markedContentText: ReadonlyMap<string, string>): string {
  const segments: string[] = [];
  let looseChunks: string[] = [];
  const flushLooseChunks = () => {
    const text = joinChunks(looseChunks);
    if (text) segments.push(text);
    looseChunks = [];
  };
  const walk = (item: PageStructureItem) => {
    if (!('role' in item)) {
      const text = markedContentText.get(item.id);
      if (text) looseChunks.push(text);
      return;
    }
    if (item.role === 'P') {
      flushLooseChunks();
      const text = flattenStructureText(item, markedContentText);
      if (text) segments.push(text);
      return;
    }
    if (item.role === 'Table') {
      const text = flattenStructureText(item, markedContentText);
      if (text) looseChunks.push(text);
      return;
    }
    for (const child of item.children) walk(child);
  };

  for (const child of cell.children) walk(child);
  flushLooseChunks();
  return segments.join('<br>');
}

function flattenStructureText(item: PageStructureItem, markedContentText: ReadonlyMap<string, string>): string {
  if (!('role' in item)) return markedContentText.get(item.id) ?? '';
  return joinChunks(item.children.map((child) => flattenStructureText(child, markedContentText)));
}

function joinChunks(chunks: readonly string[]): string {
  return chunks.filter((chunk) => chunk.length > 0).join(' ');
}
