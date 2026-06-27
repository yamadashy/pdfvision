import type { FormField, FormFieldLabel } from '../../types/index.js';
import { SIDE_LABEL_CONTINUATION_MAX_CHARS } from './constants.js';
import { type BoxLike, centerX, horizontalOverlapRatio, round2, unionBox } from './geometry.js';
import { collectSideLabelContinuationLines } from './stacks.js';
import {
  isChoiceLikeField,
  isDotLeaderText,
  isUsableLabelText,
  isUsablePromptFragment,
  normalizeLabelText,
  normalizePromptLabelText,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

const SIDE_LABEL_STACK_MAX_GAP_PT = 6;
const SIDE_LABEL_STACK_MAX_LINES = 3;
const SIDE_LABEL_STACK_CENTER_TOLERANCE_PT = 18;
const SIDE_LABEL_STACK_MIN_OVERLAP_RATIO = 0.3;

export function expandChoiceSideStackedLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (!isChoiceLikeField(field)) return undefined;
  if (candidate.relation !== 'left' && candidate.relation !== 'right') return undefined;

  const stack = collectSideStackedLabelLines(field, candidate, lines);
  if (stack.length <= 1) return undefined;

  const sorted = stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
  const text = normalizePromptLabelText(sorted.map(({ text }) => text).join(' '));
  if (!isUsableLabelText(text, SIDE_LABEL_CONTINUATION_MAX_CHARS) || text === candidate.text) return undefined;

  const labelBox = sorted
    .slice(1)
    .reduce<BoxLike>((box, item) => unionBox(box, item.line), sorted[0]?.line ?? candidate.line);
  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
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

function collectSideStackedLabelLines(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const stack = [{ line: candidate.line, text: candidate.text }];
  let bounds: BoxLike = candidate.line;

  while (stack.length < SIDE_LABEL_STACK_MAX_LINES) {
    const next = findAdjacentSideStackLine(field, candidate, bounds, stack, lines);
    if (!next) break;
    stack.push(next);
    bounds = unionBox(bounds, next.line);
  }

  return stack;
}

function findAdjacentSideStackLine(
  field: FormField,
  candidate: LabelCandidate,
  bounds: BoxLike,
  stack: readonly { line: LabelLine; text: string }[],
  lines: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  let best: { line: LabelLine; text: string; gap: number } | undefined;
  for (const line of lines) {
    if (stack.some((item) => item.line === line)) continue;
    if (!isLineOnCandidateSide(field, candidate, line)) continue;

    const text = normalizeLabelText(line.text);
    if (!isUsablePromptFragment(text) || isDotLeaderText(text)) continue;

    const gap = verticalGap(bounds, line);
    if (gap < 0 || gap > SIDE_LABEL_STACK_MAX_GAP_PT) continue;
    if (!isStackAligned(bounds, line)) continue;

    if (!best || gap < best.gap || (gap === best.gap && line.y < best.line.y)) {
      best = { line, text, gap };
    }
  }
  return best ? { line: best.line, text: best.text } : undefined;
}

function isLineOnCandidateSide(field: FormField, candidate: LabelCandidate, line: LabelLine): boolean {
  if (candidate.relation === 'right') return line.x >= field.x + field.width - 1;
  return line.x + line.width <= field.x + 1;
}

function verticalGap(a: BoxLike, b: BoxLike): number {
  if (b.y + b.height <= a.y) return a.y - (b.y + b.height);
  if (a.y + a.height <= b.y) return b.y - (a.y + a.height);
  return -1;
}

function isStackAligned(bounds: BoxLike, line: LabelLine): boolean {
  if (horizontalOverlapRatio(bounds, line) >= SIDE_LABEL_STACK_MIN_OVERLAP_RATIO) return true;
  return Math.abs(centerX(bounds) - centerX(line)) <= SIDE_LABEL_STACK_CENTER_TOLERANCE_PT;
}
