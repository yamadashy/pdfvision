import type { OpaqueFillTextOps } from './opaqueFillText.js';
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
  type TextGlyphOps,
  type TextState,
} from './textGlyphs.js';

/**
 * Page text under small regions (link rectangles, markup-annotation quads),
 * read glyph by glyph from the operator list.
 *
 * pdf.js text content merges a sentence into one item even when one word
 * of it is a link, so clipping items by proportion attributes neighbouring
 * words (or the neighbouring link's word) to the region. Glyph advances say
 * exactly which characters a rectangle covers.
 */
export type RegionGlyphOps = Pick<
  OpaqueFillTextOps,
  | keyof TextGlyphOps
  | 'save'
  | 'restore'
  | 'transform'
  | 'formBegin'
  | 'formEnd'
  | 'beginAnnotation'
  | 'endAnnotation'
  | 'textShowOps'
>;

export interface RegionGlyphTextIndex {
  /**
   * Text whose glyph centres fall inside any of `boxes`, or undefined when
   * none do or when the page's text could not be placed reliably.
   */
  textIn(boxes: readonly PageBox[]): string | undefined;
}

interface PlacedGlyph extends GlyphGeometry {
  order: number;
}

const SPACE_GAP_EM = 0.15;
const SAME_LINE_EM = 0.5;
const DUPLICATE_EM = 0.1;
const MAX_REGIONS = 4_096;
const RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

export function buildRegionGlyphTextIndex(
  fnArray: readonly number[],
  argsArray: readonly unknown[][],
  ops: RegionGlyphOps,
  regions: readonly PageBox[],
  pageHeight: number,
  viewMinX: number,
  viewMinY: number,
  resolveFont?: FontGeometryResolver,
): RegionGlyphTextIndex | undefined {
  if (regions.length === 0 || regions.length > MAX_REGIONS) return undefined;
  const glyphs: PlacedGlyph[] = [];
  let ctm: Matrix6 = [1, 0, 0, 1, 0, 0];
  let text: TextState = initialTextState();
  let annotationDepth = 0;
  const stack: Array<{ ctm: Matrix6; text: TextState }> = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === ops.beginAnnotation) {
      annotationDepth++;
      continue;
    }
    if (fn === ops.endAnnotation) {
      annotationDepth = Math.max(0, annotationDepth - 1);
      continue;
    }
    // Appearance streams (a FreeText box, a stamp) are not page text under a link.
    if (annotationDepth > 0) continue;
    if (applyTextStateOp(text, fn, args, ops)) continue;

    if (fn === ops.save) {
      stack.push({ ctm: [...ctm] as Matrix6, text: cloneTextState(text) });
    } else if (fn === ops.restore || fn === ops.formEnd) {
      const restored = stack.pop();
      if (restored) {
        ctm = restored.ctm;
        text = restored.text;
      }
    } else if (fn === ops.transform) {
      const matrix = matrix6(args);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (fn === ops.formBegin) {
      stack.push({ ctm: [...ctm] as Matrix6, text: cloneTextState(text) });
      const matrix = matrix6(args?.[0]);
      if (matrix) ctm = multiply(ctm, matrix);
    } else if (ops.textShowOps.has(fn)) {
      const placement = advanceRun(text, args?.[0], ctm, resolveFont, pageHeight, viewMinX, viewMinY);
      if (!placement) {
        // An unplaceable run could sit inside any region; answering from the
        // runs that did place would silently drop its characters.
        if (hasVisibleText(args?.[0])) return undefined;
        continue;
      }
      if (!regions.some((region) => boxesTouch(region, placement.box))) continue;
      for (const glyph of placeRunGlyphs(placement, pageHeight, viewMinX, viewMinY)) {
        glyphs.push({ ...glyph, order: glyphs.length });
      }
    }
  }

  return { textIn: (boxes) => regionText(glyphs, boxes) };
}

function regionText(glyphs: readonly PlacedGlyph[], boxes: readonly PageBox[]): string | undefined {
  const inside: PlacedGlyph[] = [];
  for (const glyph of glyphs) {
    const cx = glyph.box.x + glyph.box.width / 2;
    const cy = glyph.box.y + glyph.box.height / 2;
    if (!boxes.some((box) => cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height)) {
      continue;
    }
    // Fake bold and shadowed text draw the same glyph twice in place.
    if (inside.some((seen) => isDuplicate(seen, glyph))) continue;
    inside.push(glyph);
  }
  if (inside.every((glyph) => glyph.whitespace)) return undefined;

  const lines = groupLines(inside);
  const rtl = inside.some((glyph) => RTL_SCRIPT.test(glyph.text));
  let out = '';
  for (const line of lines) {
    line.sort((a, b) => (rtl ? b.box.x - a.box.x : a.box.x - b.box.x) || a.order - b.order);
    const lineText = joinLine(line, rtl);
    if (lineText.length === 0) continue;
    out = out.length === 0 ? lineText : joinLines(out, lineText);
  }
  const trimmed = out.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function groupLines(glyphs: readonly PlacedGlyph[]): PlacedGlyph[][] {
  const lines: Array<{ center: number; em: number; glyphs: PlacedGlyph[] }> = [];
  const byY = [...glyphs].sort((a, b) => centerY(a) - centerY(b) || a.order - b.order);
  for (const glyph of byY) {
    const line = lines.find((candidate) => Math.abs(candidate.center - centerY(glyph)) <= SAME_LINE_EM * candidate.em);
    if (line) line.glyphs.push(glyph);
    else lines.push({ center: centerY(glyph), em: Math.max(glyph.em, 0.001), glyphs: [glyph] });
  }
  return lines.map((line) => line.glyphs);
}

function joinLine(line: readonly PlacedGlyph[], rtl: boolean): string {
  let out = '';
  let previous: PlacedGlyph | undefined;
  for (const glyph of line) {
    if (previous && !previous.whitespace && !glyph.whitespace) {
      const gap = rtl
        ? previous.box.x - (glyph.box.x + glyph.box.width)
        : glyph.box.x - (previous.box.x + previous.box.width);
      if (gap > SPACE_GAP_EM * Math.max(previous.em, glyph.em)) out += ' ';
    }
    out += glyph.whitespace ? ' ' : glyph.text;
    previous = glyph;
  }
  return out.trim();
}

function joinLines(before: string, after: string): string {
  const last = Array.from(before).at(-1) ?? '';
  const first = Array.from(after)[0] ?? '';
  return CJK.test(last) && CJK.test(first) ? before + after : `${before} ${after}`;
}

function centerY(glyph: GlyphGeometry): number {
  return glyph.box.y + glyph.box.height / 2;
}

function isDuplicate(a: GlyphGeometry, b: GlyphGeometry): boolean {
  const tolerance = DUPLICATE_EM * Math.max(a.em, b.em);
  return a.text === b.text && Math.abs(a.box.x - b.box.x) <= tolerance && Math.abs(a.box.y - b.box.y) <= tolerance;
}

function hasVisibleText(glyphArgs: unknown): boolean {
  if (!Array.isArray(glyphArgs)) return false;
  return glyphArgs.some((glyph) => {
    const unicode = glyph && typeof glyph === 'object' ? (glyph as { unicode?: unknown }).unicode : undefined;
    return typeof unicode === 'string' && unicode.trim().length > 0;
  });
}

function boxesTouch(a: PageBox, b: PageBox): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

function matrix6(value: unknown): Matrix6 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as ArrayLike<unknown>;
  if (candidate.length !== 6) return undefined;
  const matrix = Array.from(candidate);
  return matrix.every((item) => typeof item === 'number' && Number.isFinite(item)) ? (matrix as Matrix6) : undefined;
}
