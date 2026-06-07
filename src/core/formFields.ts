import type { FormField, FormFieldType } from '../types/index.js';

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildFormFields(
  annotations: readonly unknown[],
  pageHeight: number,
  viewMinX = 0,
  viewMinY = 0,
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

    fields.push({
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
    });
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
