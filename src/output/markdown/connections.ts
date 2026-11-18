import type { LayoutConnection } from '../../types/index.js';
import { formatBox } from './helpers.js';

/** Arrows between boxes of text, one per line: `A → B (label)`. */
export function appendConnections(lines: string[], connections: readonly LayoutConnection[]): void {
  if (connections.length === 0) return;
  lines.push('');
  lines.push('### Connections');
  lines.push('');
  lines.push('_Arrows drawn between boxes of text; the text above does not show them._');
  lines.push('');
  for (const item of connections) {
    const arrow = item.bidirectional ? '↔' : '→';
    const label = item.label !== undefined ? ` (${oneLine(item.label)})` : '';
    lines.push(`- ${oneLine(item.from)} ${arrow} ${oneLine(item.to)}${label} — bbox ${formatBox(item)}`);
  }
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}
