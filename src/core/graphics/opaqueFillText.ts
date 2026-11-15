import {
  type BackgroundHistory,
  backgroundColorAt,
  createBackgroundHistory,
  hasCandidateBackground,
  recordPaint,
  recordUnboundedPaint,
} from './backgroundPaints.js';
import { isDarkColor, isIndistinguishable, parseHexColor, type Rgb } from './paintColor.js';
import { numericQuad, type Quad, rectanglePathBox } from './rectanglePath.js';
import {
  advanceRun,
  applyTextStateOp,
  cloneTextState,
  type FontGeometryResolver,
  type GlyphGeometry,
  initialTextState,
  type Matrix6,
  multiply,
  type PageBox,
  placeRunGlyphs,
  type RunPlacement,
  type TextGlyphOps,
  type TextState,
  toPageBox,
} from './textGlyphs.js';

export interface OpaqueFillTextOps extends TextGlyphOps {
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
  /** Path paints that stroke. */
  pathStrokeOps?: ReadonlySet<number>;
  setLineWidth?: number;
  setTextRenderingMode?: number;
  /** Paints whose extent is the current clip (`sh`) or otherwise not bounded by path data. */
  unboundedPaintOps?: ReadonlySet<number>;
}

export interface OpaqueDarkFillEvidence {
  x: number;
  y: number;
  width: number;
  height: number;
  precedingTextRunCount: number;
}

export interface TextGlyphEvidence extends GlyphGeometry {
  /**
   * The glyph was filled in a colour that, after alpha compositing, cannot
   * be told apart from the known paint (or blank page) behind it.
   */
  matchesBackground?: boolean;
}

export interface OpaqueFillTextEvidence {
  textRuns: string[];
  fills: OpaqueDarkFillEvidence[];
  /**
   * Glyph geometry parallel to `textRuns`; an undefined entry is a run whose
   * glyphs could not be placed. Present only when at least one run was placed.
   */
  glyphRuns?: Array<TextGlyphEvidence[] | undefined>;
}

interface GraphicsState {
  ctm: Matrix6;
  fillColor: string | undefined;
  fillAlpha: number;
  normalBlendMode: boolean;
  fillTransparent: boolean;
  softMaskActive: boolean;
  clipActive: boolean;
  lineWidth: number;
  renderingMode: number;
  text: TextState;
}

const MIN_FILL_ALPHA = 0.9;
const MIN_OPAQUE_BACKGROUND_ALPHA = 0.99;
const MAX_EVIDENCE_TEXT_RUNS = 4_096;
const MAX_EVIDENCE_TEXT_CODE_UNITS = 65_536;
const MAX_EVIDENCE_FILLS = 4_096;
const MAX_RUN_REGION_CHECKS = 2_000_000;
/** Fill and fill+clip; stroke modes depend on a stroke colour, Tr 3/7 is `invisible_text`. */
const FILL_ONLY_RENDERING_MODES = new Set([0, 4]);

/**
 * One pass over the page operator list collecting two kinds of evidence
 * that native text is not what a reader sees:
 *
 * - opaque dark rectangles painted after text (`fills`), matched against
 *   the text runs or glyphs painted before them;
 * - glyphs filled in the colour of the known paint behind them
 *   (`matchesBackground`), e.g. white text on a white page.
 */
export function collectOpaqueFillTextEvidence(
  fnArray: readonly number[],
  argsArray: readonly unknown[][],
  ops: OpaqueFillTextOps,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
  resolveFont?: FontGeometryResolver,
): OpaqueFillTextEvidence | undefined {
  const textRuns: string[] = [];
  const glyphRuns: Array<TextGlyphEvidence[] | undefined> = [];
  const runPlacements: Array<RunPlacement | undefined> = [];
  const candidateColors = new Map<string, boolean>();
  const fills: OpaqueDarkFillEvidence[] = [];
  const background: BackgroundHistory = createBackgroundHistory();
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let fillColor: string | undefined = '#000000';
  let fillAlpha = 1;
  let normalBlendMode = true;
  let fillTransparent = false;
  let softMaskActive = false;
  let clipActive = false;
  let lineWidth = 1;
  let renderingMode = 0;
  let text = initialTextState();
  let annotationDepth = 0;
  let groupDepth = 0;
  let optionalContentDepth = 0;
  let textCodeUnits = 0;
  let placedRuns = 0;
  let matchedBackground = false;
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
      lineWidth,
      renderingMode,
      text: cloneTextState(text),
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
    lineWidth = restored.lineWidth;
    renderingMode = restored.renderingMode;
    text = restored.text;
  };
  const pageBox = (bbox: Quad): PageBox => toPageBox(bbox, ctm, pageHeight, viewMinX, viewMinY);

  /**
   * The text fill colour when a glyph shown now could be indistinguishable
   * from what is behind it; undefined when the paint state makes that
   * unanswerable (stroke modes, patterns, non-normal blending, soft masks,
   * optional content) or no candidate background has a matching colour.
   */
  const backgroundMatchCandidateColor = (): Rgb | undefined => {
    if (
      !FILL_ONLY_RENDERING_MODES.has(renderingMode) ||
      fillTransparent ||
      !normalBlendMode ||
      softMaskActive ||
      optionalContentDepth > 0 ||
      background.exhausted
    ) {
      return undefined;
    }
    const color = parseHexColor(fillColor);
    if (!color) return undefined;
    // Most pages show thousands of runs in a handful of colours; the answer
    // only changes when a new known-colour paint is recorded.
    const key = `${fillColor}|${fillAlpha}`;
    let candidate = candidateColors.get(key);
    if (candidate === undefined) {
      candidate = hasCandidateBackground(background, (behind) => isIndistinguishable(color, fillAlpha, behind));
      candidateColors.set(key, candidate);
    }
    return candidate ? color : undefined;
  };

  const recordFillBackground = (rectangle: Quad | undefined, minMax: unknown): void => {
    if (fillTransparent || fillAlpha <= 0) return;
    const color = parseHexColor(fillColor);
    const known =
      color !== undefined &&
      isAxisAlignedTransform(ctm) &&
      fillAlpha >= MIN_OPAQUE_BACKGROUND_ALPHA &&
      normalBlendMode &&
      !softMaskActive &&
      !clipActive &&
      groupDepth === 0 &&
      optionalContentDepth === 0;
    if (rectangle && known) {
      recordPaint(background, pageBox(rectangle), color);
      candidateColors.clear();
      return;
    }
    const bounds = rectangle ?? numericQuad(minMax);
    if (bounds) recordPaint(background, pageBox(bounds));
    else recordUnboundedPaint(background);
  };

  const recordStrokeBackground = (rectangle: Quad | undefined, minMax: unknown): void => {
    const half = Math.max(lineWidth, 1) / 2;
    const expanded = ([x1, y1, x2, y2]: Quad): Quad => [x1 - half, y1 - half, x2 + half, y2 + half];
    if (rectangle) {
      // A stroked rectangle paints only its outline, so text inside a ruled
      // cell keeps a known background.
      const [x1, y1, x2, y2] = rectangle;
      for (const edge of [
        [x1, y1, x2, y1],
        [x1, y2, x2, y2],
        [x1, y1, x1, y2],
        [x2, y1, x2, y2],
      ] as Quad[]) {
        recordPaint(background, pageBox(expanded(edge)));
      }
      return;
    }
    const bounds = numericQuad(minMax);
    if (bounds) recordPaint(background, pageBox(expanded(bounds)));
    else recordUnboundedPaint(background);
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

    if (applyTextStateOp(text, fn, args, ops)) continue;

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
      const alpha = gStateNumber(args?.[0], 'ca');
      if (alpha !== undefined) fillAlpha = alpha;
      const blendMode = isNormalBlendMode(args?.[0]);
      if (blendMode !== undefined) normalBlendMode = blendMode;
      const softMask = hasSoftMask(args?.[0]);
      if (softMask !== undefined) softMaskActive = softMask;
      const width = gStateNumber(args?.[0], 'LW');
      if (width !== undefined) lineWidth = width;
    } else if (fn === ops.setLineWidth) {
      const width = args?.[0];
      if (typeof width === 'number' && Number.isFinite(width)) lineWidth = width;
    } else if (fn === ops.setTextRenderingMode) {
      const mode = args?.[0];
      if (typeof mode === 'number' && Number.isFinite(mode)) renderingMode = mode;
    } else if (fn === ops.setFillTransparent) {
      fillTransparent = true;
      fillColor = undefined;
    } else if (ops.fillColorOps.has(fn)) {
      fillTransparent = false;
      fillColor = fillColorValue(args);
    } else if (ops.textShowOps.has(fn)) {
      const run = operatorText(args);
      const placement = advanceRun(text, args?.[0], ctm, resolveFont, pageHeight, viewMinX, viewMinY);
      if (normalizeComparableText(run).length === 0) continue;
      textCodeUnits += run.length;
      if (textRuns.length >= MAX_EVIDENCE_TEXT_RUNS || textCodeUnits > MAX_EVIDENCE_TEXT_CODE_UNITS) {
        return undefined;
      }
      textRuns.push(run);
      runPlacements.push(placement);
      glyphRuns.push(undefined);
      if (!placement) continue;
      placedRuns++;
      const textColor = backgroundMatchCandidateColor();
      if (!textColor) continue;
      // The paint behind the glyphs is only known now, so a candidate run is placed immediately.
      const glyphs: TextGlyphEvidence[] = placeRunGlyphs(placement, pageHeight, viewMinX, viewMinY);
      glyphRuns[glyphRuns.length - 1] = glyphs;
      const behindRun = backgroundColorAt(background, placement.box);
      for (const glyph of glyphs) {
        if (glyph.whitespace) continue;
        const behind = behindRun ?? backgroundColorAt(background, glyph.core);
        if (behind && isIndistinguishable(textColor, fillAlpha, behind)) {
          glyph.matchesBackground = true;
          matchedBackground = true;
        }
      }
    } else if (ops.clipOps.has(fn)) {
      clipActive = true;
    } else if (ops.unboundedPaintOps?.has(fn)) {
      recordUnboundedPaint(background);
    } else if (fn === ops.constructPath) {
      const pathOp = args?.[0];
      if (typeof pathOp === 'number' && ops.clipOps.has(pathOp)) {
        clipActive = true;
        continue;
      }
      if (typeof pathOp !== 'number') continue;
      const filled = ops.pathFillOps.has(pathOp);
      const stroked = ops.pathStrokeOps?.has(pathOp) ?? false;
      if (!filled && !stroked) continue;
      const rectangle = rectanglePathBox(args?.[1]);
      if (filled) recordFillBackground(rectangle, args?.[2]);
      if (stroked) recordStrokeBackground(rectangle, args?.[2]);
      if (
        !filled ||
        !rectangle ||
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
      const box = pageBox(rectangle);
      if (!isPositiveFiniteBox(box)) continue;
      if (fills.length >= MAX_EVIDENCE_FILLS) return undefined;
      fills.push({ ...box, precedingTextRunCount: textRuns.length });
    }
  }

  // A history that ran out of budget part-way cannot vouch for earlier answers either.
  const backgroundMatches = matchedBackground && !background.exhausted;
  if (matchedBackground && !backgroundMatches) clearBackgroundMatches(glyphRuns);
  const laterFills = fills.filter((fill) => fill.precedingTextRunCount > 0);
  if (laterFills.length === 0 && !backgroundMatches) return undefined;
  if (placedRuns > 0) {
    placeRunsNear(
      [...laterFills, ...(backgroundMatches ? matchedGlyphBoxes(glyphRuns) : [])],
      runPlacements,
      glyphRuns,
      pageHeight,
      viewMinX,
      viewMinY,
    );
  }
  return {
    textRuns,
    fills: laterFills,
    ...(placedRuns > 0 && { glyphRuns }),
  };
}

/**
 * Place the glyphs of every run whose box touches a region the warnings
 * will examine — a later dark fill, or a background-matching glyph (for
 * the repainted-on-top check). Other placeable runs get an empty glyph
 * list: they cannot change either warning, and leaving them `undefined`
 * would wrongly send their text to the whole-span fallback.
 */
function placeRunsNear(
  regions: readonly PageBox[],
  runPlacements: ReadonlyArray<RunPlacement | undefined>,
  glyphRuns: Array<TextGlyphEvidence[] | undefined>,
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
): void {
  const placeAll = regions.length * runPlacements.length > MAX_RUN_REGION_CHECKS;
  for (let i = 0; i < runPlacements.length; i++) {
    const placement = runPlacements[i];
    if (!placement || glyphRuns[i]) continue;
    const near = placeAll || regions.some((region) => boxesTouch(region, placement.box));
    glyphRuns[i] = near ? placeRunGlyphs(placement, pageHeight, viewMinX, viewMinY) : [];
  }
}

function matchedGlyphBoxes(glyphRuns: ReadonlyArray<TextGlyphEvidence[] | undefined>): PageBox[] {
  const boxes: PageBox[] = [];
  for (const run of glyphRuns) for (const glyph of run ?? []) if (glyph.matchesBackground) boxes.push(glyph.box);
  return boxes;
}

function boxesTouch(a: PageBox, b: PageBox): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

function clearBackgroundMatches(glyphRuns: Array<TextGlyphEvidence[] | undefined>): void {
  for (const run of glyphRuns) for (const glyph of run ?? []) delete glyph.matchesBackground;
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

function gStateNumber(value: unknown, key: string): number | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (!Array.isArray(entry) || entry[0] !== key) continue;
    const number = entry[1];
    if (typeof number === 'number' && Number.isFinite(number)) return number;
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

function isAxisAlignedTransform([a, b, c, d]: Matrix6): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const nearZero = (value: number): boolean => Math.abs(value) <= Number.EPSILON * scale * 16;
  return (nearZero(b) && nearZero(c)) || (nearZero(a) && nearZero(d));
}

function matrix6(value: unknown): Matrix6 | undefined {
  if (!Array.isArray(value) || value.length !== 6) return undefined;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return value as Matrix6;
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
