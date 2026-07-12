export interface OpaqueFillTextOps {
  save: number;
  restore: number;
  transform: number;
  formBegin: number;
  formEnd: number;
  beginGroup: number;
  endGroup: number;
  beginAnnotation: number;
  endAnnotation: number;
  beginMarkedContent: number;
  beginMarkedContentProps: number;
  endMarkedContent: number;
  setGState: number;
  setFillTransparent: number;
  constructPath: number;
  clipOps: ReadonlySet<number>;
  fillColorOps: ReadonlySet<number>;
  pathFillOps: ReadonlySet<number>;
  textShowOps: ReadonlySet<number>;
}

export interface OpaqueDarkFillEvidence {
  x: number;
  y: number;
  width: number;
  height: number;
  precedingTextRunCount: number;
}

export interface OpaqueFillTextEvidence {
  textRuns: string[];
  fills: OpaqueDarkFillEvidence[];
}

type Matrix6 = [number, number, number, number, number, number];
type Quad = [number, number, number, number];

interface GraphicsState {
  ctm: Matrix6;
  fillColor: string | undefined;
  fillAlpha: number;
  normalBlendMode: boolean;
  fillTransparent: boolean;
  softMaskActive: boolean;
  clipActive: boolean;
}

const MIN_FILL_ALPHA = 0.9;
const MAX_DARK_LUMINANCE = 0.2;
const MAX_RECTANGLE_PATH_NUMBERS = 16;
const MAX_EVIDENCE_TEXT_RUNS = 4_096;
const MAX_EVIDENCE_TEXT_CODE_UNITS = 65_536;
const MAX_EVIDENCE_FILLS = 4_096;

export function collectOpaqueFillTextEvidence(
  fnArray: readonly number[],
  argsArray: readonly unknown[][],
  ops: OpaqueFillTextOps,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): OpaqueFillTextEvidence | undefined {
  const textRuns: string[] = [];
  const fills: OpaqueDarkFillEvidence[] = [];
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let fillColor: string | undefined = '#000000';
  let fillAlpha = 1;
  let normalBlendMode = true;
  let fillTransparent = false;
  let softMaskActive = false;
  let clipActive = false;
  let annotationDepth = 0;
  let groupDepth = 0;
  let optionalContentDepth = 0;
  let textCodeUnits = 0;
  const stack: GraphicsState[] = [];
  const groupSoftMaskStack: boolean[] = [];
  const markedContentStack: boolean[] = [];

  const pushState = (): void => {
    stack.push({
      ctm: [...ctm] as Matrix6,
      fillColor,
      fillAlpha,
      normalBlendMode,
      fillTransparent,
      softMaskActive,
      clipActive,
    });
  };
  const popState = (): void => {
    const restored = stack.pop();
    if (!restored) return;
    ctm = restored.ctm;
    fillColor = restored.fillColor;
    fillAlpha = restored.fillAlpha;
    normalBlendMode = restored.normalBlendMode;
    fillTransparent = restored.fillTransparent;
    softMaskActive = restored.softMaskActive;
    clipActive = restored.clipActive;
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === ops.beginMarkedContent || fn === ops.beginMarkedContentProps) {
      const optionalContent = args?.[0] === 'OC';
      markedContentStack.push(optionalContent);
      if (optionalContent) optionalContentDepth++;
      continue;
    }
    if (fn === ops.endMarkedContent) {
      if (markedContentStack.pop()) optionalContentDepth = Math.max(0, optionalContentDepth - 1);
      continue;
    }

    if (fn === ops.beginAnnotation) {
      annotationDepth++;
      continue;
    }
    if (fn === ops.endAnnotation) {
      annotationDepth = Math.max(0, annotationDepth - 1);
      continue;
    }
    if (annotationDepth > 0) continue;

    if (fn === ops.beginGroup) {
      groupDepth++;
      groupSoftMaskStack.push(softMaskActive);
      if (isSoftMaskDefinitionGroup(args?.[0])) softMaskActive = true;
    } else if (fn === ops.endGroup) {
      groupDepth = Math.max(0, groupDepth - 1);
      softMaskActive = groupSoftMaskStack.pop() ?? softMaskActive;
    } else if (fn === ops.save) {
      pushState();
    } else if (fn === ops.restore) {
      popState();
    } else if (fn === ops.transform) {
      const matrix = matrix6(args);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === ops.formBegin) {
      pushState();
      const matrix = matrix6(args?.[0]);
      if (matrix) ctm = multiply(ctm, matrix);
      if (numericQuad(args?.[1])) clipActive = true;
    } else if (fn === ops.formEnd) {
      popState();
    } else if (fn === ops.setGState) {
      const alpha = nonstrokingAlpha(args?.[0]);
      if (alpha !== undefined) fillAlpha = alpha;
      const blendMode = isNormalBlendMode(args?.[0]);
      if (blendMode !== undefined) normalBlendMode = blendMode;
      const softMask = hasSoftMask(args?.[0]);
      if (softMask !== undefined) softMaskActive = softMask;
    } else if (fn === ops.setFillTransparent) {
      fillTransparent = true;
      fillColor = undefined;
    } else if (ops.fillColorOps.has(fn)) {
      fillTransparent = false;
      fillColor = fillColorValue(args);
    } else if (ops.textShowOps.has(fn)) {
      const text = operatorText(args);
      if (normalizeComparableText(text).length > 0) {
        textCodeUnits += text.length;
        if (textRuns.length >= MAX_EVIDENCE_TEXT_RUNS || textCodeUnits > MAX_EVIDENCE_TEXT_CODE_UNITS) {
          return undefined;
        }
        textRuns.push(text);
      }
    } else if (ops.clipOps.has(fn)) {
      clipActive = true;
    } else if (fn === ops.constructPath) {
      const pathOp = args?.[0];
      if (typeof pathOp === 'number' && ops.clipOps.has(pathOp)) {
        clipActive = true;
        continue;
      }
      if (
        typeof pathOp !== 'number' ||
        !ops.pathFillOps.has(pathOp) ||
        !isAxisAlignedTransform(ctm) ||
        fillAlpha < MIN_FILL_ALPHA ||
        fillAlpha > 1 ||
        !normalBlendMode ||
        fillTransparent ||
        softMaskActive ||
        clipActive ||
        groupDepth > 0 ||
        optionalContentDepth > 0 ||
        !isDarkColor(fillColor)
      ) {
        continue;
      }
      const rectangle = rectanglePathBox(args?.[1]);
      if (!rectangle) continue;
      const box = bboxToTopLeftBox(rectangle, ctm, pageHeight, viewMinX, viewMinY);
      if (!isPositiveFiniteBox(box)) continue;
      if (fills.length >= MAX_EVIDENCE_FILLS) return undefined;
      fills.push({ ...box, precedingTextRunCount: textRuns.length });
    }
  }

  const laterFills = fills.filter((fill) => fill.precedingTextRunCount > 0);
  if (laterFills.length === 0) return undefined;
  return { textRuns, fills: laterFills };
}

export function normalizeComparableText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function operatorText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(operatorText).join('');
  if (!value || typeof value !== 'object') return '';
  const unicode = (value as { unicode?: unknown }).unicode;
  return typeof unicode === 'string' ? unicode : '';
}

function fillColorValue(args: readonly unknown[] | undefined): string | undefined {
  const value = args?.[0];
  return typeof value === 'string' ? value.toLowerCase() : undefined;
}

function isDarkColor(value: string | undefined): boolean {
  const rgb = parseHexColor(value);
  if (!rgb) return false;
  const [red, green, blue] = rgb.map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue <= MAX_DARK_LUMINANCE;
}

function parseHexColor(value: string | undefined): [number, number, number] | undefined {
  if (!value) return undefined;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/iu.exec(value);
  if (short) {
    return [
      Number.parseInt(short[1] + short[1], 16),
      Number.parseInt(short[2] + short[2], 16),
      Number.parseInt(short[3] + short[3], 16),
    ];
  }
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(value);
  if (!full) return undefined;
  return [Number.parseInt(full[1], 16), Number.parseInt(full[2], 16), Number.parseInt(full[3], 16)];
}

function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function nonstrokingAlpha(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (!Array.isArray(entry) || entry[0] !== 'ca') continue;
    const alpha = entry[1];
    if (typeof alpha === 'number' && Number.isFinite(alpha)) return alpha;
  }
  return undefined;
}

function isNormalBlendMode(value: unknown): boolean | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (!Array.isArray(entry) || entry[0] !== 'BM') continue;
    return entry[1] === 'Normal' || entry[1] === 'source-over';
  }
  return undefined;
}

function hasSoftMask(value: unknown): boolean | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (!Array.isArray(entry) || entry[0] !== 'SMask') continue;
    return entry[1] !== false;
  }
  return undefined;
}

function isSoftMaskDefinitionGroup(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { smask?: unknown }).smask);
}

function numericQuad(value: unknown): Quad | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as ArrayLike<unknown>;
  if (candidate.length < 4) return undefined;
  const quad = [candidate[0], candidate[1], candidate[2], candidate[3]];
  return quad.every((item) => typeof item === 'number' && Number.isFinite(item)) ? (quad as Quad) : undefined;
}

/**
 * pdf.js encodes path geometry in constructPath args[1] using DrawOPS:
 * moveTo=0, lineTo=1, curveTo=2, quadraticCurveTo=3, closePath=4.
 * Only a single axis-aligned rectangle proves that its whole bbox is painted
 * (fill operations implicitly close an open subpath). Complex paths can
 * contain holes or disconnected subpaths, so their aggregate bbox is not
 * positive coverage evidence. The longest accepted encoding is 16 numbers:
 * moveTo, four lineTo commands (the last repeats the start), and closePath.
 */
function rectanglePathBox(value: unknown): Quad | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const data = arrayLikeNumbers(value[0]);
  if (!data) return undefined;

  const points: Array<readonly [number, number]> = [];
  let pathEnded = false;
  for (let i = 0; i < data.length; ) {
    const command = data[i++];
    if (command === 0 || command === 1) {
      if (pathEnded || i + 1 >= data.length || (command === 0 && points.length > 0)) return undefined;
      const x = data[i++];
      const y = data[i++];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
      points.push([x, y]);
      continue;
    }
    if (command === 4) {
      pathEnded = true;
      continue;
    }
    return undefined;
  }

  if (points.length === 5 && samePoint(points[0], points[4])) points.pop();
  if (points.length !== 4) return undefined;

  const xs = [...new Set(points.map(([x]) => x))];
  const ys = [...new Set(points.map(([, y]) => y))];
  const corners = new Set(points.map(([x, y]) => `${x},${y}`));
  if (xs.length !== 2 || ys.length !== 2 || corners.size !== 4) return undefined;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (samePoint(current, next) || (current[0] !== next[0] && current[1] !== next[1])) return undefined;
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return maxX > minX && maxY > minY ? [minX, minY, maxX, maxY] : undefined;
}

function arrayLikeNumbers(value: unknown): number[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as ArrayLike<unknown>;
  const { length } = candidate;
  if (!Number.isInteger(length) || length <= 0 || length > MAX_RECTANGLE_PATH_NUMBERS) {
    return undefined;
  }
  const data = Array.from(candidate);
  return data.every((item): item is number => typeof item === 'number') ? data : undefined;
}

function samePoint(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function isAxisAlignedTransform([a, b, c, d]: Matrix6): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const nearZero = (value: number): boolean => Math.abs(value) <= Number.EPSILON * scale * 16;
  return (nearZero(b) && nearZero(c)) || (nearZero(a) && nearZero(d));
}

function multiply(ctm: Matrix6, matrix: Matrix6): Matrix6 {
  return [
    ctm[0] * matrix[0] + ctm[2] * matrix[1],
    ctm[1] * matrix[0] + ctm[3] * matrix[1],
    ctm[0] * matrix[2] + ctm[2] * matrix[3],
    ctm[1] * matrix[2] + ctm[3] * matrix[3],
    ctm[0] * matrix[4] + ctm[2] * matrix[5] + ctm[4],
    ctm[1] * matrix[4] + ctm[3] * matrix[5] + ctm[5],
  ];
}

function matrix6(value: unknown): Matrix6 | undefined {
  if (!Array.isArray(value) || value.length !== 6) return undefined;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return value as Matrix6;
}

function bboxToTopLeftBox(
  bbox: Quad,
  ctm: Matrix6,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): { x: number; y: number; width: number; height: number } {
  const [x1, y1, x2, y2] = bbox;
  const [a, b, c, d, e, f] = ctm;
  const corners = [
    [x1, y1],
    [x2, y1],
    [x1, y2],
    [x2, y2],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX - viewMinX,
    y: pageHeight - (maxY - viewMinY),
    width: maxX - minX,
    height: maxY - minY,
  };
}

function isPositiveFiniteBox(box: { x: number; y: number; width: number; height: number }): boolean {
  return (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}
