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
  id?: unknown;
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

interface BuildFormFieldsOptions {
  widgetAppearanceCaptions?: ReadonlyMap<string, string>;
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
  options: BuildFormFieldsOptions = {},
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
    const caption = fieldCaption(ann, type, options);
    const choiceMetadata = choiceFieldMetadata(ann);
    const displayValue =
      type === 'choice' && value !== undefined ? choiceDisplayValue(value, choiceMetadata.options) : undefined;

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
      ...(displayValue !== undefined && displayValue !== value && { displayValue }),
      ...(exportValue !== undefined && { exportValue }),
      ...(caption !== undefined && { caption }),
      ...choiceMetadata,
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

function fieldCaption(
  annotation: PdfAnnotation,
  type: FormFieldType,
  options: BuildFormFieldsOptions,
): string | undefined {
  if (type !== 'button' || typeof annotation.id !== 'string') return undefined;
  const caption = options.widgetAppearanceCaptions?.get(annotation.id);
  if (caption === undefined) return undefined;
  const normalized = caption.trim().replace(/\s+/gu, ' ');
  return normalized.length > 0 ? normalized : undefined;
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

function choiceDisplayValue(value: string, options: readonly FormFieldChoiceOption[] | undefined): string | undefined {
  if (!options || options.length === 0) return undefined;
  const selectedValues = value.split(/\s*,\s*/u).filter((item) => item.length > 0);
  if (selectedValues.length === 0) return undefined;
  return selectedValues.map((item) => selectedChoiceDisplayValue(item, options)).join(', ');
}

function selectedChoiceDisplayValue(value: string, options: readonly FormFieldChoiceOption[]): string {
  const option = options.find((item) => item.exportValue === value || item.displayValue === value);
  return option?.displayValue ?? value;
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
const CHOICE_STACKED_LABEL_MAX_CHARS = 360;
const SIDE_LABEL_MAX_GAP_PT = 80;
const TALL_TEXT_FIELD_SIDE_LABEL_MAX_GAP_PT = 110;
const WIDE_ROW_HEADER_LABEL_MAX_GAP_PT = 340;
const WIDE_ROW_HEADER_LABEL_GAP_WEIGHT = 0.12;
const ABOVE_LABEL_MAX_GAP_PT = 42;
const BELOW_LABEL_MAX_GAP_PT = 24;
const MIN_HORIZONTAL_OVERLAP_RATIO = 0.18;
const STACKED_LABEL_MAX_GAP_PT = 4;
const STACKED_LABEL_X_TOLERANCE_PT = 5;
const STACKED_LABEL_FONT_TOLERANCE_PT = 2;
const STACKED_LABEL_NARROW_ANCHOR_MAX_WIDTH_PT = 120;
const BROAD_STACKED_LABEL_WIDTH_RATIO = 3;
const BROAD_STACKED_LABEL_MIN_EXTRA_WIDTH_PT = 160;
const INLINE_TEXT_FIELD_MAX_WIDTH_PT = 60;
const INLINE_TEXT_FIELD_MAX_HEIGHT_PT = 18;
const SHORT_VERTICAL_LABEL_FIELD_COVERAGE = 0.35;
const VERTICAL_LABEL_EDGE_TOLERANCE_PT = 8;
const WIDE_VERTICAL_LABEL_FIELD_COVERAGE = 0.7;
const SAME_LINE_TEXT_PROMPT_MAX_GAP_PT = 12;
const SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT = 8.5;
const SAME_LINE_MARKER_PROMPT_MAX_GAP_PT = 30;
const SAME_LINE_MARKER_PROMPT_STACK_MAX_GAP_PT = 4;
const SAME_LINE_MARKER_PROMPT_MAX_STACK_LINES = 2;
const SAME_LINE_MARKER_PROMPT_X_TOLERANCE_PT = 18;
const SIDE_LABEL_CONTINUATION_MAX_CHARS = 360;
const SIDE_LABEL_CONTINUATION_MAX_GAP_PT = 4;
const SIDE_LABEL_CONTINUATION_MAX_LINES = 3;
const SIDE_LABEL_CONTINUATION_X_TOLERANCE_PT = 18;
const MIN_SEMANTIC_FIELD_NAME_TOKENS = 2;
const FIELD_NAME_TOKEN_MIN_CHARS = 3;
const FIELD_NAME_STOP_WORDS = new Set(['applicant', 'field', 'form', 'page', 'value', 'input', 'entry']);
const STRONG_SINGLE_FIELD_NAME_TOKENS = new Set([
  'address',
  'birth',
  'city',
  'country',
  'date',
  'dob',
  'email',
  'gender',
  'name',
  'number',
  'phone',
  'signature',
  'state',
]);
const NARROW_SEMANTIC_ABOVE_LABEL_PENALTY = 35;
const SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_TOLERANCE_PT = 20;
const SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_WEIGHT = 0.8;

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
    if (isFormLabelChromeText(text)) continue;
    if (overlapRatio(field, line) >= 0.35) continue;
    if (isSemanticFieldNameMismatch(field, text)) continue;
    const candidate = scoreLabelCandidate(field, line, text);
    if (!candidate) continue;
    candidate.score += widgetCrossingPenalty(field, candidate, siblings);
    if (!best || candidate.score < best.score) best = candidate;
  }
  if (!best) return undefined;
  return (
    expandSameLineMarkerPromptLabel(field, best, lines) ??
    expandLeftTrailingPromptStack(field, best, lines) ??
    expandSideLabelContinuation(field, best, lines) ??
    expandStackedLabel(field, best, lines)
  );
}

/** Penalty per sibling widget a side-relation label line runs across.
 *  IRS 1040 packs several checkbox options on one row ("[cb] Filed
 *  pursuant to section 301.9100-2  [cb] Combat zone"); the layout pass
 *  merges that row into one line, which would otherwise out-score the
 *  per-option span and hand the first checkbox both options' text. */
const WIDGET_CROSSING_PENALTY = 40;

function widgetCrossingPenalty(field: FormField, candidate: LabelCandidate, siblings: readonly FormField[]): number {
  const line = candidate.line;
  let crossings = 0;
  for (const sibling of siblings) {
    if (sibling === field) continue;
    const siblingCenterX = sibling.x + sibling.width / 2;
    if (siblingCenterX <= line.x || siblingCenterX >= line.x + line.width) continue;
    if (candidate.relation === 'left' || candidate.relation === 'right') {
      const verticalOverlap = Math.min(line.y + line.height, sibling.y + sibling.height) - Math.max(line.y, sibling.y);
      if (verticalOverlap < Math.min(line.height, sibling.height) * 0.5) continue;
    } else {
      const gap =
        candidate.relation === 'above' ? sibling.y - (line.y + line.height) : line.y - (sibling.y + sibling.height);
      const maxGap = candidate.relation === 'above' ? ABOVE_LABEL_MAX_GAP_PT : BELOW_LABEL_MAX_GAP_PT;
      if (gap < -2 || gap > maxGap) continue;
    }
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
    sideLabelCandidate(field, line, text, 'left', sidePreferred ? 12 : 18, 1.4),
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
  const wideRowHeader = relation === 'left' && isWideRowHeaderLabelText(text);
  const tallTextFieldLeftLabel = relation === 'left' && field.type === 'text' && field.height >= 30;
  const maxGap = wideRowHeader
    ? WIDE_ROW_HEADER_LABEL_MAX_GAP_PT
    : tallTextFieldLeftLabel
      ? TALL_TEXT_FIELD_SIDE_LABEL_MAX_GAP_PT
      : SIDE_LABEL_MAX_GAP_PT;
  if (gap < -2 || gap > maxGap) return undefined;
  const centerDelta = Math.abs(centerY(field) - centerY(line));
  const maxCenterDelta = Math.max(7, Math.max(field.height, line.height) * 0.9);
  if (centerDelta > maxCenterDelta) return undefined;
  const inlineTextField =
    field.type === 'text' &&
    field.width <= INLINE_TEXT_FIELD_MAX_WIDTH_PT &&
    field.height <= INLINE_TEXT_FIELD_MAX_HEIGHT_PT;
  const sameRowTextCandidate =
    field.type === 'text' &&
    relation === 'left' &&
    centerDelta <= Math.max(4, field.height * 0.35) &&
    (line.fontSize ?? SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT) <= SAME_LINE_TEXT_PROMPT_MAX_FONT_SIZE_PT;
  const sameRowTextPrompt =
    sameRowTextCandidate &&
    (inlineTextField || isTrailingPromptFragment(text) || gap <= SAME_LINE_TEXT_PROMPT_MAX_GAP_PT);
  const scoreBase = sameRowTextPrompt || wideRowHeader ? Math.min(baseScore, 0) : baseScore;
  const scoreGapWeight = wideRowHeader
    ? Math.min(gapWeight, WIDE_ROW_HEADER_LABEL_GAP_WEIGHT)
    : sameRowTextPrompt
      ? Math.min(gapWeight, 0.45)
      : gapWeight;
  const wrappedChoiceContinuationPenalty =
    field.type !== 'text' &&
    relation === 'left' &&
    gap > SAME_LINE_TEXT_PROMPT_MAX_GAP_PT &&
    isLikelyWrappedContinuationText(text)
      ? 80
      : 0;
  const labelText = sameRowTextPrompt ? normalizePromptLabelText(text) : text;

  return {
    label: makeLabel(line, labelText, relation),
    line,
    text: labelText,
    relation,
    score:
      scoreBase +
      Math.max(0, gap) * scoreGapWeight +
      centerDelta * 2 +
      lengthPenalty(labelText) +
      wrappedChoiceContinuationPenalty,
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
  const closeSemanticAboveLabel =
    relation === 'above' && gap <= SAME_LINE_TEXT_PROMPT_MAX_GAP_PT && hasSemanticFieldNameMatch(field, text);
  if (fieldCoverage < SHORT_VERTICAL_LABEL_FIELD_COVERAGE && !edgeAligned && !closeSemanticAboveLabel) {
    return undefined;
  }

  const nearEdge =
    line.x <= field.x + field.width + 8 &&
    line.x + line.width >= field.x - 8 &&
    centerDelta <= Math.max(field.width, 1);
  if (
    overlap < MIN_HORIZONTAL_OVERLAP_RATIO &&
    fieldCoverage < MIN_HORIZONTAL_OVERLAP_RATIO &&
    !nearEdge &&
    !closeSemanticAboveLabel
  ) {
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
      (fieldCoverage >= WIDE_VERTICAL_LABEL_FIELD_COVERAGE ? 0 : lengthPenalty(text)) +
      (closeSemanticAboveLabel && fieldCoverage < SHORT_VERTICAL_LABEL_FIELD_COVERAGE
        ? NARROW_SEMANTIC_ABOVE_LABEL_PENALTY
        : 0) +
      (closeSemanticAboveLabel
        ? Math.max(0, field.x - line.x - SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_TOLERANCE_PT) *
          SEMANTIC_ABOVE_LABEL_LEFT_OFFSET_WEIGHT
        : 0),
  };
}

function expandStackedLabel(field: FormField, candidate: LabelCandidate, lines: readonly LabelLine[]): FormFieldLabel {
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

function expandSameLineMarkerPromptLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (field.type !== 'text' || candidate.relation !== 'left') return undefined;
  if (!isCompactFieldMarker(candidate.text)) return undefined;

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

function expandSideLabelContinuation(
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

function expandLeftTrailingPromptStack(
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

function collectTrailingPromptStack(
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

function collectSideLabelContinuationLines(
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
    const alreadyHasPromptText = connected.some((item) => !isDotLeaderText(item.text));
    if (alreadyHasPromptText && !isDotLeaderText(text) && gap > SAME_LINE_TEXT_PROMPT_MAX_GAP_PT) break;
    if (gap > SAME_LINE_MARKER_PROMPT_MAX_GAP_PT) break;
    connected.unshift({ line, text });
    boundaryX = line.x;
  }
  return connected;
}

function collectSameLineMarkerPromptStack(
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
    if (isBareNumericFieldMarker(markerText) && startsWithPromptItemMarker(next.text)) {
      return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
    }
    stack.push(next);
    if (startsWithPromptItemMarker(next.text)) return stack.sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
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
    if (candidate.relation === 'above' && isBroadStackedHeaderLine(text, bounds, line)) continue;
    if (!isStackCompatibleLine(candidate.line, bounds, line)) continue;

    const gap = candidate.relation === 'above' ? aboveStackLineGap(bounds, line) : line.y - (bounds.y + bounds.height);
    if (gap === undefined || gap < -1 || gap > STACKED_LABEL_MAX_GAP_PT) continue;
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

function isChoiceLikeField(field: FormField): boolean {
  return field.type === 'checkbox' || field.type === 'radio' || field.type === 'button';
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

function isFormLabelChromeText(text: string): boolean {
  return (
    /^(?:created|revised)\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/iu.test(text) ||
    /\bcat\.?\s+no\.?\s+[A-Z0-9-]+/iu.test(text) ||
    /^schedule\s+[A-Z0-9-]*\s*\(form\s+\d+/iu.test(text)
  );
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

function isBareNumericFieldMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  return /^\d+\s*\$?$/u.test(normalized);
}

function isTrailingPromptFragment(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  if (normalized.length > 60) return false;
  return /^(?:code|number|classification|name|address|date|amount|total|identifier)(?:\s*\([^)]{1,40}\))?\.?$/iu.test(
    normalized,
  );
}

function isLikelyWrappedContinuationText(text: string): boolean {
  return /^(?:[a-z]|and\b|or\b|the\b|this\b|that\b|otherwise\b)/u.test(normalizePromptLabelText(text));
}

function isWideRowHeaderLabelText(text: string): boolean {
  return /^(?:Document Title(?:\s+\d+)?(?:\s+\(if any\))?|Issuing Authority|Document Number(?:\s+\(if any\))?|Expiration Date(?:\s+\(if any\))?)$/iu.test(
    normalizePromptLabelText(text),
  );
}

function isFormSectionHeadingText(text: string): boolean {
  return /^(?:section|part)\s+(?:\d+|[ivxlcdm]+)\b[.:]?/iu.test(normalizePromptLabelText(text));
}

function startsWithPromptItemMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  return /^(?:\d+(?:\([a-z]\)|[a-z])?|\([a-z]\)|[a-z]\s+[A-Z])/u.test(normalized);
}

function isSemanticFieldNameMismatch(field: FormField, labelText: string): boolean {
  if (isChoiceLikeField(field) && isLikelyWrappedContinuationText(labelText)) return false;
  if (isCompactFieldMarker(labelText) || isBareNumericFieldMarker(labelText) || isTrailingPromptFragment(labelText)) {
    return false;
  }
  const tokens = semanticFieldNameTokens(field.name);
  if (!hasEnoughSemanticFieldNameTokens(tokens)) return false;
  return !labelTextMatchesFieldNameTokens(labelText, tokens);
}

function hasSemanticFieldNameMatch(field: FormField, labelText: string): boolean {
  const tokens = semanticFieldNameTokens(field.name);
  if (!hasEnoughSemanticFieldNameTokens(tokens)) return false;
  return labelTextMatchesFieldNameTokens(labelText, tokens);
}

function hasEnoughSemanticFieldNameTokens(tokens: readonly string[]): boolean {
  return (
    tokens.length >= MIN_SEMANTIC_FIELD_NAME_TOKENS ||
    tokens.some((token) => STRONG_SINGLE_FIELD_NAME_TOKENS.has(token))
  );
}

function labelTextMatchesFieldNameTokens(labelText: string, tokens: readonly string[]): boolean {
  const label = normalizePromptLabelText(labelText).toLocaleLowerCase();
  if (tokens.includes('dob') && /\b(?:mm|dd|yyyy|date)\b/iu.test(label)) return true;
  return tokens.some((token) => label.includes(token));
}

function semanticFieldNameTokens(name: string): string[] {
  if (/[\][.]/u.test(name)) return [];
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of spaced.split(/[^\p{Letter}\p{Number}]+/u)) {
    const token = raw.toLocaleLowerCase();
    if (token.length < FIELD_NAME_TOKEN_MIN_CHARS) continue;
    if (FIELD_NAME_STOP_WORDS.has(token)) continue;
    if (/^\d+$/u.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
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
