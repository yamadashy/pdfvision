import type { LayoutMarkedText } from '../../types/index.js';
import { escapeTableCell, formatBox } from './helpers.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const CHOSEN = new Set<LayoutMarkedText['mark']>(['checked', 'selected']);

/** Passages and choices marked only by painted geometry, with where they are. */
export function appendMarkedText(lines: string[], marked: readonly LayoutMarkedText[]): void {
  const passages = marked.filter((item) => item.mark === 'side_line');
  const choices = marked.filter((item) => item.mark !== 'side_line');
  appendSideLines(lines, passages);
  appendChoices(lines, choices);
}

/** A 新旧対照表's side-lined passages. */
function appendSideLines(lines: string[], marked: readonly LayoutMarkedText[]): void {
  if (marked.length === 0) return;
  lines.push('');
  lines.push('### Marked text');
  lines.push('');
  lines.push('_Passages marked only by a drawn line beside them; the text above carries no marker._');
  lines.push('');
  lines.push('| Mark | Text | BBox |');
  lines.push('| --- | --- | --- |');
  for (const item of marked) {
    lines.push(`| side line | ${escapeTableCell(item.text)} | ${formatBox(item)} |`);
  }
}

/** Drawn answers, one row per row of boxes on the page: what is marked and what is left empty. */
function appendChoices(lines: string[], choices: readonly LayoutMarkedText[]): void {
  if (choices.length === 0) return;
  const rows: Array<{ group: string; items: LayoutMarkedText[] }> = [];
  for (const item of choices) {
    const group = item.group ?? '';
    const last = rows[rows.length - 1];
    if (last && last.group === group && Math.abs(last.items[0].y - item.y) <= item.height) last.items.push(item);
    else rows.push({ group, items: [item] });
  }
  lines.push('');
  lines.push('### Choice marks');
  lines.push('');
  lines.push(
    '_Options answered only by a drawn tick, cross or dot in a box or circle; the text above lists every option without saying which is chosen._',
  );
  lines.push('');
  lines.push('| Row | Marked | Not marked | BBox |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of rows) {
    const chosen = row.items.filter((item) => CHOSEN.has(item.mark)).map((item) => item.text);
    const open = row.items.filter((item) => !CHOSEN.has(item.mark)).map((item) => item.text);
    const x = Math.min(...row.items.map((item) => item.x));
    const y = Math.min(...row.items.map((item) => item.y));
    const right = Math.max(...row.items.map((item) => item.x + item.width));
    const bottom = Math.max(...row.items.map((item) => item.y + item.height));
    lines.push(
      `| ${escapeTableCell(row.group)} | ${escapeTableCell(chosen.join(' / '))} | ${escapeTableCell(open.join(' / '))} | ${formatBox({ x, y, width: round2(right - x), height: round2(bottom - y) })} |`,
    );
  }
}
