import type { RegionGlyphOps } from './regionGlyphText.js';
import {
  advanceRun,
  applyTextStateOp,
  cloneTextState,
  type FontGeometryResolver,
  initialTextState,
  type Matrix6,
  multiply,
  type TextState,
} from './textGlyphs.js';

/**
 * Where each glyph on a few text lines was drawn, replayed from the
 * operator list.
 *
 * pdf.js text content reports a line it merged as one item and turns every
 * gap past ~0.1 em into a space, so `B A C K` does not say whether the
 * gaps were equal, whether a space glyph was drawn, or how wide each glyph
 * is. The letter-spacing passes ask for that only on the few lines they
 * suspect, in PDF user space, the frame text items use.
 */

export interface LineBand {
  baseline: number;
  left: number;
  right: number;
  fontSize: number;
}

export interface LineGlyph {
  text: string;
  /** A space glyph, or one that draws nothing. */
  whitespace: boolean;
  left: number;
  /** Left plus the glyph's own advance, without character or word spacing. */
  right: number;
}

/** Glyphs drawn on each band, in drawing order; undefined for a band none could be placed on. */
export type LineGlyphLookup = (bands: readonly LineBand[]) => (LineGlyph[] | undefined)[];

const SAME_BASELINE_EM = 0.1;
const BAND_MARGIN_EM = 1;
const UPRIGHT_SKEW = 1e-3;

interface GlyphFields {
  unicode?: unknown;
  width?: unknown;
  isSpace?: unknown;
}

export function createLineGlyphLookup(
  fnArray: readonly number[],
  argsArray: readonly unknown[],
  ops: RegionGlyphOps,
  resolveFont?: FontGeometryResolver,
): LineGlyphLookup {
  return (bands) => {
    const found: LineGlyph[][] = bands.map(() => []);
    if (bands.length === 0) return [];
    let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
    let text: TextState = initialTextState();
    let annotationDepth = 0;
    const stack: Array<{ ctm: Matrix6; text: TextState }> = [];
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i] as unknown[] | undefined;
      if (fn === ops.beginAnnotation) {
        annotationDepth++;
        continue;
      }
      if (fn === ops.endAnnotation) {
        annotationDepth = Math.max(0, annotationDepth - 1);
        continue;
      }
      if (annotationDepth > 0 || applyTextStateOp(text, fn, args, ops)) continue;
      if (fn === ops.save || fn === ops.formBegin) {
        stack.push({ ctm: [...ctm] as Matrix6, text: cloneTextState(text) });
        const matrix = fn === ops.formBegin ? matrix6(args?.[0]) : undefined;
        if (matrix) ctm = multiply(ctm, matrix);
      } else if (fn === ops.restore || fn === ops.formEnd) {
        const restored = stack.pop();
        if (restored) ({ ctm, text } = restored);
      } else if (fn === ops.transform) {
        const matrix = matrix6(args);
        if (matrix) ctm = multiply(ctm, matrix);
      } else if (ops.textShowOps.has(fn)) {
        const run = advanceRun(text, args?.[0], ctm, resolveFont, 0, 0, 0);
        if (run) placeOnBands(run, bands, found);
      }
    }
    return found.map((glyphs) => (glyphs.length > 0 ? glyphs : undefined));
  };
}

function placeOnBands(
  run: NonNullable<ReturnType<typeof advanceRun>>,
  bands: readonly LineBand[],
  found: LineGlyph[][],
): void {
  const [a, b, c, d, e, f] = run.matrix;
  if (!(a > 0) || !(d > 0) || Math.abs(b) > a * UPRIGHT_SKEW || Math.abs(c) > d * UPRIGHT_SKEW) return;
  const baseline = d * run.baseline + f;
  // Box is in (x, -y) page coordinates for a zero-height page.
  const runLeft = run.box.x;
  const runRight = run.box.x + run.box.width;
  const targets = bands
    .map((band, index) => ({ band, index }))
    .filter(
      ({ band }) =>
        Math.abs(baseline - band.baseline) <= band.fontSize * SAME_BASELINE_EM &&
        runRight >= band.left - band.fontSize * BAND_MARGIN_EM &&
        runLeft <= band.right + band.fontSize * BAND_MARGIN_EM,
    );
  if (targets.length === 0) return;
  let x = 0;
  for (const glyph of run.glyphArgs) {
    if (typeof glyph === 'number') {
      x -= (glyph * run.fontSize) / 1000;
      continue;
    }
    if (!glyph || typeof glyph !== 'object') continue;
    const { unicode, width, isSpace } = glyph as GlyphFields;
    const own = (width as number) * run.widthAdvanceScale;
    const left = a * (run.startX + x * run.hScale) + c * run.baseline + e;
    const glyphText = typeof unicode === 'string' ? unicode : '';
    const placed = {
      text: glyphText,
      whitespace: isSpace === true || glyphText.trim().length === 0,
      left,
      right: left + a * own * run.hScale,
    };
    for (const { index } of targets) found[index].push(placed);
    x += own + (isSpace === true ? run.wordSpacing : 0) + run.charSpacing;
  }
}

function matrix6(value: unknown): Matrix6 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = Array.from(value as ArrayLike<unknown>);
  return candidate.length === 6 && candidate.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? (candidate as Matrix6)
    : undefined;
}
