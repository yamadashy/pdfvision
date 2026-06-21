import type { FormField } from '../../types/index.js';
import {
  BROAD_STACKED_LABEL_MIN_EXTRA_WIDTH_PT,
  BROAD_STACKED_LABEL_WIDTH_RATIO,
  MIN_HORIZONTAL_OVERLAP_RATIO,
  SAME_LINE_MARKER_PROMPT_MAX_GAP_PT,
  SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES,
  SAME_LINE_MARKER_PROMPT_STACK_MAX_GAP_PT,
  SAME_LINE_MARKER_PROMPT_X_TOLERANCE_PT,
  SAME_LINE_TEXT_PROMPT_MAX_GAP_PT,
  SIDE_LABEL_CONTINUATION_MAX_GAP_PT,
  SIDE_LABEL_CONTINUATION_MAX_LINES,
  SIDE_LABEL_CONTINUATION_X_TOLERANCE_PT,
  STACKED_LABEL_FONT_TOLERANCE_PT,
  STACKED_LABEL_MAX_GAP_PT,
  STACKED_LABEL_NARROW_ANCHOR_MAX_WIDTH_PT,
  STACKED_LABEL_X_TOLERANCE_PT,
} from './constants.js';
import { type BoxLike, centerY, horizontalOverlapRatio, overlapRatio, unionBox } from './geometry.js';
import {
  isBareNumericFieldMarker,
  isChoiceLikeField,
  isDotLeaderText,
  isFormSectionHeadingText,
  isUsableLabelText,
  isUsablePromptFragment,
  normalizeLabelText,
  startsWithPromptItemMarker,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

export function collectTrailingPromptStack(
  candidateLine: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const stack: { line: LabelLine; text: string }[] = [];
  let bounds: BoxLike = candidateLine;
  while (stack.length < SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES) {
    const next = findPromptStackLine(bounds, lines, [candidateLine, ...stack.map((item) => item.line)]);
    if (!next) return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
    stack.push(next);
    bounds = unionBox(next.line, bounds);
  }
  return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
}

export function collectSideLabelContinuationLines(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const stack: { line: LabelLine; text: string }[] = [];
  let bounds: BoxLike = candidate.line;

  while (stack.length < SIDE_LABEL_CONTINUATION_MAX_LINES) {
    const next = findSideLabelContinuationLine(
      field,
      bounds,
      [candidate.line, ...stack.map((item) => item.line)],
      lines,
    );
    if (!next) return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
    stack.push(next);
    bounds = unionBox(next.line, bounds);
  }
  return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
}

function findSideLabelContinuationLine(
  field: FormField,
  bounds: BoxLike,
  excluded: readonly LabelLine[],
  lines: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  let best: { line: LabelLine; text: string; gap: number } | undefined;
  for (const line of lines) {
    if (excluded.includes(line)) continue;
    if (line.x + line.width > field.x + 1) continue;

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
    if (!next) return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
    if (
      isBareNumericFieldMarker(markerText) &&
      startsWithPromptItemMarker(next.text) &&
      !startsWithSameNumericMarker(markerText, next.text)
    ) {
      return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
    }
    stack.push(next);
    if (startsWithPromptItemMarker(next.text)) return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
    bounds = unionBox(next.line, bounds);
  }
  return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
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

export function collectStackedLabelLines(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const stack = [{ line: candidate.line, text: candidate.text }];
  let bounds: BoxLike = candidate.line;

  for (;;) {
    const next = findAdjacentStackLine(field, candidate, bounds, stack, lines);
    if (!next) return stack;
    stack.push(next);
    bounds = unionBox(bounds, next.line);
  }
}

function findAdjacentStackLine(
  field: FormField,
  candidate: LabelCandidate,
  bounds: BoxLike,
  stack: readonly { line: LabelLine; text: string }[],
  lines: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  let best: { line: LabelLine; text: string; gap: number } | undefined;
  for (const line of lines) {
    if (stack.some((item) => item.line === line)) continue;
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    if (candidate.relation === 'above' && isBroadStackedHeaderLine(text, bounds, line)) continue;
    if (!isStackCompatibleLine(candidate.line, bounds, line)) continue;

    const gap = candidate.relation === 'above' ? aboveStackLineGap(bounds, line) : line.y - (bounds.y + bounds.height);
    if (gap === undefined || gap < -1 || gap > STACKED_LABEL_MAX_GAP_PT) continue;
    if (
      candidate.relation === 'above' &&
      startsWithPromptItemMarker(candidate.text) &&
      line.y + line.height <= bounds.y + 1 &&
      !startsWithPromptItemMarker(text)
    ) {
      continue;
    }
    if (
      candidate.relation === 'above' &&
      line.y + line.height > field.y + 1 &&
      !isSameRowChoiceContinuationLine(field, line, text)
    ) {
      continue;
    }
    if (!best || gap < best.gap || (gap === best.gap && line.y < best.line.y)) {
      best = { line, text, gap };
    }
  }
  return best ? { line: best.line, text: best.text } : undefined;
}

function aboveStackLineGap(bounds: BoxLike, line: LabelLine): number | undefined {
  const upwardGap = bounds.y - (line.y + line.height);
  if (upwardGap >= -1 && upwardGap <= STACKED_LABEL_MAX_GAP_PT) return upwardGap;

  const downwardGap = line.y - (bounds.y + bounds.height);
  if (downwardGap < -1 || downwardGap > STACKED_LABEL_MAX_GAP_PT) return undefined;
  return downwardGap;
}

function isSameRowChoiceContinuationLine(field: FormField, line: LabelLine, text: string): boolean {
  if (!isChoiceLikeField(field)) return false;
  if (line.x + line.width > field.x + 1) return false;
  if (startsWithPromptItemMarker(text) || isFormSectionHeadingText(text)) return false;
  return Math.abs(centerY(line) - centerY(field)) <= Math.max(7, Math.max(field.height, line.height) * 0.9);
}

function isStackCompatibleLine(anchor: LabelLine, bounds: BoxLike, line: LabelLine): boolean {
  const fontDelta = Math.abs((line.fontSize ?? anchor.fontSize ?? 0) - (anchor.fontSize ?? line.fontSize ?? 0));
  if (fontDelta > STACKED_LABEL_FONT_TOLERANCE_PT) return false;
  const leftAligned = Math.abs(line.x - anchor.x) <= STACKED_LABEL_X_TOLERANCE_PT;
  const overlapsExisting = horizontalOverlapRatio(bounds, line) >= MIN_HORIZONTAL_OVERLAP_RATIO;
  return leftAligned || overlapsExisting;
}

function isBroadStackedHeaderLine(text: string, bounds: BoxLike, line: LabelLine): boolean {
  if (isFormSectionHeadingText(text)) return true;
  if (bounds.width > STACKED_LABEL_NARROW_ANCHOR_MAX_WIDTH_PT) return false;
  const muchWider =
    line.width >
    Math.max(bounds.width * BROAD_STACKED_LABEL_WIDTH_RATIO, bounds.width + BROAD_STACKED_LABEL_MIN_EXTRA_WIDTH_PT);
  return muchWider && Math.abs(line.x - bounds.x) > STACKED_LABEL_X_TOLERANCE_PT;
}
