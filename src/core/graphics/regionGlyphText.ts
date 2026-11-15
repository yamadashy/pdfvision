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
// Joined Arabic glyphs leave small gaps between advances that are not word breaks.
const RTL_SPACE_GAP_EM = 0.3;
const SAME_LINE_EM = 0.5;
const DUPLICATE_EM = 0.1;
const MAX_REGIONS = 4_096;
const RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u;
const COMBINING_MARKS = /^\p{M}+$/u;
const LTR_STRONG = /[\p{Number}\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
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
  const nearRegions = regions.map((region) => ({
    x: region.x - region.height,
    y: region.y,
    width: region.width + 2 * region.height,
    height: region.height,
  }));

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
      // A run just past a region can still hold a combining mark of a glyph inside it.
      if (!nearRegions.some((region) => boxesTouch(region, placement.box))) continue;
      for (const glyph of placeRunGlyphs(placement, pageHeight, viewMinX, viewMinY)) {
        glyphs.push({ ...glyph, order: glyphs.length });
      }
    }
  }

  const clusters = buildClusters(glyphs);
  return { textIn: (boxes) => regionText(clusters, boxes) };
}

/**
 * A base glyph with the combining marks drawn right after it (Thai tone
 * marks, Devanagari signs, Arabic harakat). Marks have little or no advance
 * and are often kerned back over the base, so they take the base's position
 * for membership, ordering, and spacing.
 */
interface GlyphCluster {
  base: PlacedGlyph;
  text: string;
  box: PageBox;
  whitespace: boolean;
  em: number;
  order: number;
  lastOrder: number;
}

function buildClusters(glyphs: readonly PlacedGlyph[]): GlyphCluster[] {
  const clusters: GlyphCluster[] = [];
  for (const glyph of glyphs) {
    const previous = clusters.at(-1);
    if (previous && COMBINING_MARKS.test(glyph.text) && attachesTo(previous, glyph)) {
      previous.text += glyph.text;
      previous.box = unionBox(previous.box, glyph.box);
      previous.lastOrder = glyph.order;
      continue;
    }
    clusters.push({
      base: glyph,
      text: glyph.text,
      box: glyph.box,
      // pdf.js flags a glyph as a space by its code (32), and a subset font can draw any letter at code 32.
      whitespace: glyph.text.trim().length === 0,
      em: glyph.em,
      order: glyph.order,
      lastOrder: glyph.order,
    });
  }
  return clusters;
}

function attachesTo(cluster: GlyphCluster, mark: PlacedGlyph): boolean {
  const em = Math.max(cluster.em, mark.em);
  return (
    !cluster.whitespace &&
    mark.order === cluster.lastOrder + 1 &&
    Math.abs(centerY(cluster.base) - centerY(mark)) <= SAME_LINE_EM * em &&
    mark.box.x >= cluster.box.x - em &&
    mark.box.x <= cluster.box.x + cluster.box.width + em
  );
}

function regionText(clusters: readonly GlyphCluster[], boxes: readonly PageBox[]): string | undefined {
  const inside: GlyphCluster[] = [];
  for (const cluster of clusters) {
    const { box } = cluster.base;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    if (!boxes.some((b) => cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height)) continue;
    // Fake bold and shadowed text draw the same glyph twice in place.
    if (inside.some((seen) => isDuplicate(seen, cluster))) continue;
    inside.push(cluster);
  }
  if (inside.every((cluster) => cluster.whitespace)) return undefined;

  const lines = groupLines(inside);
  const rtl = inside.some((cluster) => RTL_SCRIPT.test(cluster.text));
  let out = '';
  for (const line of lines) {
    line.sort((a, b) => (rtl ? b.base.box.x - a.base.box.x : a.base.box.x - b.base.box.x) || a.order - b.order);
    const lineText = joinLine(line, rtl);
    if (lineText.length === 0) continue;
    out = out.length === 0 ? lineText : joinLines(out, lineText);
  }
  const trimmed = out.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function groupLines(clusters: readonly GlyphCluster[]): GlyphCluster[][] {
  const lines: Array<{ center: number; em: number; clusters: GlyphCluster[] }> = [];
  const byY = [...clusters].sort((a, b) => centerY(a.base) - centerY(b.base) || a.order - b.order);
  for (const cluster of byY) {
    const center = centerY(cluster.base);
    const line = lines.find((candidate) => Math.abs(candidate.center - center) <= SAME_LINE_EM * candidate.em);
    if (line) line.clusters.push(cluster);
    else lines.push({ center, em: Math.max(cluster.em, 0.001), clusters: [cluster] });
  }
  return lines.map((line) => line.clusters);
}

interface Piece {
  text: string;
  /** A digit or a letter of a left-to-right script. */
  ltr: boolean;
  /** Not right-to-left: may sit inside an embedded left-to-right run. */
  neutral: boolean;
}

const SPACE_PIECE: Piece = { text: ' ', ltr: false, neutral: true };

function joinLine(line: readonly GlyphCluster[], rtl: boolean): string {
  const pieces: Piece[] = [];
  let previous: GlyphCluster | undefined;
  for (const cluster of line) {
    if (previous && !previous.whitespace && !cluster.whitespace) {
      const gap = rtl
        ? previous.box.x - (cluster.box.x + cluster.box.width)
        : cluster.box.x - (previous.box.x + previous.box.width);
      if (gap > (rtl ? RTL_SPACE_GAP_EM : SPACE_GAP_EM) * Math.max(previous.em, cluster.em)) pieces.push(SPACE_PIECE);
    }
    const text = rtl ? rtlClusterText(cluster) : cluster.text;
    pieces.push(
      cluster.whitespace ? SPACE_PIECE : { text, ltr: LTR_STRONG.test(text), neutral: !RTL_SCRIPT.test(text) },
    );
    previous = cluster;
  }
  return (rtl ? restoreLtrRuns(pieces) : pieces)
    .map((piece) => piece.text)
    .join('')
    .trim();
}

/**
 * A right-to-left ligature glyph (lam-alef) carries its characters in
 * visual order, so reading the line right to left needs them reversed;
 * combining marks after the base stay where they are.
 */
function rtlClusterText(cluster: GlyphCluster): string {
  const base = Array.from(cluster.base.text);
  if (base.length < 2 || !RTL_SCRIPT.test(cluster.base.text)) return cluster.text;
  return base.reverse().join('') + cluster.text.slice(cluster.base.text.length);
}

/**
 * An RTL line read right to left reverses any embedded number or Latin
 * word (`3200` comes out `0023`); put each such run back in its own order.
 */
function restoreLtrRuns(pieces: readonly Piece[]): Piece[] {
  const out = [...pieces];
  let i = 0;
  while (i < out.length) {
    if (!out[i].ltr) {
      i++;
      continue;
    }
    let end = i;
    for (let j = i + 1; j < out.length && out[j].neutral; j++) if (out[j].ltr) end = j;
    out.splice(i, end - i + 1, ...out.slice(i, end + 1).reverse());
    i = end + 1;
  }
  return out;
}

function joinLines(before: string, after: string): string {
  const last = Array.from(before).at(-1) ?? '';
  const first = Array.from(after)[0] ?? '';
  return CJK.test(last) && CJK.test(first) ? before + after : `${before} ${after}`;
}

function centerY(glyph: GlyphGeometry): number {
  return glyph.box.y + glyph.box.height / 2;
}

function unionBox(a: PageBox, b: PageBox): PageBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function isDuplicate(a: GlyphCluster, b: GlyphCluster): boolean {
  const tolerance = DUPLICATE_EM * Math.max(a.em, b.em);
  return (
    a.text === b.text &&
    Math.abs(a.base.box.x - b.base.box.x) <= tolerance &&
    Math.abs(a.base.box.y - b.base.box.y) <= tolerance
  );
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
