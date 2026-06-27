import type { FormField, FormFieldLabel } from '../../types/index.js';
import { CHOICE_STACKED_LABEL_MAX_CHARS, STACKED_LABEL_MAX_CHARS } from './constants.js';
import { type BoxLike, round2, unionBox } from './geometry.js';
import { collectStackedLabelLines, collectTrailingPromptStack } from './stacks.js';
import { isChoiceLikeField, isTrailingPromptFragment, isUsableLabelText, normalizePromptLabelText } from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

export { expandSameLineMarkerPromptLabel } from './markerPrompts.js';
export { expandChoiceSideStackedLabel, expandSideLabelContinuation } from './sideLabels.js';

export function expandStackedLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel {
  if (candidate.relation !== 'above' && candidate.relation !== 'below') return candidate.label;

  const stack = collectStackedLabelLines(field, candidate, lines);
  if (stack.length <= 1) return candidate.label;

  const sorted = stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
  const labelBox = sorted.slice(1).reduce<BoxLike>((box, item) => unionBox(box, item.line), sorted[0].line);
  const rawText = sorted.map((item) => item.text).join(' ');
  const text = isChoiceLikeField(field) ? normalizePromptLabelText(rawText) : rawText;
  const maxChars =
    candidate.relation === 'above' && isChoiceLikeField(field)
      ? CHOICE_STACKED_LABEL_MAX_CHARS
      : STACKED_LABEL_MAX_CHARS;
  if (!isUsableLabelText(text, maxChars)) return candidate.label;

  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
}

export function expandLeftTrailingPromptStack(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (field.type !== 'text' || candidate.relation !== 'left') return undefined;
  if (!isTrailingPromptFragment(candidate.text)) return undefined;

  const stack = collectTrailingPromptStack(candidate.line, lines);
  if (stack.length === 0) return undefined;

  const promptLines = [...stack, { line: candidate.line, text: candidate.text }];
  const text = normalizePromptLabelText(promptLines.map(({ text }) => text).join(' '));
  if (!isUsableLabelText(text, STACKED_LABEL_MAX_CHARS) || text === candidate.text) return undefined;

  const boxLines = promptLines.map(({ line }) => line).sort((a, b) => a.y - b.y || a.x - b.x);
  const labelBox = boxLines.slice(1).reduce<BoxLike>((box, line) => unionBox(box, line), boxLines[0] ?? candidate.line);
  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
}
