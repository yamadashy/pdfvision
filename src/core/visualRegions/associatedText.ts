import type { VisualRegionAssociatedText } from '../../types/index.js';

export const MAX_ASSOCIATED_TEXT = 3;

export function associatedTextKey(text: VisualRegionAssociatedText): string {
  return `${text.relation}:${text.x}:${text.y}:${text.width}:${text.height}:${text.text}`;
}

export function mergeAssociatedText(items: readonly VisualRegionAssociatedText[]): VisualRegionAssociatedText[] {
  const seen = new Set<string>();
  const merged: VisualRegionAssociatedText[] = [];
  for (const item of items) {
    const key = associatedTextKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function normalizeAssociatedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
