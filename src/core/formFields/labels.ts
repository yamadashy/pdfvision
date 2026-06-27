import type { FormField, FormFieldLabel } from '../../types/index.js';
import {
  expandChoiceSideStackedLabel,
  expandLeftTrailingPromptStack,
  expandSameLineMarkerPromptLabel,
  expandSideLabelContinuation,
  expandStackedLabel,
} from './expansion.js';
import { overlapRatio } from './geometry.js';
import { scoreLabelCandidate, widgetCrossingPenalty } from './scoring.js';
import { isFormLabelChromeText, isSemanticFieldNameMismatch, isUsableLabelText, normalizeLabelText } from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

export type { LabelLine } from './types.js';

export function findFieldLabel(
  field: FormField,
  lines: readonly LabelLine[],
  siblings: readonly FormField[] = [],
): FormFieldLabel | undefined {
  if (lines.length === 0) return undefined;
  let best: LabelCandidate | undefined;
  for (const line of lines) {
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text)) continue;
    if (isFormLabelChromeText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    if (isSemanticFieldNameMismatch(field, text)) continue;
    const candidate = scoreLabelCandidate(field, line, text);
    if (!candidate) continue;
    candidate.score += widgetCrossingPenalty(field, candidate, siblings);
    if (!best || candidate.score < best.score) best = candidate;
  }
  if (!best) return undefined;
  return (
    expandSameLineMarkerPromptLabel(field, best, lines) ??
    expandLeftTrailingPromptStack(field, best, lines) ??
    expandChoiceSideStackedLabel(field, best, lines, siblings) ??
    expandSideLabelContinuation(field, best, lines, siblings) ??
    expandStackedLabel(field, best, lines)
  );
}
