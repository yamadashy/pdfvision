import type { FormField, FormFieldChoiceOption, FormFieldResetFormAction, FormFieldType } from '../../types/index.js';
import { annotationFlagNames } from '../annotations/index.js';
import { normalizeJavaScriptActions } from '../document/viewer.js';
import { findFieldLabel, type LabelLine } from './labels.js';

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
