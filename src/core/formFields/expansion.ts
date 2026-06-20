import type { FormField, FormFieldLabel } from '../../types/index.js';
import {
  CHOICE_STACKED_LABEL_MAX_CHARS,
  SIDE_LABEL_CONTINUATION_MAX_CHARS,
  STACKED_LABEL_MAX_CHARS,
} from './constants.js';
import { type BoxLike, round2, unionBox } from './geometry.js';
import {
  collectConnectedLeftPromptLines,
  collectSameLineMarkerPromptStack,
  collectSideLabelContinuationLines,
  collectStackedLabelLines,
  collectTrailingPromptStack,
} from './stacks.js';
import {
  isChoiceLikeField,
  isCompactFieldMarker,
  isDotLeaderText,
  isTrailingPromptFragment,
  isUsableLabelText,
  normalizePromptLabelText,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

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

export function expandSameLineMarkerPromptLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (field.type !== 'text') return undefined;
  if (!isCompactFieldMarker(candidate.text)) return undefined;
  if (candidate.relation === 'above' || candidate.relation === 'below') {
    return expandVerticalMarkerPromptLabel(field, candidate, lines);
  }
  if (candidate.relation !== 'left') return undefined;

  const sameLinePrompt = collectConnectedLeftPromptLines(candidate.line, lines);
  if (sameLinePrompt.length === 0) return undefined;

  const stackedPrompt = collectSameLineMarkerPromptStack(candidate.text, sameLinePrompt, lines);
  const promptLines = [...stackedPrompt, ...sameLinePrompt, { line: candidate.line, text: candidate.text }];
  const textParts = promptLines
    .map(({ text }) => normalizePromptLabelText(text))
    .filter((text) => text.length > 0 && !isDotLeaderText(text));
  const text = normalizePromptLabelText(textParts.join(' '));
  if (!isUsableLabelText(text, STACKED_LABEL_MAX_CHARS) || text === candidate.text) return undefined;

  const boxLines = promptLines
    .filter(({ text }) => !isDotLeaderText(text))
    .map(({ line }) => line)
    .sort((a, b) => a.y - b.y || a.x - b.x);
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

function expandVerticalMarkerPromptLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  const sameRowPrompt = collectSameRowMarkerPromptLines(candidate, lines);
  if (sameRowPrompt.length === 0) return undefined;

  const promptCandidate: LabelCandidate = {
    ...candidate,
    line: sameRowPrompt[0].line,
    text: sameRowPrompt[0].text,
  };
  const promptLines = collectStackedLabelLines(field, promptCandidate, lines);
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

function collectSameRowMarkerPromptLines(
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const marker = normalizePromptLabelText(candidate.text);
  const markerCenterY = candidate.line.y + candidate.line.height / 2;
  const sameRow = lines
    .filter((line) => line !== candidate.line)
    .filter((line) => Math.abs(line.y + line.height / 2 - markerCenterY) <= Math.max(4, candidate.line.height))
    .map((line) => ({ line, text: markerPromptText(marker, normalizePromptLabelText(line.text)) }))
    .filter((item): item is { line: LabelLine; text: string } => item.text !== undefined)
    .sort((a, b) => b.line.width - a.line.width);
  return sameRow.slice(0, 1);
}

function markerPromptText(marker: string, text: string): string | undefined {
  if (text.length <= marker.length) return undefined;
  if (text.startsWith(`${marker} `)) return text;
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seeMatch = text.match(new RegExp(`^See\\s+${escaped}\\s+(.+)`, 'iu'));
  return seeMatch ? `${marker} ${seeMatch[1]}` : undefined;
}

export function expandSideLabelContinuation(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (candidate.relation !== 'left') return undefined;
  if (field.type !== 'checkbox' && field.type !== 'radio' && field.type !== 'button') return undefined;

  const continuation = collectSideLabelContinuationLines(field, candidate, lines);
  if (continuation.length === 0) return undefined;

  const promptLines = [...continuation, { line: candidate.line, text: candidate.text }];
  const text = normalizePromptLabelText(promptLines.map(({ text }) => text).join(' '));
  if (!isUsableLabelText(text, SIDE_LABEL_CONTINUATION_MAX_CHARS) || text === candidate.text) return undefined;

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
