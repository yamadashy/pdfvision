import type { PageStructureItem, PageStructureNode } from '../../types/index.js';
import { escapeInline, formatBbox } from './helpers.js';

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
