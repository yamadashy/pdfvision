import type { LineBand, LineGlyph, LineGlyphLookup } from '../graphics/lineGlyphs.js';
import { isCjkGlyph, isCjkPunctuation, readJustifiedCjkLine, type TextLine, uprightTextLines } from './justifiedCjk.js';
import { readTrackedLetters } from './positionedLetters.js';
import {
  isRawTextItem,
  isWhitespaceItem,
  type RawTextItem,
  type UprightGeometry,
  uprightGeometry,
  withTextAndExtent,
} from './textItems.js';

/**
 * Rejoin text spread glyph by glyph with no record in the operator list of
 * why: a justified CJK line, and a heading letter-spaced by placing each
 * letter on its own.
 *
 * Both reach text content looking the same as text that really is
 * separate. pdf.js reads each gap past ~0.1 em as a space, and past ~0.6 em
 * gives each glyph an item of its own, so the line arrives as
 * `し た タ イ ト ル` or `B A C K` — one item with spaces inside,
 * single-glyph items, or both. What tells them apart is where the glyphs
 * were drawn, which the operator list replays (lineGlyphs.ts): equal gaps
 * between glyphs of different widths, no space glyph between them, and for
 * a CJK line a tightly set neighbour spanning the same measure
 * (justifiedCjk.ts, positionedLetters.ts).
 */

/** One space-separated token of an item: a glyph, or a word pdf.js kept whole. */
export interface Unit {
  text: string;
  /** A single glyph, or a CJK glyph with the punctuation set against it (`り、`). */
  glyph: boolean;
  cjk: boolean;
  left: number;
  right: number;
}

/** What lies between two units. */
export interface Boundary {
  gap: number;
  /** A space glyph was drawn between them. */
  spaceGlyph: boolean;
}

export interface MeasuredRun {
  units: Unit[];
  boundaries: Boundary[];
  fontSize: number;
  baseline: number;
  /** The same run glyph by glyph, when the glyphs could be placed. */
  letters?: MeasuredRun;
}

interface Token {
  text: string;
  glyph: boolean;
  cjk: boolean;
}

interface Piece {
  index: number;
  item: RawTextItem;
  geometry: UprightGeometry;
  tokens: Token[];
}

const SAME_BASELINE_EM = 0.05;
const SAME_SIZE_RATIO = 0.03;
const MIN_CANDIDATE_GLYPHS = 4;
const MIN_CANDIDATE_CJK = 6;
const MATCH_MARGIN_EM = 0.25;

export function joinJustifiedGlyphRuns(items: readonly unknown[], lineGlyphs?: LineGlyphLookup): unknown[] {
  const runs = findSpreadRuns(items).filter(isCandidate);
  if (runs.length === 0) return [...items];
  const glyphs = lineGlyphs ? lineGlyphs(runs.map(runBand)) : [];
  let neighbours: TextLine[] | undefined;
  const lines = () => {
    neighbours ??= uprightTextLines(items);
    return neighbours;
  };
  const replace = new Map<number, RawTextItem>();
  const drop = new Set<number>();
  runs.forEach((run, i) => {
    const measured = measureRun(run, glyphs[i]);
    if (!measured) return;
    const text = readJustifiedCjkLine(measured, lines()) ?? (measured.letters && readTrackedLetters(measured.letters));
    if (text === undefined) return;
    const first = run[0];
    const last = run[run.length - 1];
    const merged = withTextAndExtent(first.item, text, first.geometry.left, last.geometry.right);
    replace.set(first.index, { ...merged, hasEOL: !!last.item.hasEOL });
    for (let index = first.index + 1; index <= last.index; index++) drop.add(index);
  });
  if (replace.size === 0) return [...items];
  return items.flatMap((item, index) => {
    const replacement = replace.get(index);
    if (replacement) return [replacement];
    return drop.has(index) ? [] : [item];
  });
}

function findSpreadRuns(items: readonly unknown[]): Piece[][] {
  const runs: Piece[][] = [];
  let run: Piece[] = [];
  const flush = () => {
    if (run.length > 0) runs.push(run);
    run = [];
  };
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!isRawTextItem(item)) continue;
    // Separators pdf.js put between the glyphs; a line break ends the run.
    if (item.str.length === 0 || isWhitespaceItem(item)) {
      if (item.hasEOL) flush();
      continue;
    }
    const geometry = uprightGeometry(item);
    const tokens = geometry ? spacedTokens(item.str.trim()) : undefined;
    const piece = geometry && tokens ? { index, item, geometry, tokens } : undefined;
    const prev = run.at(-1);
    if (piece && prev && !continuesRun(prev, piece)) flush();
    if (piece) run.push(piece);
    else flush();
    if (item.hasEOL) flush();
  }
  flush();
  return runs;
}

/**
 * The tokens of an item that is a single glyph or a sequence of tokens
 * pdf.js spaced apart; undefined when CJK glyphs inside it touch, as they
 * do in any line that is not spread.
 */
function spacedTokens(text: string): Token[] | undefined {
  const parts = text.split(' ');
  if (parts.some((part) => part.length === 0)) return undefined;
  const tokens: Token[] = [];
  for (const part of parts) {
    const chars = Array.from(part);
    const cjk = chars.filter((char) => isCjkGlyph(char));
    const glyph = chars.length === 1 || (chars.length === 2 && cjk.length === 2 && chars.some(isCjkPunctuation));
    if (!glyph && cjk.some((char) => !isCjkPunctuation(char))) return undefined;
    tokens.push({ text: part, glyph, cjk: glyph && cjk.length > 0 });
  }
  return tokens;
}

function continuesRun(prev: Piece, cur: Piece): boolean {
  const size = prev.geometry.fontSize;
  return (
    cur.item.fontName === prev.item.fontName &&
    Math.abs(cur.geometry.fontSize - size) <= size * SAME_SIZE_RATIO &&
    Math.abs(cur.geometry.baseline - prev.geometry.baseline) <= size * SAME_BASELINE_EM &&
    cur.geometry.left > prev.geometry.left
  );
}

/** Enough spread CJK glyphs, or nothing but spread letters: worth measuring. */
function isCandidate(run: readonly Piece[]): boolean {
  const tokens = run.flatMap((piece) => piece.tokens);
  if (tokens.length < MIN_CANDIDATE_GLYPHS) return false;
  return (
    tokens.filter((token) => token.cjk).length >= MIN_CANDIDATE_CJK ||
    // pdf.js keeps two letters together where the gap between them falls short of its space threshold.
    (tokens.every((token) => /^\p{L}+$/u.test(token.text) && !token.cjk) &&
      tokens.filter((token) => Array.from(token.text).length <= 2).length * 2 >= tokens.length)
  );
}

function runBand(run: readonly Piece[]): LineBand {
  const { baseline, fontSize, left } = run[0].geometry;
  return { baseline, fontSize, left, right: run[run.length - 1].geometry.right };
}

/**
 * Units with the extents they were drawn at. A single-glyph item is its own
 * extent; a spaced item is measured from the replayed glyphs, and without
 * them (or when they do not spell the item) the run is left alone. With
 * the glyphs, the run is also measured glyph by glyph (`letters`), since
 * pdf.js may have kept two letters of a spread word together.
 */
function measureRun(run: readonly Piece[], glyphs: readonly LineGlyph[] | undefined): MeasuredRun | undefined {
  const size = run[0].geometry.fontSize;
  const drawn = glyphs ? run.map((piece) => drawnGlyphs(piece, glyphs, size)) : [];
  const units: Unit[] = [];
  for (const [i, piece] of run.entries()) {
    if (piece.tokens.length === 1) {
      units.push({ ...piece.tokens[0], left: piece.geometry.left, right: piece.geometry.right });
      continue;
    }
    const placed = drawn[i];
    if (!placed) return undefined;
    let at = 0;
    for (const token of piece.tokens) {
      const length = Array.from(token.text).length;
      units.push({ ...token, left: placed[at].left, right: placed[at + length - 1].right });
      at += length;
    }
  }
  const measured: MeasuredRun = {
    ...withBoundaries(units, glyphs, size),
    fontSize: size,
    baseline: run[0].geometry.baseline,
  };
  if (glyphs && drawn.every((placed) => placed !== undefined)) {
    const letters = drawn.flat().map((glyph) => ({
      text: glyph.text,
      glyph: true,
      cjk: isCjkGlyph(glyph.text),
      left: glyph.left,
      right: glyph.right,
    }));
    measured.letters = { ...withBoundaries(letters, glyphs, size), fontSize: size, baseline: measured.baseline };
  }
  return measured;
}

function withBoundaries(units: Unit[], glyphs: readonly LineGlyph[] | undefined, size: number) {
  const boundaries = units.slice(1).map((unit, i) => ({
    gap: unit.left - units[i].right,
    spaceGlyph: !!glyphs?.some(
      (glyph) => glyph.whitespace && glyph.left >= units[i].right - 0.01 * size && glyph.left < unit.left,
    ),
  }));
  return { units, boundaries };
}

/** The glyphs drawn for a piece, in order, or undefined when they do not spell it one glyph per character. */
function drawnGlyphs(piece: Piece, glyphs: readonly LineGlyph[], size: number): LineGlyph[] | undefined {
  const { left, right } = piece.geometry;
  const inside = glyphs
    .filter((glyph) => !glyph.whitespace && glyph.left >= left - MATCH_MARGIN_EM * size && glyph.left < right)
    .sort((a, b) => a.left - b.left);
  // pdf.js may expand one glyph into several characters (ligatures); units are built on glyph order.
  if (inside.some((glyph) => Array.from(glyph.text).length !== 1)) return undefined;
  if (inside.map((glyph) => glyph.text).join('') !== piece.tokens.map((token) => token.text).join('')) return undefined;
  return inside;
}
