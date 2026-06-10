import type { FormField, FormFieldLabel, FormFieldLabelRelation, FormFieldType } from '../types/index.js';

interface PdfAnnotation {
  subtype?: unknown;
  fieldName?: unknown;
  fieldType?: unknown;
  fieldValue?: unknown;
  rect?: unknown;
  checkBox?: unknown;
  radioButton?: unknown;
  readOnly?: unknown;
  required?: unknown;
  multiline?: unknown;
}

interface LabelLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildFormFields(
  annotations: readonly unknown[],
  pageHeight: number,
  viewMinX = 0,
  viewMinY = 0,
  labelLines: readonly LabelLine[] = [],
): FormField[] {
  const fields: FormField[] = [];
  for (const annotation of annotations) {
    const ann = annotation as PdfAnnotation;
    if (ann.subtype !== 'Widget') continue;
    if (typeof ann.fieldName !== 'string' || ann.fieldName.length === 0) continue;
    if (!Array.isArray(ann.rect) || ann.rect.length < 4 || !ann.rect.every((v) => typeof v === 'number')) continue;

    const [x1, y1, x2, y2] = ann.rect as [number, number, number, number];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const type = formFieldType(ann);
    const value = fieldValue(ann.fieldValue);
    const checked = type === 'checkbox' || type === 'radio' ? value !== undefined && value !== 'Off' : undefined;

    const field: FormField = {
      name: ann.fieldName,
      type,
      x: round2(minX - viewMinX),
      y: round2(pageHeight - (maxY - viewMinY)),
      width: round2(maxX - minX),
      height: round2(maxY - minY),
      ...(value !== undefined && { value }),
      ...(checked !== undefined && { checked }),
      ...(typeof ann.readOnly === 'boolean' && { readOnly: ann.readOnly }),
      ...(typeof ann.required === 'boolean' && { required: ann.required }),
      ...(typeof ann.multiline === 'boolean' && { multiline: ann.multiline }),
    };
    const label = findFieldLabel(field, labelLines);
    if (label) field.label = label;
    fields.push(field);
  }
  return fields.sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name));
}

function formFieldType(annotation: PdfAnnotation): FormFieldType {
  switch (annotation.fieldType) {
    case 'Tx':
      return 'text';
    case 'Btn':
      if (annotation.checkBox === true) return 'checkbox';
      if (annotation.radioButton === true) return 'radio';
      return 'button';
    case 'Ch':
      return 'choice';
    case 'Sig':
      return 'signature';
    default:
      return 'unknown';
  }
}

function fieldValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return undefined;
}

interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LabelCandidate {
  label: FormFieldLabel;
  score: number;
  line: LabelLine;
  text: string;
  relation: FormFieldLabelRelation;
}

const LABEL_MAX_CHARS = 220;
const SIDE_LABEL_MAX_GAP_PT = 80;
const ABOVE_LABEL_MAX_GAP_PT = 42;
const BELOW_LABEL_MAX_GAP_PT = 24;
const MIN_HORIZONTAL_OVERLAP_RATIO = 0.18;
const STACKED_LABEL_MAX_GAP_PT = 4;
const STACKED_LABEL_X_TOLERANCE_PT = 5;
const STACKED_LABEL_FONT_TOLERANCE_PT = 2;

function findFieldLabel(field: FormField, lines: readonly LabelLine[]): FormFieldLabel | undefined {
  if (lines.length === 0) return undefined;
  let best: LabelCandidate | undefined;
  for (const line of lines) {
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    const candidate = scoreLabelCandidate(field, line, text);
    if (!candidate) continue;
    if (!best || candidate.score < best.score) best = candidate;
  }
  return best ? expandStackedLabel(field, best, lines) : undefined;
}

function scoreLabelCandidate(field: FormField, line: LabelLine, text: string): LabelCandidate | undefined {
  const sidePreferred = field.type === 'checkbox' || field.type === 'radio' || field.type === 'button';
  const candidates = [
    sideLabelCandidate(field, line, text, 'right', sidePreferred ? 0 : 28),
    sideLabelCandidate(field, line, text, 'left', sidePreferred ? 12 : 18),
    verticalLabelCandidate(field, line, text, 'above', sidePreferred ? 70 : 0),
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
): LabelCandidate | undefined {
  const fieldRight = field.x + field.width;
  const lineRight = line.x + line.width;
  const gap = relation === 'right' ? line.x - fieldRight : field.x - lineRight;
  if (gap < -2 || gap > SIDE_LABEL_MAX_GAP_PT) return undefined;
  const centerDelta = Math.abs(centerY(field) - centerY(line));
  const maxCenterDelta = Math.max(7, Math.max(field.height, line.height) * 0.9);
  if (centerDelta > maxCenterDelta) return undefined;

  return {
    label: makeLabel(line, text, relation),
    line,
    text,
    relation,
    score: baseScore + Math.max(0, gap) * 1.4 + centerDelta * 2 + lengthPenalty(text),
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
  const nearEdge =
    line.x <= field.x + field.width + 8 &&
    line.x + line.width >= field.x - 8 &&
    centerDelta <= Math.max(field.width, 1);
  if (overlap < MIN_HORIZONTAL_OVERLAP_RATIO && fieldCoverage < MIN_HORIZONTAL_OVERLAP_RATIO && !nearEdge) {
    return undefined;
  }
  const alignment = Math.max(fieldCoverage, overlap);

  return {
    label: makeLabel(line, text, relation),
    line,
    text,
    relation,
    score: baseScore + Math.max(0, gap) * 2 + (1 - alignment) * 32 + centerDelta * 0.04 + lengthPenalty(text),
  };
}

function expandStackedLabel(field: FormField, candidate: LabelCandidate, lines: readonly LabelLine[]): FormFieldLabel {
  if (candidate.relation !== 'above' && candidate.relation !== 'below') return candidate.label;

  const stack = collectStackedLabelLines(field, candidate, lines);
  if (stack.length <= 1) return candidate.label;

  const sorted = stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
  const labelBox = sorted.slice(1).reduce<BoxLike>((box, item) => unionBox(box, item.line), sorted[0].line);
  const text = sorted.map((item) => item.text).join(' ');
  if (!isUsableLabelText(text)) return candidate.label;

  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
}

function collectStackedLabelLines(
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
    if (!isStackCompatibleLine(candidate.line, bounds, line)) continue;

    const gap =
      candidate.relation === 'above' ? bounds.y - (line.y + line.height) : line.y - (bounds.y + bounds.height);
    if (gap < -1 || gap > STACKED_LABEL_MAX_GAP_PT) continue;
    if (!best || gap < best.gap || (gap === best.gap && line.y < best.line.y)) {
      best = { line, text, gap };
    }
  }
  return best ? { line: best.line, text: best.text } : undefined;
}

function isStackCompatibleLine(anchor: LabelLine, bounds: BoxLike, line: LabelLine): boolean {
  const fontDelta = Math.abs((line.fontSize ?? anchor.fontSize ?? 0) - (anchor.fontSize ?? line.fontSize ?? 0));
  if (fontDelta > STACKED_LABEL_FONT_TOLERANCE_PT) return false;
  const leftAligned = Math.abs(line.x - anchor.x) <= STACKED_LABEL_X_TOLERANCE_PT;
  const overlapsExisting = horizontalOverlapRatio(bounds, line) >= MIN_HORIZONTAL_OVERLAP_RATIO;
  return leftAligned || overlapsExisting;
}

function makeLabel(line: LabelLine, text: string, relation: FormFieldLabelRelation): FormFieldLabel {
  return {
    text,
    relation,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
  };
}

function unionBox(a: BoxLike, b: BoxLike): BoxLike {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizeLabelText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isUsableLabelText(text: string): boolean {
  if (text.length === 0 || text.length > LABEL_MAX_CHARS) return false;
  return /[\p{Letter}\p{Number}]/u.test(text);
}

function lengthPenalty(text: string): number {
  return Math.max(0, text.length - 80) * 0.25;
}

function centerX(box: BoxLike): number {
  return box.x + box.width / 2;
}

function centerY(box: BoxLike): number {
  return box.y + box.height / 2;
}

function horizontalOverlapRatio(a: BoxLike, b: BoxLike): number {
  const denominator = Math.max(1, Math.min(a.width, b.width));
  return horizontalOverlapWidth(a, b) / denominator;
}

function horizontalOverlapWidth(a: BoxLike, b: BoxLike): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(0, overlap);
}

function overlapRatio(a: BoxLike, b: BoxLike): number {
  const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const overlapArea = Math.max(0, horizontal) * Math.max(0, vertical);
  const denominator = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return overlapArea / denominator;
}
