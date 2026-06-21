import type { LayoutBlock } from '../../types/index.js';
import { horizontalOverlap } from './geometry.js';

export function isLooseLineContinuationPair(a: LayoutBlock, b: LayoutBlock): boolean {
  const [upper, lower] = a.y <= b.y ? [a, b] : [b, a];
  const upperLine = upper.lines.at(-1);
  const lowerLine = lower.lines[0];
  if (!upperLine || !lowerLine) return false;
  const baselineDelta = lowerLine.y - upperLine.y;
  if (baselineDelta <= 0 || baselineDelta > Math.max(upperLine.fontSize, lowerLine.fontSize) * 1.4) return false;
  if (lowerLine.y >= upperLine.y + upperLine.height) return false;
  const continuationIndent =
    lowerLine.x >= upperLine.x - 2 && lowerLine.x - upperLine.x <= Math.max(42, upperLine.fontSize * 4);
  if (!continuationIndent || !horizontalOverlap(upperLine, lowerLine)) return false;
  const inlineMathSlack = upperLine.height > upperLine.fontSize * 1.35 || lowerLine.height > lowerLine.fontSize * 1.35;
  return inlineMathSlack || /^[!•▲▶►▸]\s/u.test(upperLine.text.trim()) || /[-‐‑–]\s*$/u.test(upperLine.text.trim());
}
