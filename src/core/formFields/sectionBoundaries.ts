import type { FormField, FormFieldLabel } from '../../types/index.js';
import { centerY, makeLabel } from './geometry.js';
import { isFormSectionHeadingText, isUsableLabelText, normalizeLabelText } from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

export function isAbovePreviousSectionHeadingCandidate(
  field: FormField,
  line: LabelLine,
  relation: LabelCandidate['relation'],
  lines: readonly LabelLine[],
): boolean {
  if (field.type !== 'text' || relation !== 'above') return false;
  const lineBottom = line.y + line.height;
  for (const other of lines) {
    if (other === line) continue;
    const otherText = normalizeLabelText(other.text);
    if (!isFormSectionHeadingText(otherText)) continue;
    if (other.y < lineBottom - 1) continue;
    if (other.y + other.height > field.y + 1) continue;
    return true;
  }
  return false;
}

export function trimAboveSectionBoundaryLabel(
  field: FormField,
  label: FormFieldLabel,
  lines: readonly LabelLine[],
): FormFieldLabel {
  if (field.type !== 'text' || label.relation !== 'above') return label;
  const heading = nearestSectionHeadingBetween(label, field, lines);
  if (!heading || label.y >= heading.y - 1) return label;

  const title = widestSectionHeadingBandTitle(heading, lines);
  return title ? makeLabel(title.line, title.text, 'above') : label;
}

function nearestSectionHeadingBetween(
  label: FormFieldLabel,
  field: FormField,
  lines: readonly LabelLine[],
): LabelLine | undefined {
  let best: LabelLine | undefined;
  for (const line of lines) {
    const text = normalizeLabelText(line.text);
    if (!isFormSectionHeadingText(text)) continue;
    if (line.y < label.y + 1) continue;
    if (line.y + line.height > field.y + 1) continue;
    if (!best || line.y > best.y) best = line;
  }
  return best;
}

function widestSectionHeadingBandTitle(
  heading: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  const headingCenterY = centerY(heading);
  let best: { line: LabelLine; text: string } | undefined;
  for (const line of lines) {
    if (line === heading) continue;
    if (Math.abs(centerY(line) - headingCenterY) > Math.max(4, Math.max(line.height, heading.height) * 0.5)) {
      continue;
    }
    if (line.x + line.width <= heading.x + heading.width - 2) continue;
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text) || isFormSectionHeadingText(text)) continue;
    if (!best || line.width > best.line.width) best = { line, text };
  }
  return best;
}
