import type { FormField, FormFieldLabel } from '../../types/index.js';
import { findCurrencyAnchoredPromptLabel } from './currencyPrompts.js';
import {
  expandChoiceSideStackedLabel,
  expandLeftTrailingPromptStack,
  expandSameLineMarkerPromptLabel,
  expandSideLabelContinuation,
  expandStackedLabel,
} from './expansion.js';
import { overlapRatio } from './geometry.js';
import { scoreLabelCandidate, widgetCrossingPenalty } from './scoring.js';
import {
  isCompactFieldMarker,
  isExplanatoryFormParagraphStart,
  isFormLabelChromeText,
  isSemanticFieldNameMismatch,
  isStandaloneInstructionReference,
  isUsableLabelText,
  normalizeLabelText,
} from './text.js';
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
    if (field.type === 'text' && isStandaloneInstructionReference(text)) continue;
    if (field.type === 'checkbox' && isExplanatoryFormParagraphStart(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    if (isSemanticFieldNameMismatch(field, text)) continue;
    const candidate = scoreLabelCandidate(field, line, text);
    if (!candidate) continue;
    if (isPreviousRowMarkerCandidate(field, line, text, candidate.relation, lines)) continue;
    candidate.score += widgetCrossingPenalty(field, candidate, siblings);
    if (!best || candidate.score < best.score) best = candidate;
  }
  const currencyPrompt = findCurrencyAnchoredPromptLabel(field, lines);
  if (currencyPrompt) return currencyPrompt;
  if (!best) return undefined;
  return (
    expandSameLineMarkerPromptLabel(field, best, lines) ??
    expandLeftTrailingPromptStack(field, best, lines) ??
    expandChoiceSideStackedLabel(field, best, lines, siblings) ??
    expandSideLabelContinuation(field, best, lines, siblings) ??
    expandStackedLabel(field, best, lines)
  );
}

function isPreviousRowMarkerCandidate(
  field: FormField,
  line: LabelLine,
  text: string,
  relation: LabelCandidate['relation'],
  lines: readonly LabelLine[],
): boolean {
  if (field.type !== 'text' || relation !== 'above' || !isCompactFieldMarker(text)) return false;
  const fieldCenterY = field.y + field.height / 2;
  for (const other of lines) {
    if (other === line) continue;
    const otherText = normalizeLabelText(other.text);
    if (!isCompactFieldMarker(otherText) || otherText === text) continue;
    if (other.x + other.width > field.x + 1) continue;
    if (field.x - (other.x + other.width) > 36) continue;
    const otherCenterY = other.y + other.height / 2;
    if (Math.abs(otherCenterY - fieldCenterY) <= Math.max(4, field.height * 0.8)) return true;
  }
  return false;
}
