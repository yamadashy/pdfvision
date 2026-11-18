import type { LayoutMarkedText } from '../../types/index.js';
import { escapeTableCell, formatBox } from './helpers.js';

const MARK_LABEL: Record<LayoutMarkedText['mark'], string> = {
  side_line: 'side line',
};

/** Passages marked only by painted geometry (a 新旧対照表's side lines), with where they are. */
export function appendMarkedText(lines: string[], marked: readonly LayoutMarkedText[]): void {
  if (marked.length === 0) return;
  lines.push('');
  lines.push('### Marked text');
  lines.push('');
  lines.push('_Passages marked only by a drawn line beside them; the text above carries no marker._');
  lines.push('');
  lines.push('| Mark | Text | BBox |');
  lines.push('| --- | --- | --- |');
  for (const item of marked) {
    lines.push(`| ${MARK_LABEL[item.mark]} | ${escapeTableCell(item.text)} | ${formatBox(item)} |`);
  }
}
