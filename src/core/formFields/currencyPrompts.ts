import type { FormField, FormFieldLabel } from '../../types/index.js';
import { type BoxLike, round2, unionBox } from './geometry.js';
import { isCompactFieldMarker, isUsableLabelText, normalizePromptLabelText } from './text.js';
import type { LabelLine } from './types.js';

const CURRENCY_PROMPT_MAX_MARKER_GAP_PT = 14;
const CURRENCY_PROMPT_MAX_PROMPT_GAP_PT = 140;
const CURRENCY_PROMPT_MARKER_PREFIX_MAX_GAP_PT = 24;

export function findCurrencyAnchoredPromptLabel(
  field: FormField,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (field.type !== 'text') return undefined;

  const marker = nearestCurrencyMarker(field, lines);
  if (!marker) return undefined;

  const prompt = nearestCurrencyPromptLine(marker, lines);
  if (!prompt) return undefined;

  const prefix = nearestPromptMarkerPrefix(prompt, lines);
  const labelLines = prefix ? [prefix, prompt] : [prompt];
  const text = normalizePromptLabelText(labelLines.map((line) => line.text).join(' '));
  if (!isUsableLabelText(text)) return undefined;

  const box = labelLines.slice(1).reduce<BoxLike>((acc, line) => unionBox(acc, line), labelLines[0] ?? prompt);
  return {
    text,
    relation: 'left',
    x: round2(box.x),
    y: round2(box.y),
    width: round2(box.width),
    height: round2(box.height),
  };
}

function nearestCurrencyMarker(field: FormField, lines: readonly LabelLine[]): LabelLine | undefined {
  let best: { line: LabelLine; gap: number } | undefined;
  for (const line of lines) {
    if (!isCurrencyMarker(line.text)) continue;
    const gap = field.x - (line.x + line.width);
    if (gap < -1 || gap > CURRENCY_PROMPT_MAX_MARKER_GAP_PT) continue;
    if (!sameVisualRow(field, line)) continue;
    if (!best || gap < best.gap) best = { line, gap };
  }
  return best?.line;
}

function nearestCurrencyPromptLine(marker: LabelLine, lines: readonly LabelLine[]): LabelLine | undefined {
  let best: { line: LabelLine; gap: number } | undefined;
  for (const line of lines) {
    if (line === marker || line.x + line.width > marker.x - 1) continue;
    if (!sameVisualRow(marker, line)) continue;
    const text = normalizePromptLabelText(line.text);
    if (!isUsableLabelText(text) || isCurrencyMarker(text) || isCompactFieldMarker(text)) continue;

    const gap = marker.x - (line.x + line.width);
    if (gap < -2 || gap > CURRENCY_PROMPT_MAX_PROMPT_GAP_PT) continue;
    if (!best || gap < best.gap) best = { line, gap };
  }
  return best?.line;
}

function nearestPromptMarkerPrefix(prompt: LabelLine, lines: readonly LabelLine[]): LabelLine | undefined {
  let best: { line: LabelLine; gap: number } | undefined;
  for (const line of lines) {
    if (line === prompt || !isCompactFieldMarker(line.text)) continue;
    if (!sameVisualRow(prompt, line)) continue;
    const gap = prompt.x - (line.x + line.width);
    if (gap < -2 || gap > CURRENCY_PROMPT_MARKER_PREFIX_MAX_GAP_PT) continue;
    if (!best || gap < best.gap) best = { line, gap };
  }
  return best?.line;
}

function sameVisualRow(a: Pick<LabelLine, 'y' | 'height'>, b: Pick<LabelLine, 'y' | 'height'>): boolean {
  return Math.abs(verticalCenter(a) - verticalCenter(b)) <= Math.max(5, Math.max(a.height, b.height) * 0.6);
}

function verticalCenter(box: Pick<LabelLine, 'y' | 'height'>): number {
  return box.y + box.height / 2;
}

function isCurrencyMarker(text: string): boolean {
  return /^[$¥€£]$/u.test(text.trim());
}
