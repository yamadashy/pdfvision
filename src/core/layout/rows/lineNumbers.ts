import type { LayoutLine } from '../../../types/index.js';
import { ALIGN_TOLERANCE_PT } from './shared.js';

const MIN_LINE_NUMBERS = 5;
const MIN_STEP_SHARE = 0.8;

/**
 * Line numbers down a margin (a pleading, a manuscript under review): an
 * aligned column of consecutive integers that no other text on the page
 * reaches into. Each sits on a line's baseline, but it numbers the line
 * rather than being a cell of a row, so rows are read without it.
 */
export function marginLineNumbers(lines: readonly LayoutLine[]): Set<LayoutLine> {
  const numbers = lines.filter((line) => /^\d{1,4}$/u.test(line.text.trim()));
  const out = new Set<LayoutLine>();
  if (numbers.length < MIN_LINE_NUMBERS) return out;
  const edges: ((line: LayoutLine) => number)[] = [(line) => line.x, (line) => line.x + line.width];
  for (const edge of edges) {
    const byEdge = [...numbers].sort((a, b) => edge(a) - edge(b));
    let start = 0;
    for (let i = 1; i <= byEdge.length; i++) {
      if (i < byEdge.length && edge(byEdge[i]) - edge(byEdge[i - 1]) <= ALIGN_TOLERANCE_PT) continue;
      const column = byEdge.slice(start, i).sort((a, b) => a.y - b.y);
      start = i;
      if (column.length >= MIN_LINE_NUMBERS && isNumbering(column) && !isCrossed(column, lines)) {
        for (const line of column) out.add(line);
      }
    }
  }
  return out;
}

function isNumbering(column: readonly LayoutLine[]): boolean {
  let steps = 0;
  for (let i = 1; i < column.length; i++) {
    if (Number(column[i].text.trim()) === Number(column[i - 1].text.trim()) + 1) steps++;
  }
  return steps >= (column.length - 1) * MIN_STEP_SHARE;
}

function isCrossed(column: readonly LayoutLine[], lines: readonly LayoutLine[]): boolean {
  const left = Math.min(...column.map((line) => line.x));
  const right = Math.max(...column.map((line) => line.x + line.width));
  const members = new Set(column);
  return lines.some((line) => !members.has(line) && line.x < right && line.x + line.width > left);
}
