import type { FormField } from '../../../types/index.js';
import {
  CHOICE_SIDE_PROMPT_MAX_GAP_PT,
  MIN_HORIZONTAL_OVERLAP_RATIO,
  SAME_LINE_MARKER_PROMPT_MAX_GAP_PT,
  SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES,
  SAME_LINE_MARKER_PROMPT_STACK_MAX_GAP_PT,
  SAME_LINE_MARKER_PROMPT_X_TOLERANCE_PT,
  SAME_LINE_TEXT_PROMPT_MAX_GAP_PT,
  SIDE_LABEL_CONTINUATION_MAX_GAP_PT,
  SIDE_LABEL_CONTINUATION_MAX_LINES,
  SIDE_LABEL_CONTINUATION_X_TOLERANCE_PT,
} from '../constants.js';
import { type BoxLike, centerY, horizontalOverlapRatio, unionBox } from '../geometry.js';
import {
  isBareNumericFieldMarker,
  isChoiceLikeField,
  isDotLeaderText,
  isUsablePromptFragment,
  normalizeLabelText,
  startsWithPromptItemMarker,
} from '../text.js';
import type { LabelCandidate, LabelLine } from '../types.js';

export function collectTrailingPromptStack(
  candidateLine: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const stack: { line: LabelLine; text: string }[] = [];
  let bounds: BoxLike = candidateLine;
  while (stack.length < SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES) {
    const next = findPromptStackLine(bounds, lines, [candidateLine, ...stack.map((item) => item.line)]);
    if (!next) return sortPromptStack(stack);
    stack.push(next);
    bounds = unionBox(next.line, bounds);
  }
  return sortPromptStack(stack);
}

export function collectSideLabelContinuationLines(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
  siblings: readonly FormField[] = [],
): { line: LabelLine; text: string }[] {
  const stack: { line: LabelLine; text: string }[] = [];
  let bounds: BoxLike = candidate.line;

  while (stack.length < SIDE_LABEL_CONTINUATION_MAX_LINES) {
    const next = findSideLabelContinuationLine(
      field,
      bounds,
      [candidate.line, ...stack.map((item) => item.line)],
      lines,
      siblings,
    );
    if (!next) return sortPromptStack(stack);
    stack.push(next);
    bounds = unionBox(next.line, bounds);
  }
  return sortPromptStack(stack);
}

export function collectConnectedLeftPromptLines(
  markerLine: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const markerCenter = centerY(markerLine);
  let boundaryX = markerLine.x;
  const connected: { line: LabelLine; text: string }[] = [];
  const leftLines = lines
    .filter((line) => line !== markerLine)
    .filter((line) => line.x + line.width <= markerLine.x + 1)
    .filter((line) => Math.abs(centerY(line) - markerCenter) <= Math.max(3, markerLine.height * 0.45))
    .sort((a, b) => b.x + b.width - (a.x + a.width));

  for (const line of leftLines) {
    const text = normalizeLabelText(line.text);
    if (!isUsablePromptFragment(text)) continue;
    const gap = boundaryX - (line.x + line.width);
    if (gap < -2) continue;
    const alreadyHasPromptText = connected.some((item) => !isDotLeaderText(item.text));
    if (alreadyHasPromptText && !isDotLeaderText(text) && gap > SAME_LINE_TEXT_PROMPT_MAX_GAP_PT) break;
    if (gap > SAME_LINE_MARKER_PROMPT_MAX_GAP_PT) break;
    connected.unshift({ line, text });
    boundaryX = line.x;
  }
  return connected;
}

export function collectSameLineMarkerPromptStack(
  markerText: string,
  sameLinePrompt: readonly { line: LabelLine; text: string }[],
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const firstPrompt = sameLinePrompt.find((item) => !isDotLeaderText(item.text));
  if (!firstPrompt || startsWithPromptItemMarker(firstPrompt.text)) return [];

  const stack: { line: LabelLine; text: string }[] = [];
  let bounds: BoxLike = firstPrompt.line;
  while (stack.length < SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES) {
    const next = findPromptStackLine(bounds, lines, [
      ...stack.map((item) => item.line),
      ...sameLinePrompt.map((item) => item.line),
    ]);
    if (!next) return sortPromptStack(stack);
    if (
      isBareNumericFieldMarker(markerText) &&
      startsWithPromptItemMarker(next.text) &&
      !startsWithSameNumericMarker(markerText, next.text)
    ) {
      return sortPromptStack(stack);
    }
    stack.push(next);
    if (startsWithPromptItemMarker(next.text)) return sortPromptStack(stack);
    bounds = unionBox(next.line, bounds);
  }
  return sortPromptStack(stack);
}

function findSideLabelContinuationLine(
  field: FormField,
  bounds: BoxLike,
  excluded: readonly LabelLine[],
  lines: readonly LabelLine[],
  siblings: readonly FormField[],
): { line: LabelLine; text: string } | undefined {
  let best: { line: LabelLine; text: string; gap: number } | undefined;
  for (const line of lines) {
    if (excluded.includes(line)) continue;
    if (line.x + line.width > field.x + field.width + 2) continue;
    if (isLineAlignedWithSiblingChoiceField(field, line, siblings)) continue;

    const text = normalizeLabelText(line.text);
    if (!isUsablePromptFragment(text) || isDotLeaderText(text)) continue;

    const gap = bounds.y - (line.y + line.height);
    if (gap < -1 || gap > SIDE_LABEL_CONTINUATION_MAX_GAP_PT) continue;

    const leftAligned = Math.abs(line.x - bounds.x) <= SIDE_LABEL_CONTINUATION_X_TOLERANCE_PT;
    const overlapsExisting = horizontalOverlapRatio(bounds, line) >= MIN_HORIZONTAL_OVERLAP_RATIO;
    if (!leftAligned && !overlapsExisting) continue;

    if (!best || gap < best.gap || (gap === best.gap && line.y < best.line.y)) {
      best = { line, text, gap };
    }
  }
  return best ? { line: best.line, text: best.text } : undefined;
}

function isLineAlignedWithSiblingChoiceField(
  field: FormField,
  line: LabelLine,
  siblings: readonly FormField[],
): boolean {
  for (const sibling of siblings) {
    if (sibling === field || !isChoiceLikeField(sibling)) continue;
    if (line.x + line.width > sibling.x + sibling.width + 2) continue;
    if (sibling.x - (line.x + line.width) > CHOICE_SIDE_PROMPT_MAX_GAP_PT) continue;
    const centerDelta = Math.abs(centerY(sibling) - centerY(line));
    if (centerDelta <= Math.max(7, Math.max(sibling.height, line.height) * 0.9)) return true;
  }
  return false;
}

function startsWithSameNumericMarker(markerText: string, text: string): boolean {
  const marker = normalizeLabelText(markerText).replace(/\s*\$/u, '').trim();
  if (!/^\d+$/u.test(marker)) return false;
  return new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(normalizeLabelText(text));
}

function findPromptStackLine(
  bounds: BoxLike,
  lines: readonly LabelLine[],
  excluded: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  let best: { line: LabelLine; text: string; gap: number } | undefined;
  for (const line of lines) {
    if (excluded.includes(line)) continue;
    const text = normalizeLabelText(line.text);
    if (!isUsablePromptFragment(text) || isDotLeaderText(text)) continue;
    const gap = bounds.y - (line.y + line.height);
    if (gap < -1 || gap > SAME_LINE_MARKER_PROMPT_STACK_MAX_GAP_PT) continue;
    const leftAligned = Math.abs(line.x - bounds.x) <= SAME_LINE_MARKER_PROMPT_X_TOLERANCE_PT;
    const overlapsExisting = horizontalOverlapRatio(bounds, line) >= MIN_HORIZONTAL_OVERLAP_RATIO;
    if (!leftAligned && !overlapsExisting) continue;
    if (!best || gap < best.gap || (gap === best.gap && line.y < best.line.y)) {
      best = { line, text, gap };
    }
  }
  return best ? { line: best.line, text: best.text } : undefined;
}

function sortPromptStack(stack: { line: LabelLine; text: string }[]): { line: LabelLine; text: string }[] {
  return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
}
