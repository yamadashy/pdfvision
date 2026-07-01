import type { FormField } from '../../types/index.js';
import { round2 } from './geometry.js';
import { isUsableLabelText, normalizePromptLabelText } from './text.js';
import type { LabelLine } from './types.js';

const DOT_LEADER_FIELD_EDGE_GAP_PT = 2;

export function trimDotLeaderLabelLine(field: FormField, line: LabelLine, text: string): LabelLine | undefined {
  if (field.type !== 'text') return undefined;
  if (!sameVisualRow(field, line)) return undefined;
  if (line.x >= field.x) return undefined;
  if (line.x + line.width <= field.x + DOT_LEADER_FIELD_EDGE_GAP_PT) return undefined;

  const trimmed = trimTrailingDotLeaders(text);
  if (!trimmed || !isUsableLabelText(trimmed)) return undefined;

  const width = field.x - line.x - DOT_LEADER_FIELD_EDGE_GAP_PT;
  if (width <= 4) return undefined;

  return {
    ...line,
    text: trimmed,
    width: round2(width),
  };
}

function trimTrailingDotLeaders(text: string): string | undefined {
  const withoutLeaders = text.replace(/(?:\s*\.\s*){2,}\s*$/u, '');
  if (withoutLeaders === text) return undefined;
  return normalizePromptLabelText(withoutLeaders);
}

function sameVisualRow(a: Pick<LabelLine, 'y' | 'height'>, b: Pick<LabelLine, 'y' | 'height'>): boolean {
  return Math.abs(verticalCenter(a) - verticalCenter(b)) <= Math.max(5, Math.max(a.height, b.height) * 0.8);
}

function verticalCenter(box: Pick<LabelLine, 'y' | 'height'>): number {
  return box.y + box.height / 2;
}
