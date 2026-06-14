import type {
  FormField,
  FormFieldChoiceOption,
  FormFieldLabel,
  FormFieldLabelRelation,
  FormFieldResetFormAction,
  FormFieldType,
} from '../types/index.js';
import { annotationFlagNames } from './annotations.js';
import { normalizeJavaScriptActions } from './viewer.js';

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
  annotationFlags?: unknown;
  options?: unknown;
  combo?: unknown;
  multiSelect?: unknown;
  actions?: unknown;
  resetForm?: unknown;
  exportValue?: unknown;
  buttonValue?: unknown;
}

interface LabelLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
}

type Rect = [number, number, number, number];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validatePageGeometry(pageHeight: number, viewMinX: number, viewMinY: number): void {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new TypeError('buildFormFields: pageHeight must be a positive finite number');
  }
  if (!Number.isFinite(viewMinX) || !Number.isFinite(viewMinY)) {
    throw new TypeError('buildFormFields: viewMinX and viewMinY must be finite numbers');
  }
}

export function buildFormFields(
  annotations: readonly unknown[],
  pageHeight: number,
  viewMinX = 0,
  viewMinY = 0,
  labelLines: readonly LabelLine[] = [],
): FormField[] {
  validatePageGeometry(pageHeight, viewMinX, viewMinY);

  const fields: FormField[] = [];
  for (const annotation of annotations) {
    const ann = annotation as PdfAnnotation;
    if (ann.subtype !== 'Widget') continue;
    if (typeof ann.fieldName !== 'string' || ann.fieldName.length === 0) continue;
    const rect = fieldRect(ann.rect);
    if (!rect) continue;

    const [x1, y1, x2, y2] = rect;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const type = formFieldType(ann);
    const value = fieldValue(ann.fieldValue);
    const checked = type === 'checkbox' || type === 'radio' ? value !== undefined && value !== 'Off' : undefined;
    const flags = annotationFlagNames(ann.annotationFlags);
    const actions = normalizeJavaScriptActions(ann.actions);
    const resetForm = formResetAction(ann.resetForm);
    const exportValue = fieldExportValue(ann, type);

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
      ...(exportValue !== undefined && { exportValue }),
      ...choiceFieldMetadata(ann),
      ...(flags.length > 0 && { flags }),
      ...(actions !== undefined && { actions }),
      ...(resetForm !== undefined && { resetForm }),
    };
    fields.push(field);
  }
  // Labels are resolved after every widget rect is known so that a
  // candidate line spanning ACROSS a sibling widget (two checkbox
  // options merged into one layout line) can be penalized in favor of
  // the span that stops at the sibling.
  for (const field of fields) {
    const label = findFieldLabel(field, labelLines, fields);
    if (label) field.label = label;
  }
  return fields.sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name));
}

function formResetAction(value: unknown): FormFieldResetFormAction | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as { fields?: unknown; include?: unknown };
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter((field): field is string => typeof field === 'string')
    : [];
  return {
    fields,
    include: raw.include === true,
  };
}

function fieldRect(value: unknown): Rect | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const values = value.slice(0, 4);
  if (!values.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return values as Rect;
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
  if (Array.isArray(value)) return value.map(fieldArrayValue).join(', ');
  return undefined;
}

function fieldExportValue(annotation: PdfAnnotation, type: FormFieldType): string | undefined {
  if (type === 'checkbox') return fieldValue(annotation.exportValue);
  if (type === 'radio') return fieldValue(annotation.buttonValue ?? annotation.exportValue);
  return undefined;
}

function fieldArrayValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

function choiceFieldMetadata(annotation: PdfAnnotation): Pick<FormField, 'combo' | 'multiSelect' | 'options'> {
  if (annotation.fieldType !== 'Ch') return {};
  const options = choiceOptions(annotation.options);
  return {
    ...(typeof annotation.combo === 'boolean' && { combo: annotation.combo }),
    ...(typeof annotation.multiSelect === 'boolean' && { multiSelect: annotation.multiSelect }),
    ...(options.length > 0 && { options }),
  };
}

function choiceOptions(value: unknown): FormFieldChoiceOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => choiceOption(item)).filter((item): item is FormFieldChoiceOption => item !== undefined);
}

function choiceOption(value: unknown): FormFieldChoiceOption | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as { exportValue?: unknown; displayValue?: unknown };
  const exportValue = choiceOptionText(raw.exportValue);
  const displayValue = choiceOptionText(raw.displayValue) ?? exportValue;
  if (exportValue === undefined || displayValue === undefined) return undefined;
  return { exportValue, displayValue };
}

function choiceOptionText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
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
const STACKED_LABEL_MAX_CHARS = 260;
const SIDE_LABEL_MAX_GAP_PT = 80;
const ABOVE_LABEL_MAX_GAP_PT = 42;
const BELOW_LABEL_MAX_GAP_PT = 24;
const MIN_HORIZONTAL_OVERLAP_RATIO = 0.18;
const STACKED_LABEL_MAX_GAP_PT = 4;
const STACKED_LABEL_X_TOLERANCE_PT = 5;
const STACKED_LABEL_FONT_TOLERANCE_PT = 2;
const INLINE_TEXT_FIELD_MAX_WIDTH_PT = 60;
const INLINE_TEXT_FIELD_MAX_HEIGHT_PT = 18;
const SHORT_VERTICAL_LABEL_FIELD_COVERAGE = 0.35;
const VERTICAL_LABEL_EDGE_TOLERANCE_PT = 8;
const WIDE_VERTICAL_LABEL_FIELD_COVERAGE = 0.7;
const SAME_LINE_TEXT_PROMPT_MAX_GAP_PT = 12;
const SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT = 8.5;
const SAME_LINE_MARKER_PROMPT_MAX_GAP_PT = 30;
const SAME_LINE_MARKER_PROMPT_STACK_MAX_GAP_PT = 4;
const SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES = 1;
const SAME_LINE_MARKER_PROMPT_X_TOLERANCE_PT = 18;

function findFieldLabel(
  field: FormField,
  lines: readonly LabelLine[],
  siblings: readonly FormField[] = [],
): FormFieldLabel | undefined {
  if (lines.length === 0) return undefined;
  let best: LabelCandidate | undefined;
  for (const line of lines) {
    const text = normalizeLabelText(line.text);
    if (!isUsableLabelText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    const candidate = scoreLabelCandidate(field, line, text);
    if (!candidate) continue;
    candidate.score += widgetCrossingPenalty(field, candidate, siblings);
    if (!best || candidate.score < best.score) best = candidate;
  }
  if (!best) return undefined;
  return expandSameLineMarkerPromptLabel(field, best, lines) ?? expandStackedLabel(field, best, lines);
}

/** Penalty per sibling widget a side-relation label line runs across.
 *  IRS 1040 packs several checkbox options on one row ("[cb] Filed
 *  pursuant to section 301.9100-2  [cb] Combat zone"); the layout pass
 *  merges that row into one line, which would otherwise out-score the
 *  per-option span and hand the first checkbox both options' text. */
const WIDGET_CROSSING_PENALTY = 40;

function widgetCrossingPenalty(field: FormField, candidate: LabelCandidate, siblings: readonly FormField[]): number {
  if (candidate.relation !== 'left' && candidate.relation !== 'right') return 0;
  const line = candidate.line;
  let crossings = 0;
  for (const sibling of siblings) {
    if (sibling === field) continue;
    const siblingCenterX = sibling.x + sibling.width / 2;
    if (siblingCenterX <= line.x || siblingCenterX >= line.x + line.width) continue;
    const verticalOverlap = Math.min(line.y + line.height, sibling.y + sibling.height) - Math.max(line.y, sibling.y);
    if (verticalOverlap < Math.min(line.height, sibling.height) * 0.5) continue;
    crossings++;
  }
  return crossings * WIDGET_CROSSING_PENALTY;
}

function scoreLabelCandidate(field: FormField, line: LabelLine, text: string): LabelCandidate | undefined {
  const sidePreferred = field.type === 'checkbox' || field.type === 'radio' || field.type === 'button';
  const inlineTextField =
    field.type === 'text' &&
    field.width <= INLINE_TEXT_FIELD_MAX_WIDTH_PT &&
    field.height <= INLINE_TEXT_FIELD_MAX_HEIGHT_PT;
  const candidates = [
    sideLabelCandidate(field, line, text, 'right', sidePreferred ? 0 : 28),
    sideLabelCandidate(
      field,
      line,
      text,
      'left',
      sidePreferred ? 12 : inlineTextField ? 0 : 18,
      inlineTextField ? 0.45 : 1.4,
    ),
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
  if (gap < -2 || gap > SIDE_LABEL_MAX_GAP_PT) return undefined;
  const centerDelta = Math.abs(centerY(field) - centerY(line));
  const maxCenterDelta = Math.max(7, Math.max(field.height, line.height) * 0.9);
  if (centerDelta > maxCenterDelta) return undefined;
  const sameLineTextPrompt =
    field.type === 'text' &&
    relation === 'left' &&
    gap <= SAME_LINE_TEXT_PROMPT_MAX_GAP_PT &&
    centerDelta <= Math.max(4, field.height * 0.35) &&
    (line.fontSize ?? SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT) <= SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT;
  const scoreBase = sameLineTextPrompt ? Math.min(baseScore, 0) : baseScore;
  const scoreGapWeight = sameLineTextPrompt ? Math.min(gapWeight, 0.45) : gapWeight;

  return {
    label: makeLabel(line, text, relation),
    line,
    text,
    relation,
    score: scoreBase + Math.max(0, gap) * scoreGapWeight + centerDelta * 2 + lengthPenalty(text),
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
  if (fieldCoverage < SHORT_VERTICAL_LABEL_FIELD_COVERAGE && !edgeAligned) return undefined;

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
    score:
      baseScore +
      Math.max(0, gap) * 2 +
      (1 - alignment) * 32 +
      centerDelta * 0.04 +
      (fieldCoverage >= WIDE_VERTICAL_LABEL_FIELD_COVERAGE ? 0 : lengthPenalty(text)),
  };
}

function expandStackedLabel(field: FormField, candidate: LabelCandidate, lines: readonly LabelLine[]): FormFieldLabel {
  if (candidate.relation !== 'above' && candidate.relation !== 'below') return candidate.label;

  const stack = collectStackedLabelLines(field, candidate, lines);
  if (stack.length <= 1) return candidate.label;

  const sorted = stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
  const labelBox = sorted.slice(1).reduce<BoxLike>((box, item) => unionBox(box, item.line), sorted[0].line);
  const text = sorted.map((item) => item.text).join(' ');
  if (!isUsableLabelText(text, STACKED_LABEL_MAX_CHARS)) return candidate.label;

  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
}

function expandSameLineMarkerPromptLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (field.type !== 'text' || candidate.relation !== 'left') return undefined;
  if (!isCompactFieldMarker(candidate.text)) return undefined;

  const sameLinePrompt = collectConnectedLeftPromptLines(candidate.line, lines);
  if (sameLinePrompt.length === 0) return undefined;

  const stackedPrompt = collectSameLineMarkerPromptStack(sameLinePrompt, lines);
  const promptLines = [...stackedPrompt, ...sameLinePrompt, { line: candidate.line, text: candidate.text }];
  const textParts = promptLines
    .map(({ text }) => normalizePromptLabelText(text))
    .filter((text) => text.length > 0 && !isDotLeaderText(text));
  const text = normalizePromptLabelText(textParts.join(' '));
  if (!isUsableLabelText(text) || text === candidate.text) return undefined;

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

function collectConnectedLeftPromptLines(
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
    if (gap > SAME_LINE_MARKER_PROMPT_MAX_GAP_PT) break;
    connected.unshift({ line, text });
    boundaryX = line.x;
  }
  return connected;
}

function collectSameLineMarkerPromptStack(
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
    stack.push(next);
    bounds = unionBox(next.line, bounds);
  }
  return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
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

function normalizePromptLabelText(text: string): string {
  return text
    .replace(/(?:\s*\.\s*){2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsableLabelText(text: string, maxChars = LABEL_MAX_CHARS): boolean {
  if (text.length === 0 || text.length > maxChars) return false;
  return /[\p{Letter}\p{Number}]/u.test(text);
}

function isUsablePromptFragment(text: string): boolean {
  if (text.length === 0 || text.length > LABEL_MAX_CHARS) return false;
  return isDotLeaderText(text) || /[\p{Letter}\p{Number}]/u.test(text);
}

function isDotLeaderText(text: string): boolean {
  return /^[.\s]+$/u.test(text);
}

function isCompactFieldMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  if (normalized.length > 16) return false;
  return /^(?:\d+(?:\([a-z]\)|[a-z])?|\([a-z]\))\s*\$?$/iu.test(normalized);
}

function startsWithPromptItemMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  return /^(?:\d+(?:\([a-z]\)|[a-z])?|\([a-z]\)|[a-z]\s+[A-Z])/u.test(normalized);
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
