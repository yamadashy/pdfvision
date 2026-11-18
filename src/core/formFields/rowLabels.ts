import type { FormField, FormFieldLabel } from '../../types/index.js';
import { type BoxLike, centerY, makeLabel } from './geometry.js';
import {
  isChoiceLikeField,
  isExplanatoryFormParagraphStart,
  isFormLabelChromeText,
  isSemanticFieldNameMismatch,
  isUsableLabelText,
  normalizeLabelText,
} from './text.js';
import type { LabelLine } from './types.js';

/**
 * Labels for fields in a column aligned well right of a left-margin label
 * column ("Full name *" at x=54, the box at x=200). The scored search caps
 * a left label's gap so that a label belonging to some other widget is not
 * borrowed across the page; here the gap is unbounded but the row must be
 * clear: the label shares the field's row tightly and no text or widget
 * sits between them.
 */

const ROW_CENTER_TOLERANCE_PT = 4;
const ROW_CENTER_TOLERANCE_RATIO = 0.3;
const CHOICE_OPTION_GAP_PT = 8;
const SPLIT_BOX_MAX_GAP_PT = 16;
const SPLIT_BOX_HEIGHT_TOLERANCE_RATIO = 0.2;
const SPLIT_BOX_SEPARATOR = /^[-/.:–—]$/u;

export function findClearRowLeftLabel(
  field: FormField,
  lines: readonly LabelLine[],
  siblings: readonly FormField[],
): FormFieldLabel | undefined {
  if (field.type !== 'text' && field.type !== 'choice' && field.type !== 'signature') return undefined;
  let best: { line: LabelLine; text: string } | undefined;
  for (const line of lines) {
    const right = line.x + line.width;
    if (right > field.x + 2) continue;
    if (!sharesRow(field, line)) continue;
    if (best && right <= best.line.x + best.line.width) continue;
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text) || isFormLabelChromeText(text) || isExplanatoryFormParagraphStart(text)) continue;
    if (isSemanticFieldNameMismatch(field, text)) continue;
    if (isChoiceOptionText(line, field, siblings)) continue;
    if (hasLineBetween(line, field, lines) || hasFieldBetween(line, field, siblings)) continue;
    best = { line, text };
  }
  return best ? makeLabel(best.line, best.text, 'left') : undefined;
}

/**
 * A date or ID split into adjacent boxes carries one printed label before
 * the first box. A box with no label of its own takes its left neighbour's
 * left label when the two are the same kind of box on the same row, a few
 * points apart, with at most a separator (`/`, `-`) between them.
 */
export function inheritSplitBoxLabels(fields: readonly FormField[], lines: readonly LabelLine[]): void {
  const byX = [...fields].sort((a, b) => a.x - b.x);
  for (const field of byX) {
    if (field.label || field.type !== 'text') continue;
    const neighbour = splitBoxNeighbour(field, byX, lines);
    if (neighbour?.label?.relation === 'left') field.label = { ...neighbour.label };
  }
}

function splitBoxNeighbour(
  field: FormField,
  fields: readonly FormField[],
  lines: readonly LabelLine[],
): FormField | undefined {
  let best: FormField | undefined;
  for (const other of fields) {
    if (other === field || other.type !== field.type) continue;
    const gap = field.x - (other.x + other.width);
    if (gap < -1 || gap > SPLIT_BOX_MAX_GAP_PT) continue;
    if (Math.abs(centerY(other) - centerY(field)) > 2) continue;
    if (Math.abs(other.height - field.height) > field.height * SPLIT_BOX_HEIGHT_TOLERANCE_RATIO) continue;
    if (best && other.x <= best.x) continue;
    best = other;
  }
  if (!best) return undefined;
  const between = lines.filter((line) => isBetween(line, best, field));
  return between.every((line) => SPLIT_BOX_SEPARATOR.test(line.text.trim())) ? best : undefined;
}

function sharesRow(field: BoxLike, line: BoxLike): boolean {
  const tolerance = Math.max(ROW_CENTER_TOLERANCE_PT, field.height * ROW_CENTER_TOLERANCE_RATIO);
  return Math.abs(centerY(field) - centerY(line)) <= tolerance && line.height <= field.height * 1.5 + 2;
}

/**
 * A box that starts in the gap between `left` and `right` and overlaps
 * their row. A layout line that starts at or before `left`'s right edge is
 * `left` itself merged with more text, not something between.
 */
function isBetween(line: BoxLike, left: BoxLike, right: BoxLike): boolean {
  if (line.x < left.x + left.width - 1 || line.x >= right.x - 1) return false;
  const top = Math.min(left.y, right.y);
  const bottom = Math.max(left.y + left.height, right.y + right.height);
  const overlap = Math.min(bottom, line.y + line.height) - Math.max(top, line.y);
  return overlap >= Math.min(line.height, bottom - top) * 0.3;
}

function hasLineBetween(label: LabelLine, field: FormField, lines: readonly LabelLine[]): boolean {
  return lines.some((line) => line !== label && line.text.trim().length > 0 && isBetween(line, label, field));
}

function hasFieldBetween(label: LabelLine, field: FormField, siblings: readonly FormField[]): boolean {
  return siblings.some((sibling) => sibling !== field && isBetween(sibling, label, field));
}

/** The line is the option text of a checkbox or radio just before it. */
function isChoiceOptionText(line: LabelLine, field: FormField, siblings: readonly FormField[]): boolean {
  return siblings.some(
    (sibling) =>
      sibling !== field &&
      isChoiceLikeField(sibling) &&
      Math.abs(centerY(sibling) - centerY(line)) <= Math.max(4, sibling.height) &&
      line.x - (sibling.x + sibling.width) >= -2 &&
      line.x - (sibling.x + sibling.width) <= CHOICE_OPTION_GAP_PT,
  );
}
