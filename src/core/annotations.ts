import type {
  PageAnnotation,
  PageAnnotationBox,
  PageAnnotationFileAttachment,
  PageAnnotationFlag,
} from '../types/index.js';

interface PdfAnnotation {
  subtype?: unknown;
  rect?: unknown;
  contentsObj?: { str?: unknown };
  titleObj?: { str?: unknown };
  color?: unknown;
  modificationDate?: unknown;
  hasAppearance?: unknown;
  quadPoints?: unknown;
  file?: unknown;
  annotationFlags?: unknown;
}

interface PdfFileAttachment {
  filename?: unknown;
  rawFilename?: unknown;
  description?: unknown;
  content?: unknown;
}

interface BuildAnnotationsOptions {
  normalizeText?: (value: string) => string;
}

const EXCLUDED_SUBTYPES = new Set(['Link', 'Widget', 'Popup']);
const ANNOTATION_FLAGS: { bit: number; name: PageAnnotationFlag }[] = [
  { bit: 1, name: 'invisible' },
  { bit: 2, name: 'hidden' },
  { bit: 4, name: 'print' },
  { bit: 8, name: 'noZoom' },
  { bit: 16, name: 'noRotate' },
  { bit: 32, name: 'noView' },
  { bit: 64, name: 'readOnly' },
  { bit: 128, name: 'locked' },
  { bit: 256, name: 'toggleNoView' },
  { bit: 512, name: 'lockedContents' },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildAnnotations(
  annotations: readonly unknown[],
  pageHeight: number,
  viewMinX = 0,
  viewMinY = 0,
  options: BuildAnnotationsOptions = {},
): PageAnnotation[] {
  const out: PageAnnotation[] = [];
  for (const annotation of annotations) {
    const ann = annotation as PdfAnnotation;
    if (typeof ann.subtype !== 'string' || EXCLUDED_SUBTYPES.has(ann.subtype)) continue;
    if (!Array.isArray(ann.rect) || ann.rect.length < 4 || !ann.rect.every((v) => typeof v === 'number')) continue;

    const baseBox = rectToBox(ann.rect as [number, number, number, number], pageHeight, viewMinX, viewMinY);
    const contents = textValue(ann.contentsObj?.str, options.normalizeText);
    const title = textValue(ann.titleObj?.str, options.normalizeText);
    const color = colorValue(ann.color);
    const quadBoxes = quadPointBoxes(ann.quadPoints, pageHeight, viewMinX, viewMinY);
    const fileAttachment = fileAttachmentValue(ann.file, options.normalizeText);
    const flags = annotationFlagNames(ann.annotationFlags);

    out.push({
      subtype: ann.subtype,
      ...(contents !== undefined && { contents }),
      ...(title !== undefined && { title }),
      ...(color !== undefined && { color }),
      ...(typeof ann.modificationDate === 'string' && { modified: ann.modificationDate }),
      ...(typeof ann.hasAppearance === 'boolean' && { hasAppearance: ann.hasAppearance }),
      ...(fileAttachment !== undefined && { fileAttachment }),
      ...(flags.length > 0 && { flags }),
      ...baseBox,
      ...(quadBoxes.length > 0 && { quadBoxes }),
    });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x || a.subtype.localeCompare(b.subtype));
}

function rectToBox(
  rect: [number, number, number, number],
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationBox {
  const [x1, y1, x2, y2] = rect;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return {
    x: round2(minX - viewMinX),
    y: round2(pageHeight - (maxY - viewMinY)),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function textValue(value: unknown, normalizeText: ((value: string) => string) | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return normalizeText ? normalizeText(value) : value;
}

function colorValue(value: unknown): [number, number, number] | undefined {
  const values = numericArrayLike(value, 3);
  if (!values) return undefined;
  return [Math.round(values[0]), Math.round(values[1]), Math.round(values[2])];
}

export function annotationFlagNames(value: unknown): PageAnnotationFlag[] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return [];
  return ANNOTATION_FLAGS.filter(({ bit }) => (value & bit) !== 0).map(({ name }) => name);
}

function fileAttachmentValue(
  value: unknown,
  normalizeText: ((value: string) => string) | undefined,
): PageAnnotationFileAttachment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const file = value as PdfFileAttachment;
  const name = textValue(file.filename, normalizeText) ?? textValue(file.rawFilename, normalizeText);
  if (!name) return undefined;

  const size = binaryLength(file.content);
  if (size === undefined) return undefined;

  const description = textValue(file.description, normalizeText);
  return {
    name,
    size,
    ...(description !== undefined && { description }),
  };
}

function binaryLength(value: unknown): number | undefined {
  if (value instanceof Uint8Array) return value.length;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  return undefined;
}

function quadPointBoxes(value: unknown, pageHeight: number, viewMinX: number, viewMinY: number): PageAnnotationBox[] {
  const values = numericArrayLike(value);
  if (!values || values.length < 8) return [];

  const boxes: PageAnnotationBox[] = [];
  for (let i = 0; i + 7 < values.length; i += 8) {
    const xs = [values[i], values[i + 2], values[i + 4], values[i + 6]];
    const ys = [values[i + 1], values[i + 3], values[i + 5], values[i + 7]];
    boxes.push(
      rectToBox([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], pageHeight, viewMinX, viewMinY),
    );
  }
  return boxes;
}

function numericArrayLike(value: unknown, minLength = 0): number[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as ArrayLike<unknown>;
  const length = typeof maybe.length === 'number' ? maybe.length : Object.keys(value).length;
  if (length < minLength) return undefined;

  const values: number[] = [];
  for (let i = 0; i < length; i++) {
    const v = maybe[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    values.push(v);
  }
  return values;
}
