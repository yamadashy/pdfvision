import type { LayoutLine } from '../../types/index.js';
import { mode, round2, unionBox } from './geometry.js';

const DECORATIVE_DOTTED_RULE_MIN_DOTS = 8;
const TABLE_ROW_TOP_ALIGNMENT_RATIO = 0.5;
const TABLE_ROW_VERTICAL_OVERLAP_RATIO = 0.35;

export function groupLinesByTableRow(lines: LayoutLine[]): LayoutLine[][] {
  const rows: LayoutLine[][] = [];
  const tableLines = lines.filter((line) => !isDecorativeDottedRuleLine(line));
  for (const line of [...tableLines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => canShareTableRow(line, candidate[0]));
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

export function rowY(row: LayoutLine[]): number {
  return Math.min(...row.map((line) => line.y));
}

export function rowBottom(row: LayoutLine[]): number {
  return Math.max(...row.map((line) => line.y + line.height));
}

export function mergeLineTexts(lines: LayoutLine[]): LayoutLine {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  const box = unionBox(sorted);
  return {
    text: sorted.map((line) => line.text).join(' '),
    ...box,
    fontSize: round2(mode(sorted.map((line) => line.fontSize))),
  };
}

function canShareTableRow(a: LayoutLine, b: LayoutLine): boolean {
  const minHeight = Math.max(Math.min(a.height, b.height), 1);
  if (Math.abs(a.y - b.y) < minHeight * TABLE_ROW_TOP_ALIGNMENT_RATIO) return true;
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= minHeight * TABLE_ROW_VERTICAL_OVERLAP_RATIO;
}

function isDecorativeDottedRuleLine(line: LayoutLine): boolean {
  const compact = line.text.replace(/\s+/g, '');
  if (compact.length < DECORATIVE_DOTTED_RULE_MIN_DOTS) return false;
  return /^[.\u00b7\u2022\u2027\u2219]+$/u.test(compact);
}
