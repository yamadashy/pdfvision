import type { FormField } from '../../../types/index.js';
import {
  BROAD_STACKED_LABEL_MIN_EXTRA_WIDTH_PT,
  BROAD_STACKED_LABEL_WIDTH_RATIO,
  MIN_HORIZONTAL_OVERLAP_RATIO,
  STACKED_LABEL_FONT_TOLERANCE_PT,
  STACKED_LABEL_MAX_GAP_PT,
  STACKED_LABEL_NARROW_ANCHOR_MAX_WIDTH_PT,
  STACKED_LABEL_X_TOLERANCE_PT,
} from '../constants.js';
import { type BoxLike, centerY, horizontalOverlapRatio, overlapRatio, unionBox } from '../geometry.js';
import {
  isChoiceLikeField,
  isFormSectionHeadingText,
  isShortStandaloneFieldLabel,
  isUsableLabelText,
  normalizeLabelText,
  startsWithPromptItemMarker,
} from '../text.js';
import type { LabelCandidate, LabelLine } from '../types.js';

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
    if (candidate.relation === 'above' && isSeparateShortFieldLabel(candidate.text, text, bounds, line)) continue;
    if (
      candidate.relation === 'above' &&
      startsWithPromptItemMarker(stack[0]?.text ?? '') &&
      startsWithPromptItemMarker(text)
    ) {
      continue;
    }
    if (
      candidate.relation === 'above' &&
      line.y + line.height <= bounds.y + 1 &&
      isAnchoredToSectionHeadingBand(candidate.line, lines)
    ) {
      continue;
    }
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

function isSeparateShortFieldLabel(anchorText: string, lineText: string, bounds: BoxLike, line: LabelLine): boolean {
  if (line.y + line.height > bounds.y + 1) return false;
  return isShortStandaloneFieldLabel(anchorText) && isShortStandaloneFieldLabel(lineText);
}

function isSameRowChoiceContinuationLine(field: FormField, line: LabelLine, text: string): boolean {
  if (!isChoiceLikeField(field)) return false;
  if (line.x + line.width > field.x + 1) return false;
  if (startsWithPromptItemMarker(text) || isFormSectionHeadingText(text)) return false;
  return Math.abs(centerY(line) - centerY(field)) <= Math.max(7, Math.max(field.height, line.height) * 0.9);
}

function isAnchoredToSectionHeadingBand(anchor: LabelLine, lines: readonly LabelLine[]): boolean {
  if (isFormSectionHeadingText(normalizeLabelText(anchor.text))) return true;
  const anchorCenterY = centerY(anchor);
  return lines.some((line) => {
    if (line === anchor) return false;
    if (Math.abs(centerY(line) - anchorCenterY) > Math.max(3, Math.max(line.height, anchor.height) * 0.45)) {
      return false;
    }
    return isFormSectionHeadingText(normalizeLabelText(line.text));
  });
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
