import type { FormField, FormFieldLabelRelation } from '../../types/index.js';
import {
  ABOVE_LABEL_MAX_GAP_PT,
  BELOW_LABEL_MAX_GAP_PT,
  INLINE_TEXT_FIELD_MAX_HEIGHT_PT,
  INLINE_TEXT_FIELD_MAX_WIDTH_PT,
  MIN_HORIZONTAL_OVERLAP_RATIO,
  NARROW_SEMANTIC_ABOVE_LABEL_PENALTY,
  SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT,
  SAME_LINE_TEXT_PROMPT_MAX_GAP_PT,
  SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_TOLERANCE_PT,
  SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_WEIGHT,
  SHORT_VERTICAL_LABEL_FIELD_COVERAGE,
  SIDE_LABEL_MAX_GAP_PT,
  TALL_TEXT_FIELD_SIDE_LABEL_MAX_GAP_PT,
  VERTICAL_LABEL_EDGE_TOLERANCE_PT,
  WIDE_ROW_HEADER_LABEL_GAP_WEIGHT,
  WIDE_ROW_HEADER_LABEL_MAX_GAP_PT,
  WIDE_VERTICAL_LABEL_FIELD_COVERAGE,
} from './constants.js';
import { centerX, centerY, horizontalOverlapRatio, horizontalOverlapWidth, makeLabel } from './geometry.js';
import {
  hasSemanticFieldNameMatch,
  isLikelyWrappedContinuationText,
  isTrailingPromptFragment,
  isWideRowHeaderLabelText,
  lengthPenalty,
  normalizePromptLabelText,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

/** Penalty per sibling widget a side-relation label line runs across.
 *  IRS 1040 packs several checkbox options on one row ("[cb] Filed
 *  pursuant to section 301.9100-2  [cb] Combat zone"); the layout pass
 *  merges that row into one line, which would otherwise out-score the
 *  per-option span and hand the first checkbox both options' text. */
const WIDGET_CROSSING_PENALTY = 40;

export function widgetCrossingPenalty(
  field: FormField,
  candidate: LabelCandidate,
  siblings: readonly FormField[],
): number {
  const line = candidate.line;
  let crossings = 0;
  for (const sibling of siblings) {
    if (sibling === field) continue;
    const siblingCenterX = sibling.x + sibling.width / 2;
    if (siblingCenterX <= line.x || siblingCenterX >= line.x + line.width) continue;
    if (candidate.relation === 'left' || candidate.relation === 'right') {
      const verticalOverlap = Math.min(line.y + line.height, sibling.y + sibling.height) - Math.max(line.y, sibling.y);
      if (verticalOverlap < Math.min(line.height, sibling.height) * 0.5) continue;
    } else {
      if (candidate.relation === 'above' && sibling.y >= field.y + field.height - 1) continue;
      if (candidate.relation === 'below' && sibling.y + sibling.height <= field.y + 1) continue;
      const gap =
        candidate.relation === 'above' ? sibling.y - (line.y + line.height) : line.y - (sibling.y + sibling.height);
      const maxGap = candidate.relation === 'above' ? ABOVE_LABEL_MAX_GAP_PT : BELOW_LABEL_MAX_GAP_PT;
      if (gap < -2 || gap > maxGap) continue;
    }
    crossings++;
  }
  return crossings * WIDGET_CROSSING_PENALTY;
}

export function scoreLabelCandidate(field: FormField, line: LabelLine, text: string): LabelCandidate | undefined {
  const sidePreferred = field.type === 'checkbox' || field.type === 'radio' || field.type === 'button';
  const inlineTextField =
    field.type === 'text' &&
    field.width <= INLINE_TEXT_FIELD_MAX_WIDTH_PT &&
    field.height <= INLINE_TEXT_FIELD_MAX_HEIGHT_PT;
  const candidates = [
    sideLabelCandidate(field, line, text, 'right', sidePreferred ? 0 : 28),
    sideLabelCandidate(field, line, text, 'left', sidePreferred ? 12 : 18, 1.4),
    verticalLabelCandidate(field, line, text, 'above', sidePreferred ? 70 : inlineTextField ? 45 : 0),
    verticalLabelCandidate(field, line, text, 'below', 95),
  ].filter((candidate): candidate is LabelCandidate => candidate !== undefined);

  return candidates.sort((a, b) => a.score - b.score)[0];
}

function sideLabelCandidate(
  field: FormField,
  line: LabelLine,
  text: string,
  relation: Extract<FormFieldLabelRelation, 'left' | 'right'>,
  baseScore: number,
  gapWeight = 1.4,
): LabelCandidate | undefined {
  const fieldRight = field.x + field.width;
  const lineRight = line.x + line.width;
  const gap = relation === 'right' ? line.x - fieldRight : field.x - lineRight;
  const wideRowHeader = relation === 'left' && isWideRowHeaderLabelText(text);
  const tallTextFieldLeftLabel = relation === 'left' && field.type === 'text' && field.height >= 30;
  const maxGap = wideRowHeader
    ? WIDE_ROW_HEADER_LABEL_MAX_GAP_PT
    : tallTextFieldLeftLabel
      ? TALL_TEXT_FIELD_SIDE_LABEL_MAX_GAP_PT
      : SIDE_LABEL_MAX_GAP_PT;
  if (gap < -2 || gap > maxGap) return undefined;
  const centerDelta = Math.abs(centerY(field) - centerY(line));
  const maxCenterDelta = Math.max(7, Math.max(field.height, line.height) * 0.9);
  if (centerDelta > maxCenterDelta) return undefined;
  const inlineTextField =
    field.type === 'text' &&
    field.width <= INLINE_TEXT_FIELD_MAX_WIDTH_PT &&
    field.height <= INLINE_TEXT_FIELD_MAX_HEIGHT_PT;
  const sameRowTextCandidate =
    field.type === 'text' &&
    relation === 'left' &&
    centerDelta <= Math.max(4, field.height * 0.35) &&
    (line.fontSize ?? SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT) <= SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT;
  const sameRowTextPrompt =
    sameRowTextCandidate &&
    (inlineTextField || isTrailingPromptFragment(text) || gap <= SAME_LINE_TEXT_PROMPT_MAX_GAP_PT);
  const scoreBase = sameRowTextPrompt || wideRowHeader ? Math.min(baseScore, 0) : baseScore;
  const scoreGapWeight = wideRowHeader
    ? Math.min(gapWeight, WIDE_ROW_HEADER_LABEL_GAP_WEIGHT)
    : sameRowTextPrompt
      ? Math.min(gapWeight, 0.45)
      : gapWeight;
  const wrappedChoiceContinuationPenalty =
    field.type !== 'text' &&
    relation === 'left' &&
    gap > SAME_LINE_TEXT_PROMPT_MAX_GAP_PT &&
    isLikelyWrappedContinuationText(text)
      ? 80
      : 0;
  const labelText = sameRowTextPrompt ? normalizePromptLabelText(text) : text;

  return {
    label: makeLabel(line, labelText, relation),
    line,
    text: labelText,
    relation,
    score:
      scoreBase +
      Math.max(0, gap) * scoreGapWeight +
      centerDelta * 2 +
      lengthPenalty(labelText) +
      wrappedChoiceContinuationPenalty,
  };
}

function verticalLabelCandidate(
  field: FormField,
  line: LabelLine,
  text: string,
  relation: Extract<FormFieldLabelRelation, 'above' | 'below'>,
  baseScore: number,
): LabelCandidate | undefined {
  const lineBottom = line.y + line.height;
  const fieldBottom = field.y + field.height;
  const gap = relation === 'above' ? field.y - lineBottom : line.y - fieldBottom;
  const maxGap = relation === 'above' ? ABOVE_LABEL_MAX_GAP_PT : BELOW_LABEL_MAX_GAP_PT;
  if (gap < -3 || gap > maxGap) return undefined;

  const overlap = horizontalOverlapRatio(field, line);
  const fieldCoverage = horizontalOverlapWidth(field, line) / Math.max(1, field.width);
  const centerDelta = Math.abs(centerX(field) - centerX(line));
  const lineRight = line.x + line.width;
  const fieldRight = field.x + field.width;
  const edgeAligned =
    Math.abs(line.x - field.x) <= VERTICAL_LABEL_EDGE_TOLERANCE_PT ||
    Math.abs(lineRight - fieldRight) <= VERTICAL_LABEL_EDGE_TOLERANCE_PT;
  const closeSemanticAboveLabel =
    relation === 'above' && gap <= SAME_LINE_TEXT_PROMPT_MAX_GAP_PT && hasSemanticFieldNameMatch(field, text);
  if (fieldCoverage < SHORT_VERTICAL_LABEL_FIELD_COVERAGE && !edgeAligned && !closeSemanticAboveLabel) {
    return undefined;
  }

  const nearEdge =
    line.x <= field.x + field.width + 8 &&
    line.x + line.width >= field.x - 8 &&
    centerDelta <= Math.max(field.width, 1);
  if (
    overlap < MIN_HORIZONTAL_OVERLAP_RATIO &&
    fieldCoverage < MIN_HORIZONTAL_OVERLAP_RATIO &&
    !nearEdge &&
    !closeSemanticAboveLabel
  ) {
    return undefined;
  }
  const alignment = Math.max(fieldCoverage, overlap);

  return {
    label: makeLabel(line, text, relation),
    line,
    text,
    relation,
    score:
      baseScore +
      Math.max(0, gap) * 2 +
      (1 - alignment) * 32 +
      centerDelta * 0.04 +
      (fieldCoverage >= WIDE_VERTICAL_LABEL_FIELD_COVERAGE ? 0 : lengthPenalty(text)) +
      (closeSemanticAboveLabel && fieldCoverage < SHORT_VERTICAL_LABEL_FIELD_COVERAGE
        ? NARROW_SEMANTIC_ABOVE_LABEL_PENALTY
        : 0) +
      (closeSemanticAboveLabel
        ? Math.max(0, field.x - line.x - SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_TOLERANCE_PT) *
          SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_WEIGHT
        : 0),
  };
}
