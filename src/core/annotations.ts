import type {
  PageAnnotation,
  PageAnnotationBorder,
  PageAnnotationFileAttachment,
  PageAnnotationFlag,
  PageAnnotationLine,
} from '../types/index.js';
import {
  inkPathsValue,
  numericArrayLike,
  pointsValue,
  pointToTopLeft,
  quadPointBoxes,
  rectToBox,
  round2,
} from './annotations/geometry.js';

interface PdfAnnotation {
  subtype?: unknown;
  name?: unknown;
  rect?: unknown;
  contentsObj?: { str?: unknown };
  titleObj?: { str?: unknown };
  color?: unknown;
  modificationDate?: unknown;
  hasAppearance?: unknown;
  quadPoints?: unknown;
  borderStyle?: unknown;
  lineCoordinates?: unknown;
  lineEndings?: unknown;
  vertices?: unknown;
  inkLists?: unknown;
  file?: unknown;
  annotationFlags?: unknown;
}

interface PdfAnnotationBorderStyle {
  width?: unknown;
  style?: unknown;
  dashArray?: unknown;
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

const BORDER_STYLES: Record<number, string> = {
  1: 'solid',
  2: 'dashed',
  3: 'beveled',
  4: 'inset',
  5: 'underline',
};

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
    const name = textValue(ann.name, options.normalizeText);
    const contents = textValue(ann.contentsObj?.str, options.normalizeText);
    const title = textValue(ann.titleObj?.str, options.normalizeText);
    const color = colorValue(ann.color);
    const quadBoxes = quadPointBoxes(ann.quadPoints, pageHeight, viewMinX, viewMinY);
    const border = borderStyleValue(ann.borderStyle);
    const line = lineValue(ann.lineCoordinates, ann.lineEndings, pageHeight, viewMinX, viewMinY);
    const vertices = pointsValue(ann.vertices, pageHeight, viewMinX, viewMinY);
    const inkPaths = inkPathsValue(ann.inkLists, pageHeight, viewMinX, viewMinY);
    const fileAttachment = fileAttachmentValue(ann.file, options.normalizeText);
    const flags = annotationFlagNames(ann.annotationFlags);

    out.push({
      subtype: ann.subtype,
      ...(name !== undefined && { name }),
      ...(contents !== undefined && { contents }),
      ...(title !== undefined && { title }),
      ...(color !== undefined && { color }),
      ...(typeof ann.modificationDate === 'string' && { modified: ann.modificationDate }),
      ...(typeof ann.hasAppearance === 'boolean' && { hasAppearance: ann.hasAppearance }),
      ...(fileAttachment !== undefined && { fileAttachment }),
      ...(flags.length > 0 && { flags }),
      ...(border !== undefined && { border }),
      ...baseBox,
      ...(quadBoxes.length > 0 && { quadBoxes }),
      ...(line !== undefined && { line }),
      ...(vertices.length > 0 && { vertices }),
      ...(inkPaths.length > 0 && { inkPaths }),
    });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x || a.subtype.localeCompare(b.subtype));
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

export function hasVisibleAnnotationAppearance(annotations: readonly unknown[]): boolean {
  for (const annotation of annotations) {
    const ann = annotation as PdfAnnotation;
    if (typeof ann.subtype !== 'string' || ann.subtype === 'Popup' || ann.subtype === 'Link') continue;
    if (ann.hasAppearance !== true) continue;
    const flags = annotationFlagNames(ann.annotationFlags);
    if (flags.some((flag) => flag === 'invisible' || flag === 'hidden' || flag === 'noView')) continue;
    return true;
  }
  return false;
}

function borderStyleValue(value: unknown): PageAnnotationBorder | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const border = value as PdfAnnotationBorderStyle;
  const out: PageAnnotationBorder = {};

  if (typeof border.width !== 'number' || !Number.isFinite(border.width) || border.width <= 0) return undefined;
  out.width = round2(border.width);
  if (typeof border.style === 'number' && Number.isFinite(border.style)) {
    out.style = BORDER_STYLES[border.style] ?? String(border.style);
  } else if (typeof border.style === 'string' && border.style.length > 0) {
    out.style = border.style;
  }

  const dashArray = numericArrayLike(border.dashArray);
  if (dashArray && dashArray.length > 0) {
    out.dashArray = dashArray.map(round2);
  }

  return out;
}

function lineValue(
  coordinates: unknown,
  endings: unknown,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): PageAnnotationLine | undefined {
  const values = numericArrayLike(coordinates, 4);
  if (!values) return undefined;
  const lineEndings = lineEndingsValue(endings);
  return {
    from: pointToTopLeft(values[0], values[1], pageHeight, viewMinX, viewMinY),
    to: pointToTopLeft(values[2], values[3], pageHeight, viewMinX, viewMinY),
    ...(lineEndings !== undefined && { endings: lineEndings }),
  };
}

function lineEndingsValue(value: unknown): [string, string] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const start = value[0];
  const end = value[1];
  if (typeof start !== 'string' || typeof end !== 'string') return undefined;
  return [start, end];
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
