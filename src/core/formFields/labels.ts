import type { FormField, FormFieldLabel } from '../../types/index.js';
import { findCurrencyAnchoredPromptLabel } from './currencyPrompts.js';
import {
  expandChoiceSideStackedLabel,
  expandLeftTrailingPromptStack,
  expandSameLineMarkerPromptLabel,
  expandSideLabelContinuation,
  expandStackedLabel,
} from './expansion.js';
import { centerY, makeLabel, overlapRatio } from './geometry.js';
import { scoreLabelCandidate, widgetCrossingPenalty } from './scoring.js';
import {
  isBareLineNumberClusterText,
  isBareNumericFieldMarker,
  isChoiceLikeField,
  isCompactFieldMarker,
  isExplanatoryFormParagraphStart,
  isFormLabelChromeText,
  isSemanticFieldNameMismatch,
  isStandaloneInstructionReference,
  isUsableLabelText,
  normalizeLabelText,
  startsWithPromptItemMarker,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

export type { LabelLine } from './types.js';

const CHOICE_OPTION_LABEL_MAX_CHARS = 32;
const CHOICE_OPTION_LABEL_MAX_GAP_PT = 8;

export function findFieldLabel(
  field: FormField,
  lines: readonly LabelLine[],
  siblings: readonly FormField[] = [],
): FormFieldLabel | undefined {
  if (lines.length === 0) return undefined;
  const immediateChoiceLabel = findImmediateChoiceOptionLabel(field, lines, siblings);
  if (immediateChoiceLabel) return immediateChoiceLabel;
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
  if (isMarkerOnlyChoicePromptFallback(field, best, lines)) return undefined;
  return (
    expandSameLineMarkerPromptLabel(field, best, lines) ??
    expandLeftTrailingPromptStack(field, best, lines) ??
    expandChoiceSideStackedLabel(field, best, lines, siblings) ??
    expandSideLabelContinuation(field, best, lines, siblings) ??
    expandStackedLabel(field, best, lines)
  );
}

function findImmediateChoiceOptionLabel(
  field: FormField,
  lines: readonly LabelLine[],
  siblings: readonly FormField[],
): FormFieldLabel | undefined {
  if (!isChoiceLikeField(field)) return undefined;
  let best:
    | {
        line: LabelLine;
        text: string;
        relation: Extract<LabelCandidate['relation'], 'left' | 'right'>;
        score: number;
      }
    | undefined;
  const fieldRight = field.x + field.width;
  for (const line of lines) {
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text, CHOICE_OPTION_LABEL_MAX_CHARS)) continue;
    if (isFormLabelChromeText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    if (lineCrossesSiblingChoiceField(field, line, siblings)) continue;

    const lineRight = line.x + line.width;
    const centerDelta = Math.abs(centerY(field) - centerY(line));
    const maxCenterDelta = Math.max(7, Math.max(field.height, line.height) * 0.9);
    if (centerDelta > maxCenterDelta) continue;

    const rightGap = line.x - fieldRight;
    const leftGap = field.x - lineRight;
    const relation =
      rightGap >= -2 && rightGap <= CHOICE_OPTION_LABEL_MAX_GAP_PT
        ? 'right'
        : leftGap >= -2 && leftGap <= CHOICE_OPTION_LABEL_MAX_GAP_PT
          ? 'left'
          : undefined;
    if (!relation) continue;

    const gap = relation === 'right' ? rightGap : leftGap;
    if (
      (isBareNumericFieldMarker(text) || isBareLineNumberClusterText(text)) &&
      !isCloseNumericChoiceOptionLabel(text, relation, gap)
    ) {
      continue;
    }
    const score = (relation === 'right' ? 0 : 4) + Math.max(0, gap) * 2 + centerDelta - Math.min(text.length, 16) * 0.2;
    if (!best || score < best.score) best = { line, text, relation, score };
  }
  return best ? makeLabel(best.line, best.text, best.relation) : undefined;
}

function isCloseNumericChoiceOptionLabel(text: string, relation: LabelCandidate['relation'], gap: number): boolean {
  return relation === 'right' && gap >= -2 && gap <= CHOICE_OPTION_LABEL_MAX_GAP_PT && /^\d{3,}$/u.test(text);
}

function isMarkerOnlyChoicePromptFallback(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): boolean {
  if (!isChoiceLikeField(field)) return false;
  if (candidate.relation !== 'left') return false;
  if (field.x - (candidate.line.x + candidate.line.width) <= CHOICE_OPTION_LABEL_MAX_GAP_PT) return false;
  if (!startsWithPromptItemMarker(candidate.text)) return false;
  return hasImmediateLeftChoiceMarker(field, lines);
}

function hasImmediateLeftChoiceMarker(field: FormField, lines: readonly LabelLine[]): boolean {
  for (const line of lines) {
    const text = normalizeLabelText(line.text);
    if (!isOrdinalChoiceMarkerText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    const centerDelta = Math.abs(centerY(field) - centerY(line));
    const maxCenterDelta = Math.max(7, Math.max(field.height, line.height) * 0.9);
    if (centerDelta > maxCenterDelta) continue;
    const leftGap = field.x - (line.x + line.width);
    if (leftGap >= -2 && leftGap <= CHOICE_OPTION_LABEL_MAX_GAP_PT) return true;
  }
  return false;
}

function isOrdinalChoiceMarkerText(text: string): boolean {
  return /^\d{1,2}[a-z]?$/iu.test(text) || /^\([a-z]\)$/iu.test(text);
}

function lineCrossesSiblingChoiceField(field: FormField, line: LabelLine, siblings: readonly FormField[]): boolean {
  for (const sibling of siblings) {
    if (sibling === field || !isChoiceLikeField(sibling)) continue;
    const siblingCenterX = sibling.x + sibling.width / 2;
    if (siblingCenterX <= line.x || siblingCenterX >= line.x + line.width) continue;
    const verticalOverlap = Math.min(line.y + line.height, sibling.y + sibling.height) - Math.max(line.y, sibling.y);
    if (verticalOverlap >= Math.min(line.height, sibling.height) * 0.5) return true;
  }
  return false;
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
